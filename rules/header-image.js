import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {lintRule} from 'unified-lint-rule';
import {visit} from 'unist-util-visit';

// The ratio from the issue: an image must be at least twice its display size in each axis
const MINIMUM_PIXEL_RATIO = 2;

const BADGE_SOURCE_URLS = new Set([
	'https://awesome.re/badge.svg',
	'https://awesome.re/badge-flat.svg',
	'https://awesome.re/badge-flat2.svg',
]);

const BADGE_URL_PATTERN = /badge|shields\.io/i;

// Dimensions from a PNG header
const readPngDimensions = buffer => {
	if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
		return;
	}

	return {
		width: buffer.readUInt32BE(16),
		height: buffer.readUInt32BE(20),
	};
};

// Dimensions from a JPEG header. Walk the segment chain to the first start-of-frame.
const readJpegDimensions = buffer => {
	if (buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
		return;
	}

	let offset = 2;
	while (offset < buffer.length) {
		if (buffer[offset] !== 0xFF) {
			offset++;
			continue;
		}

		const marker = buffer[offset + 1];
		offset += 2;

		// Start of scan; frame headers are behind us by now
		if (marker === 0xD9 || marker === 0xDA) {
			return;
		}

		const segmentLength = buffer.readUInt16BE(offset);
		if (segmentLength < 2) {
			return;
		}

		// Any start-of-frame marker carries the dimensions
		if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker)) {
			return {
				height: buffer.readUInt16BE(offset + 3),
				width: buffer.readUInt16BE(offset + 5),
			};
		}

		offset += segmentLength;
	}
};

const readImageDimensions = filePath => {
	let buffer;
	try {
		buffer = fs.readFileSync(filePath);
	} catch {
		return;
	}

	return readPngDimensions(buffer) ?? readJpegDimensions(buffer);
};

// An image is a badge when it is the Awesome badge or comes from a badge host
const isBadgeUrl = url => BADGE_SOURCE_URLS.has(url) || BADGE_URL_PATTERN.test(url);

const isSvgUrl = url => url.toLowerCase().split(/[?#]/)[0].endsWith('.svg');

const isHiDpiFilename = url => {
	const pathWithoutQuery = url.toLowerCase().split(/[?#]/)[0];
	return /@2x|\D2x\./.test(pathWithoutQuery);
};

/**
Collect the images that act as the list header.

Two shapes exist in the wild: a level-1 heading with an inline image, and a raw HTML
block at the very top holding `<img>` tags. Both are collected with the display size
declared in the HTML where present.
*/
const collectHeaderImages = ast => {
	const images = [];

	const firstChild = ast.children?.[0];
	if (firstChild?.type === 'html') {
		for (const match of firstChild.value.matchAll(/<img\s[^>]*>/gi)) {
			const tag = match[0];
			const url = /src\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
			const width = Number.parseInt(/width\s*=\s*["']?(\d+)/i.exec(tag)?.[1], 10);
			const height = Number.parseInt(/height\s*=\s*["']?(\d+)/i.exec(tag)?.[1], 10);

			images.push({
				url,
				width: Number.isNaN(width) ? undefined : width,
				height: Number.isNaN(height) ? undefined : height,
			});
		}
	}

	if (images.length > 0) {
		return images;
	}

	visit(ast, 'heading', (node, index) => {
		if (index !== 0 || node.depth !== 1) {
			return;
		}

		for (const child of node.children) {
			const candidates = child.type === 'link' ? child.children : [child];
			for (const candidate of candidates) {
				if (candidate.type === 'image') {
					images.push({url: candidate.url});
				}
			}
		}

		return visit.EXIT;
	});

	return images;
};

const headerImageRule = lintRule('remark-lint:awesome-header-image', (ast, file) => {
	// Only the first non-badge image is the header; later images are sponsors, logos, etc.
	const headerImage = collectHeaderImages(ast).find(({url}) => url && !isBadgeUrl(url));
	if (!headerImage) {
		return;
	}

	if (isSvgUrl(headerImage.url) || isHiDpiFilename(headerImage.url)) {
		return;
	}

	// A local raster can still qualify when its pixels are twice the size it is displayed at
	const {width, height} = headerImage;
	if (width && height && !headerImage.url.startsWith('http')) {
		const filePath = path.resolve(path.dirname(file.path ?? process.cwd()), decodeURI(headerImage.url));
		const dimensions = readImageDimensions(filePath);

		if (dimensions && dimensions.width >= width * MINIMUM_PIXEL_RATIO && dimensions.height >= height * MINIMUM_PIXEL_RATIO) {
			return;
		}
	}

	file.message('Header image must be an SVG or high-DPI, such as an @2x file or a raster at least twice its display size', ast);
});

export default headerImageRule;

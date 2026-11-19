import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import remarkLint from 'remark-lint';
import lint from '../_lint.js';
import headerImageRule from '../../rules/header-image.js';

describe('rules › header-image', () => {
	const config = {
		plugins: [
			remarkLint,
			headerImageRule,
		],
	};

	it('header image - low resolution raster', async () => {
		const messages = await lint({config, filename: 'test/fixtures/header-image/error-1x-html.md'});
		assert.deepEqual(messages, [
			{
				line: 1,
				ruleId: 'awesome-header-image',
				message: 'Header image must be an SVG or high-DPI, such as an @2x file or a raster at least twice its display size',
			},
		]);
	});

	it('header image - svg', async () => {
		const messages = await lint({config, filename: 'test/fixtures/header-image/success-svg.md'});
		assert.deepEqual(messages, []);
	});

	it('header image - raster at twice the declared size', async () => {
		const messages = await lint({config, filename: 'test/fixtures/header-image/success-2x-dimensions.md'});
		assert.deepEqual(messages, []);
	});

	it('header image - @2x filename', async () => {
		const messages = await lint({config, filename: 'test/fixtures/header-image/success-2x-filename.md'});
		assert.deepEqual(messages, []);
	});

	it('header image - no header image', async () => {
		const messages = await lint({config, filename: 'test/fixtures/header-image/success-no-header-image.md'});
		assert.deepEqual(messages, []);
	});

	it('header image - only the header image is checked', async () => {
		const messages = await lint({config, filename: 'test/fixtures/header-image/success-badge-then-later-image.md'});
		assert.deepEqual(messages, []);
	});
});

/**
 * @file
 * @author Tomáš Chochola <tomaschochola@tomaschochola.cz>
 * @copyright © 2026 Tomáš Chochola <tomaschochola@tomaschochola.cz>
 *
 * @license CC-BY-ND-4.0
 *
 * @see {@link https://creativecommons.org/licenses/by-nd/4.0/} License
 * @see {@link https://github.com/tomaschochola} GitHub Profile
 * @see {@link https://github.com/sponsors/tomaschochola} GitHub Sponsors
 */

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { writeOptimizedSvg } from '../src/svg.js';
import { temporaryDirectory } from './helpers.js';

async function transform(context, svg) {
    const directory = await temporaryDirectory(context, 'tooling-favicons-svg-');
    const output = join(directory, 'output.svg');
    const source = join(directory, 'source.svg');

    await writeFile(source, svg);
    await writeOptimizedSvg(source, output);

    return await readFile(output, 'utf8');
}

test('accepts static self-contained SVG and preserves internal references', async (context) => {
    const output = await transform(
        context,
        '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="paint"><stop offset="0" /></linearGradient></defs><style>.shape{fill:url(#paint)}</style><rect class="shape" width="10" height="10" /></svg>',
    );

    assert.match(output, /^<svg\b/u);
    assert.match(output, /id="paint"/u);
    assert.equal(await transform(context, '<svg/>'), '<svg/>');
});

test('preserves subpixel source geometry through optimization', async (context) => {
    const output = await transform(context, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M 0.123456 0.123456 L 0.987654 0.987654" /></svg>');

    assert.match(output, /\.123456/u);
});

test('rejects document control, active content, and external resources', async (context) => {
    const cases = [
        ['<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>', /document type/u],
        ['<?target value?><svg xmlns="http://www.w3.org/2000/svg"/>', /processing instructions/u],
        ['<svg xmlns="http://www.w3.org/2000/svg"><script /></svg>', /static and self-contained/u],
        ['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" />', /static and self-contained/u],
        ['<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://example.com/" />', /static and self-contained/u],
        ['<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.com/a.svg#a" /></svg>', /outside the document/u],
        ['<svg xmlns="http://www.w3.org/2000/svg"><style>@import "a.css"</style></svg>', /static and self-contained/u],
        ['<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[@keyframes a{}]]></style></svg>', /static and self-contained/u],
        ['<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(data:image/png;base64,x)" /></svg>', /static and self-contained/u],
    ];

    for (const [svg, message] of cases) {
        await assert.rejects(async () => await transform(context, svg), message);
    }
});

test('bounds SVG structural complexity', async (context) => {
    const elements = '<g/>'.repeat(100_001);

    await assert.rejects(async () => await transform(context, `<svg xmlns="http://www.w3.org/2000/svg">${elements}</svg>`), /must not exceed 100000 elements/u);
});

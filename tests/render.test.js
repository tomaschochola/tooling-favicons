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
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { assertColor, assertImageMetadata, assertSquareSource, renderPng } from '../src/render.js';
import { temporaryDirectory, writePng, writeSvg } from './helpers.js';

test('validates colors and square source metadata', async (context) => {
    const directory = await temporaryDirectory(context);
    const rectangular = join(directory, 'rectangular.png');
    const square = join(directory, 'square.png');

    await writePng(square);
    await writePng(rectangular, { height: 32, width: 64 });
    await assertColor('transparent');
    await assertColor('#ffffff', true);
    await assertSquareSource(square);
    await assert.rejects(async () => await assertColor('', false), /non-empty/u);
    await assert.rejects(async () => await assertColor(undefined), /non-empty/u);
    await assert.rejects(async () => await assertColor('not-a-color'), /valid Sharp color/u);
    await assert.rejects(async () => await assertColor('transparent', true), /must be opaque/u);
    await assert.rejects(async () => await assertColor('rgba(0, 0, 0, 0.5)'), /opaque or the literal/u);
    await assert.rejects(async () => await assertSquareSource(rectangular), /square canvas/u);

    assert.doesNotThrow(() => assertImageMetadata({ height: 1, width: 1 }));
    assert.throws(() => assertImageMetadata({ height: 1, pages: 2, width: 1 }), /Animated and multi-page/u);

    for (const metadata of [{ height: 1 }, { height: 0, width: 1 }, { height: 1, width: 0 }, { height: 1, width: 100_000_001 }, { height: 1.5, width: 1 }, { height: 100_000_001, width: 1 }]) {
        assert.throws(() => assertImageMetadata(metadata), /Decoded image/u);
    }
});

test('renders exact transparent and padded opaque PNG geometry', async (context) => {
    const directory = await temporaryDirectory(context);
    const source = join(directory, 'source.png');
    const transparent = join(directory, 'transparent.png');
    const padded = join(directory, 'padded.png');
    const pixels = Buffer.alloc(64 * 64 * 4);

    for (let index = 0; index < pixels.length; index += 1) {
        pixels[index] = (index * 47) % 256;
    }

    await sharp(pixels, { raw: { channels: 4, height: 64, width: 64 } })
        .png()
        .toFile(source);
    await renderPng({ background: 'transparent', canvasSize: 64, artworkSize: 64, output: transparent, source });
    assert.deepEqual(await sharp(transparent).raw().toBuffer(), pixels);

    await renderPng({ background: 'white', canvasSize: 65, artworkSize: 32, output: padded, source });
    const paddedPixels = await sharp(padded).raw().toBuffer();

    assert.deepEqual([...paddedPixels.subarray(0, 3)], [255, 255, 255]);
    assert.equal((await sharp(padded).metadata()).width, 65);
    assert.equal((await sharp(padded).stats()).isOpaque, true);
});

test('renders SVG at calculated and minimum rasterization densities', async (context) => {
    const directory = await temporaryDirectory(context);
    const large = join(directory, 'large.svg');
    const small = join(directory, 'small.svg');

    await writeSvg(small, { height: 1, width: 1 });
    await writeSvg(large, { height: 10_000, width: 10_000 });
    await renderPng({ background: 'transparent', canvasSize: 512, artworkSize: 512, output: join(directory, 'small.png'), source: small });
    await renderPng({ background: 'transparent', canvasSize: 16, artworkSize: 16, output: join(directory, 'large.png'), source: large });

    assert.equal((await sharp(join(directory, 'small.png')).metadata()).width, 512);
    assert.equal((await sharp(join(directory, 'large.png')).metadata()).width, 16);
});

test('rejects unsafe sizes, paths, and animated or oversized decoded sources', async (context) => {
    const directory = await temporaryDirectory(context);
    const source = join(directory, 'source.png');

    await writePng(source);

    const invalidOptions = [
        { canvasSize: 0, artworkSize: 1 },
        { canvasSize: 10_001, artworkSize: 1 },
        { canvasSize: 1.5, artworkSize: 1 },
        { canvasSize: 32, artworkSize: 64 },
    ];

    for (const options of invalidOptions) {
        await assert.rejects(async () => await renderPng({ background: 'white', output: join(directory, 'output.png'), source, ...options }), /invalid|exceed/u);
    }

    await assert.rejects(async () => await renderPng({ background: 'white', canvasSize: 64, artworkSize: 64, output: '', source }), /non-empty paths/u);
    await assert.rejects(async () => await renderPng({ background: 'white', canvasSize: 64, artworkSize: 64, output: join(directory, 'output.png'), source: '' }), /non-empty paths/u);

    const firstFrame = Buffer.from(Array(4).fill([255, 0, 0, 255]).flat());
    const secondFrame = Buffer.from(Array(4).fill([0, 0, 255, 255]).flat());
    const animated = await sharp(Buffer.concat([firstFrame, secondFrame]), { raw: { channels: 4, height: 4, pageHeight: 2, width: 2 } })
        .gif()
        .toBuffer();

    await writeFile(source, animated);
    await assert.rejects(async () => await renderPng({ background: 'transparent', canvasSize: 64, artworkSize: 64, output: join(directory, 'animated.png'), source }), /Animated and multi-page/u);
});

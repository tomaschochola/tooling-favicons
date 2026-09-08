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
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { generateIco, generatePng, generatePwa, generateWeb, workDirectory } from '../src/generate.js';
import { PublishBundleError } from '../src/publish.js';
import { colorBounds, temporaryDirectory, writePng, writeSvg } from './helpers.js';

test('generates the complete web set and supports dedicated Apple artwork', async (context) => {
    const directory = await temporaryDirectory(context);
    const apple = join(directory, 'apple.svg');
    const source = join(directory, 'source.svg');
    const output = join(directory, 'output');

    await writeSvg(source, { fill: '#ff0000' });
    await writeSvg(apple, { fill: '#0000ff' });
    await generateWeb({ appleBackground: 'white', appleSource: apple, outputDirectory: output, source });

    assert.deepEqual((await readdir(output)).sort(), ['apple-touch-icon.png', 'favicon-96x96.png', 'favicon.ico', 'favicon.svg']);
    assert.match(await readFile(join(output, 'favicon.svg'), 'utf8'), /^<svg\b/u);
    assert.deepEqual([...(await sharp(join(output, 'apple-touch-icon.png')).raw().toBuffer()).subarray(0, 3)], [0, 0, 255]);
    assert.equal((await sharp(join(output, 'apple-touch-icon.png')).stats()).isOpaque, true);

    const ico = await readFile(join(output, 'favicon.ico'));

    assert.equal(ico.readUInt16LE(4), 3);
    assert.deepEqual([ico.readUInt8(6), ico.readUInt8(22), ico.readUInt8(38)], [16, 32, 48]);

    await generateWeb({ appleBackground: '#ffffff', appleSource: source, outputDirectory: output, source });
    await generateWeb({ appleBackground: '#ffffff', outputDirectory: output, source });
});

test('reproduces byte-identical web outputs from identical inputs', async (context) => {
    const directory = await temporaryDirectory(context);
    const firstOutput = join(directory, 'first');
    const secondOutput = join(directory, 'second');
    const source = join(directory, 'source.svg');

    await writeSvg(source);
    await generateWeb({ appleBackground: 'white', outputDirectory: firstOutput, source });
    await generateWeb({ appleBackground: 'white', outputDirectory: secondOutput, source });

    const names = (await readdir(firstOutput)).sort();

    assert.deepEqual(names, (await readdir(secondOutput)).sort());

    for (const name of names) {
        assert.deepEqual(await readFile(join(firstOutput, name)), await readFile(join(secondOutput, name)));
    }
});

test('generates transparent ordinary and opaque maskable PWA sets with exact fit semantics', async (context) => {
    const directory = await temporaryDirectory(context);
    const source = join(directory, 'icon.svg');
    const maskableSource = join(directory, 'maskable.svg');
    const canvasOutput = join(directory, 'canvas-output');
    const safeOutput = join(directory, 'safe-output');

    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="25" y="25" width="50" height="50" fill="#ff0000" /></svg>');
    await writeSvg(maskableSource, { fill: '#0000ff' });
    await generatePwa({ maskableBackground: '#000000', maskableFit: 'canvas', maskableSource, outputDirectory: canvasOutput, source });
    await generatePwa({ maskableBackground: '#000000', maskableFit: 'safe', maskableSizes: [512], maskableSource, outputDirectory: safeOutput, sizes: [192], source });

    assert.deepEqual((await readdir(canvasOutput)).sort(), [
        'icon-1024x1024.png',
        'icon-192x192.png',
        'icon-384x384.png',
        'icon-512x512.png',
        'maskable-icon-1024x1024.png',
        'maskable-icon-512x512.png',
    ]);

    const ordinaryPixels = await sharp(join(canvasOutput, 'icon-512x512.png')).ensureAlpha().raw().toBuffer();
    const canvasPixels = await sharp(join(canvasOutput, 'maskable-icon-512x512.png')).raw().toBuffer();
    const safePixels = await sharp(join(safeOutput, 'maskable-icon-512x512.png')).raw().toBuffer();

    assert.deepEqual([...ordinaryPixels.subarray(0, 4)], [0, 0, 0, 0]);
    assert.deepEqual([...canvasPixels.subarray(0, 3)], [0, 0, 255]);
    assert.deepEqual(colorBounds(safePixels, 512, [0, 0, 255]), {
        maximumX: 399,
        maximumY: 399,
        minimumX: 112,
        minimumY: 112,
    });

    await assert.rejects(
        async () => await generatePwa({ maskableBackground: '#000000', maskableFit: 'safe', maskableSizes: [1], outputDirectory: join(directory, 'minimum'), sizes: [1], source }),
        /not representable/u,
    );
    await generatePwa({ maskableBackground: '#000000', maskableFit: 'safe', maskableSizes: [3], outputDirectory: join(directory, 'odd-safe-output'), sizes: [1], source });
});

test('preserves its work directory when publication recovery is required', async (context) => {
    const directory = await temporaryDirectory(context);
    let workDirectoryPath;

    await assert.rejects(
        async () =>
            await workDirectory(directory, (path) => {
                workDirectoryPath = path;

                throw new PublishBundleError([new Error('publish failed'), new Error('rollback failed')], 'recovery required');
            }),
        /recovery required/u,
    );

    assert.deepEqual(await readdir(workDirectoryPath), []);

    await assert.rejects(
        async () =>
            await workDirectory(directory, () => {
                throw new PublishBundleError([new Error('publish failed')], 'recovery not required');
            }),
        /recovery not required/u,
    );
});

test('replaces stale managed PWA files and preserves unrelated output', async (context) => {
    const directory = await temporaryDirectory(context);
    const outputDirectory = join(directory, 'output');
    const source = join(directory, 'source.svg');

    await writeSvg(source);
    await generatePwa({ maskableBackground: 'white', maskableFit: 'canvas', outputDirectory, source });
    await writeFile(join(outputDirectory, 'unrelated.txt'), 'preserve');
    await writeFile(join(outputDirectory, 'icon-invalid.png'), 'preserve');
    await generatePwa({ maskableBackground: 'white', maskableFit: 'canvas', maskableSizes: [512], outputDirectory, sizes: [256, 512], source });

    assert.deepEqual((await readdir(outputDirectory)).sort(), ['icon-256x256.png', 'icon-512x512.png', 'icon-invalid.png', 'maskable-icon-512x512.png', 'unrelated.txt']);
});

test('generates exact ICO and PNG outputs from SVG and raster sources', async (context) => {
    const directory = await temporaryDirectory(context);
    const png = join(directory, 'source.png');
    const svg = join(directory, 'source.svg');

    await writeSvg(svg);
    await writePng(png);
    await generateIco({ background: 'transparent', output: join(directory, 'default.ico'), source: svg });
    await generateIco({ background: 'white', output: join(directory, 'custom.ICO'), sizes: [16, 64, 256], source: png });
    await generatePng({ artworkSize: 64, background: 'transparent', canvasSize: 64, output: join(directory, 'raster.PNG'), source: png });
    await generatePng({ artworkSize: 32, background: 'white', canvasSize: 65, output: join(directory, 'vector.png'), source: svg });

    assert.equal((await sharp(join(directory, 'vector.png')).metadata()).width, 65);
    assert.equal((await readFile(join(directory, 'custom.ICO'))).readUInt16LE(4), 3);
});

test('rejects invalid contracts before publishing partial output', async (context) => {
    const directory = await temporaryDirectory(context);
    const png = join(directory, 'source.png');
    const rectangular = join(directory, 'rectangular.svg');
    const square = join(directory, 'square.svg');

    await writePng(png);
    await writeSvg(rectangular, { height: 50, width: 100 });
    await writeSvg(square);

    await assert.rejects(async () => await generateWeb({ appleBackground: 'white', outputDirectory: join(directory, 'web'), source: png }), /requires an SVG/u);
    await assert.rejects(async () => await generateWeb({ appleBackground: 'white', outputDirectory: join(directory, 'web'), source: rectangular }), /square canvas/u);
    await assert.rejects(
        async () => await generatePwa({ maskableBackground: 'white', maskableFit: 'invalid', outputDirectory: join(directory, 'pwa'), source: square }),
        /must be "canvas" or "safe"/u,
    );
    await assert.rejects(async () => await generatePwa({ maskableBackground: 'transparent', maskableFit: 'canvas', outputDirectory: join(directory, 'pwa'), source: square }), /must be opaque/u);
    await assert.rejects(
        async () => await generatePwa({ maskableBackground: 'white', maskableFit: 'canvas', maskableSource: square, outputDirectory: join(directory, 'pwa'), source: rectangular }),
        /square canvas/u,
    );
    await assert.rejects(
        async () => await generatePwa({ maskableBackground: 'white', maskableFit: 'canvas', maskableSource: rectangular, outputDirectory: join(directory, 'pwa'), source: square }),
        /square canvas/u,
    );

    for (const sizes of [null, [], [16, 16], [0], [10_001], [1.5]]) {
        const options = { maskableBackground: 'white', maskableFit: 'canvas', maskableSizes: [1], outputDirectory: join(directory, 'invalid-sizes'), sizes, source: square };

        await assert.rejects(async () => await generatePwa(options), /size|required/iu);
    }

    const blockedOutput = join(directory, 'blocked-output');

    await writeFile(blockedOutput, 'file');
    await assert.rejects(
        async () => await generatePwa({ maskableBackground: 'white', maskableFit: 'canvas', maskableSizes: [1], outputDirectory: blockedOutput, sizes: [1], source: square }),
        /ENOTDIR/u,
    );

    await assert.rejects(async () => await generateIco({ background: 'white', output: join(directory, 'favicon.png'), source: square }), /\.ico extension/u);
    await assert.rejects(async () => await generateIco({ background: 'white', output: join(directory, 'favicon.ico'), sizes: [257], source: square }), /no greater than 256/u);
    await assert.rejects(async () => await generatePng({ artworkSize: 64, background: 'white', canvasSize: 64, output: join(directory, 'icon.ico'), source: square }), /\.png extension/u);
});

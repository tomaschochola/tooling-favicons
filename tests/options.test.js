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
import test from 'node:test';
import { help, parseArguments } from '../src/options.js';

test('documents the complete preset and renderer contract', () => {
    assert.match(help, /tooling-favicons web FAVICON_SOURCE OUTPUT_DIRECTORY/u);
    assert.match(help, /tooling-favicons pwa ANY_SOURCE OUTPUT_DIRECTORY/u);
    assert.match(help, /tooling-favicons ico SOURCE OUTPUT/u);
    assert.match(help, /tooling-favicons png SOURCE OUTPUT/u);
    assert.match(help, /favicon\.svg, favicon\.ico, favicon-96x96\.png, and apple-touch-icon\.png/u);
    assert.match(help, /guaranteed maskable safe circle/u);

    for (const arguments_ of [['--help'], ['-h'], ['web', '--help'], ['pwa', '-h'], ['ico', '--help'], ['png', '-h']]) {
        assert.deepEqual(parseArguments(arguments_), { type: 'help' });
    }
});

test('parses complete and default web commands', () => {
    assert.deepEqual(parseArguments(['web', 'favicon.svg', 'public', '--apple-background', '#ffffff', '--apple-source', 'apple.png']), {
        appleBackground: '#ffffff',
        appleSource: 'apple.png',
        outputDirectory: 'public',
        source: 'favicon.svg',
        type: 'web',
    });

    assert.deepEqual(parseArguments(['web', 'favicon.svg', 'public', '--apple-background', 'white']), {
        appleBackground: 'white',
        outputDirectory: 'public',
        source: 'favicon.svg',
        type: 'web',
    });
});

test('parses complete and default PWA commands', () => {
    assert.deepEqual(
        parseArguments([
            'pwa',
            'icon.svg',
            'public',
            '--maskable-background',
            'white',
            '--maskable-fit',
            'safe',
            '--maskable-source',
            'maskable.svg',
            '--size',
            '512',
            '--size',
            '192',
            '--maskable-size',
            '1024',
            '--maskable-size',
            '512',
        ]),
        {
            maskableBackground: 'white',
            maskableFit: 'safe',
            maskableSizes: [512, 1024],
            maskableSource: 'maskable.svg',
            outputDirectory: 'public',
            sizes: [192, 512],
            source: 'icon.svg',
            type: 'pwa',
        },
    );

    assert.deepEqual(parseArguments(['pwa', 'icon.svg', 'public', '--maskable-background', 'black', '--maskable-fit', 'canvas']), {
        maskableBackground: 'black',
        maskableFit: 'canvas',
        outputDirectory: 'public',
        source: 'icon.svg',
        type: 'pwa',
    });
});

test('parses complete and default ICO commands', () => {
    assert.deepEqual(parseArguments(['ico', 'source.png', 'favicon.ico', '--background', 'transparent', '--size', '48', '--size', '16', '--size', '32']), {
        background: 'transparent',
        output: 'favicon.ico',
        sizes: [16, 32, 48],
        source: 'source.png',
        type: 'ico',
    });

    assert.deepEqual(parseArguments(['ico', 'source.svg', 'favicon.ico', '--background', 'transparent']), {
        background: 'transparent',
        output: 'favicon.ico',
        source: 'source.svg',
        type: 'ico',
    });
});

test('parses a complete PNG command', () => {
    assert.deepEqual(parseArguments(['png', 'source.svg', 'icon.png', '--background', 'transparent', '--canvas-size', '600', '--artwork-size', '590']), {
        artworkSize: 590,
        background: 'transparent',
        canvasSize: 600,
        output: 'icon.png',
        source: 'source.svg',
        type: 'png',
    });
});

const invalidArguments = [
    [[], /Expected a command/u],
    [['unknown'], /Unknown command/u],
    [['favicon'], /Unknown command/u],
    [['icon'], /Unknown command/u],
    [['web', '--unknown'], /Unknown option/u],
    [['web'], /Expected 2 positional arguments/u],
    [['web', '', 'output', '--apple-background', 'white'], /Positional arguments must not be empty/u],
    [['web', 'source.svg', 'output'], /--apple-background is required/u],
    [['web', 'source.svg', 'output', '--apple-background', 'white', '--apple-source', ''], /--apple-source is required/u],
    [['pwa', 'icon.svg', 'output', '--maskable-background', 'white'], /--maskable-fit is required/u],
    [['pwa', 'icon.svg', 'output', '--maskable-background', 'white', '--maskable-fit', 'source'], /must be "canvas" or "safe"/u],
    [['pwa', 'icon.svg', 'output', '--maskable-fit', 'safe'], /--maskable-background is required/u],
    [['pwa', 'icon.svg', 'output', '--maskable-background', 'white', '--maskable-fit', 'safe', '--maskable-source', ''], /--maskable-source is required/u],
    [['ico', 'source.svg', 'favicon.ico', '--background', 'transparent', '--size', '16', '--size', '16'], /must not be repeated/u],
    [['ico', 'source.svg', 'favicon.ico', '--background', 'transparent', '--size', '0'], /positive integer/u],
    [['ico', 'source.svg', 'favicon.ico', '--background', 'transparent', '--size', '9007199254740992'], /positive safe integer/u],
    [['png', 'source.svg', 'icon.png', '--background', 'white', '--canvas-size', '0', '--artwork-size', '1'], /positive integer/u],
    [['png', 'source.svg', 'icon.png', '--background', 'white', '--canvas-size', '9007199254740992', '--artwork-size', '1'], /positive safe integer/u],
    [['png', 'source.svg', 'icon.png', '--canvas-size', '64', '--artwork-size', '32'], /--background is required/u],
];

for (const [arguments_, expectation] of invalidArguments) {
    test(`rejects invalid arguments: ${arguments_.join(' ')}`, () => {
        assert.throws(() => parseArguments(arguments_), expectation);
    });
}

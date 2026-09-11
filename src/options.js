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

import { parseArgs } from 'node:util';

export const help = `Usage:
    tooling-favicons web FAVICON_SOURCE OUTPUT_DIRECTORY --apple-background COLOR [--apple-source SOURCE]
    tooling-favicons pwa ANY_SOURCE OUTPUT_DIRECTORY --maskable-background COLOR --maskable-fit canvas|safe [--maskable-source SOURCE] [--size SIZE]... [--maskable-size SIZE]...
    tooling-favicons ico SOURCE OUTPUT --background COLOR [--size SIZE]...
    tooling-favicons png SOURCE OUTPUT --background COLOR --canvas-size SIZE --artwork-size SIZE

Generate deterministic web, PWA, ICO, and PNG icon files.

Presets:
    web  Transactionally generate favicon.svg, favicon.ico, favicon-96x96.png, and apple-touch-icon.png
    pwa  Transactionally generate icon-SIZExSIZE.png and maskable-icon-SIZExSIZE.png files

Renderers:
    ico  Generate one multi-image ICO file
    png  Generate one square PNG with explicit canvas and artwork dimensions

Sources:
    SVG, PNG, JPEG, and JPG are supported; FAVICON_SOURCE must be SVG
    Web, PWA, Apple touch, and ICO sources must have square canvases
    SVG artwork must be static and self-contained; convert text to paths
    Concurrent commands must not target the same output directory

Colors:
    COLOR accepts an opaque Sharp-compatible color or the literal transparent
    Apple touch and maskable backgrounds must be opaque
    Web favicon and ordinary PWA outputs preserve source transparency

Defaults:
    web: favicon.ico=16,32,48; favicon PNG=96; Apple touch icon=180
    pwa: ordinary=192,384,512,1024; maskable=512,1024
    ico: sizes=16,32,48
    Omitted Apple and maskable sources reuse their command's primary source

Maskable fit:
    canvas  Map the complete source canvas to the complete output canvas
    safe    Fit the complete source canvas inside the guaranteed maskable safe circle

Options:
    --apple-background COLOR     Apple touch icon background
    --apple-source SOURCE        Dedicated Apple touch artwork
    --maskable-background COLOR  Maskable icon background
    --maskable-fit canvas|safe   Maskable source placement
    --maskable-source SOURCE     Dedicated maskable artwork
    --size SIZE                  Ordinary PWA or ICO size; repeatable
    --maskable-size SIZE         Maskable PWA size; repeatable
    --background COLOR           ICO or PNG background
    --canvas-size SIZE           PNG canvas width and height
    --artwork-size SIZE          PNG artwork bounding-box width and height
    -h, --help                   Show this help
`;

function requireString(value, name) {
    if (value === undefined || value === '') {
        throw new TypeError(`${name} is required.`);
    }

    return value;
}

function parseSize(value, name) {
    if (!/^[1-9]\d*$/u.test(value)) {
        throw new TypeError(`${name} must be a positive integer.`);
    }

    const size = Number(value);

    if (!Number.isSafeInteger(size)) {
        throw new RangeError(`${name} must be a positive safe integer.`);
    }

    return size;
}

function parseSizes(values, name) {
    if (values === undefined) {
        return undefined;
    }

    const sizes = values.map((value) => parseSize(value, name));

    if (new Set(sizes).size !== sizes.length) {
        throw new RangeError(`${name} must not be repeated with the same size.`);
    }

    return sizes.toSorted((left, right) => left - right);
}

function parseCommand(arguments_, options) {
    return parseArgs({
        allowPositionals: true,
        args: arguments_,
        options: {
            help: { short: 'h', type: 'boolean' },
            ...options,
        },
        strict: true,
    });
}

function assertPositionals(positionals, count) {
    if (positionals.length !== count) {
        throw new TypeError(`Expected ${String(count)} positional arguments, received ${String(positionals.length)}.`);
    }

    if (positionals.some((value) => value === '')) {
        throw new TypeError('Positional arguments must not be empty.');
    }
}

function parseWeb(arguments_) {
    const { positionals, values } = parseCommand(arguments_, {
        'apple-background': { type: 'string' },
        'apple-source': { type: 'string' },
    });

    if (values.help) {
        return { type: 'help' };
    }

    assertPositionals(positionals, 2);

    const options = {
        appleBackground: requireString(values['apple-background'], '--apple-background'),
        outputDirectory: positionals[1],
        source: positionals[0],
        type: 'web',
    };

    if (values['apple-source'] !== undefined) {
        options.appleSource = requireString(values['apple-source'], '--apple-source');
    }

    return options;
}

function parseMaskableFit(value) {
    const fit = requireString(value, '--maskable-fit');

    if (fit !== 'canvas' && fit !== 'safe') {
        throw new TypeError('--maskable-fit must be "canvas" or "safe".');
    }

    return fit;
}

function parsePwa(arguments_) {
    const { positionals, values } = parseCommand(arguments_, {
        'maskable-background': { type: 'string' },
        'maskable-fit': { type: 'string' },
        'maskable-size': { multiple: true, type: 'string' },
        'maskable-source': { type: 'string' },
        size: { multiple: true, type: 'string' },
    });

    if (values.help) {
        return { type: 'help' };
    }

    assertPositionals(positionals, 2);

    const options = {
        maskableBackground: requireString(values['maskable-background'], '--maskable-background'),
        maskableFit: parseMaskableFit(values['maskable-fit']),
        outputDirectory: positionals[1],
        source: positionals[0],
        type: 'pwa',
    };
    const maskableSizes = parseSizes(values['maskable-size'], '--maskable-size');
    const sizes = parseSizes(values.size, '--size');

    if (values['maskable-source'] !== undefined) {
        options.maskableSource = requireString(values['maskable-source'], '--maskable-source');
    }

    if (maskableSizes !== undefined) {
        options.maskableSizes = maskableSizes;
    }

    if (sizes !== undefined) {
        options.sizes = sizes;
    }

    return options;
}

function parseIco(arguments_) {
    const { positionals, values } = parseCommand(arguments_, {
        background: { type: 'string' },
        size: { multiple: true, type: 'string' },
    });

    if (values.help) {
        return { type: 'help' };
    }

    assertPositionals(positionals, 2);

    const options = {
        background: requireString(values.background, '--background'),
        output: positionals[1],
        source: positionals[0],
        type: 'ico',
    };
    const sizes = parseSizes(values.size, '--size');

    if (sizes !== undefined) {
        options.sizes = sizes;
    }

    return options;
}

function parsePng(arguments_) {
    const { positionals, values } = parseCommand(arguments_, {
        'artwork-size': { type: 'string' },
        background: { type: 'string' },
        'canvas-size': { type: 'string' },
    });

    if (values.help) {
        return { type: 'help' };
    }

    assertPositionals(positionals, 2);

    return {
        artworkSize: parseSize(requireString(values['artwork-size'], '--artwork-size'), '--artwork-size'),
        background: requireString(values.background, '--background'),
        canvasSize: parseSize(requireString(values['canvas-size'], '--canvas-size'), '--canvas-size'),
        output: positionals[1],
        source: positionals[0],
        type: 'png',
    };
}

const commandParsers = Object.freeze({
    ico: parseIco,
    png: parsePng,
    pwa: parsePwa,
    web: parseWeb,
});

export function parseArguments(arguments_) {
    const [command, ...commandArguments] = arguments_;

    if (command === '--help' || command === '-h') {
        return { type: 'help' };
    }

    if (command === undefined) {
        throw new TypeError('Expected a command. Run with --help for usage.');
    }

    const parse = commandParsers[command];

    if (parse === undefined) {
        throw new TypeError(`Unknown command: ${command}.`);
    }

    return parse(commandArguments);
}

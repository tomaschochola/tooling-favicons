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

import { generateIco, generatePng, generatePwa, generateWeb } from './generate.js';
import { help, parseArguments } from './options.js';

const generators = Object.freeze({
    ico: generateIco,
    png: generatePng,
    pwa: generatePwa,
    web: generateWeb,
});

async function generate(options) {
    await generators[options.type](options);
}

function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

export async function executeCli(arguments_, streams, generateCommand = generate) {
    let options;

    try {
        options = parseArguments(arguments_);
    } catch (error) {
        streams.stderr.write(`tooling-favicons: ${errorMessage(error)}\n`);
        streams.stderr.write(help);

        return 2;
    }

    if (options.type === 'help') {
        streams.stdout.write(help);

        return 0;
    }

    try {
        await generateCommand(options);

        return 0;
    } catch (error) {
        streams.stderr.write(`tooling-favicons: ${errorMessage(error)}\n`);

        return 1;
    }
}

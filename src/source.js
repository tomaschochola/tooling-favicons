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

import { stat } from 'node:fs/promises';
import { extname } from 'node:path';

const maximumSourceBytes = 16_777_216;
const supportedExtensions = new Set(['.jpeg', '.jpg', '.png', '.svg']);

export async function imageSourceExtension(source) {
    const sourceStat = await stat(source);

    if (!sourceStat.isFile()) {
        throw new TypeError(`Source must be a file: ${source}`);
    }

    if (sourceStat.size > maximumSourceBytes) {
        throw new RangeError(`Source must not exceed ${String(maximumSourceBytes)} bytes.`);
    }

    const extension = extname(source).toLowerCase();

    if (!supportedExtensions.has(extension)) {
        throw new TypeError('Source must be an SVG, PNG, JPEG, or JPG file.');
    }

    return extension;
}

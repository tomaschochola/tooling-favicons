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

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

export async function temporaryDirectory(context, name = 'tooling-favicons-') {
    const directory = await mkdtemp(join(tmpdir(), name));

    context.after(async () => {
        await rm(directory, { force: true, recursive: true });
    });

    return directory;
}

export async function writeSvg(path, { fill = '#1e88e5', height = 100, width = 100 } = {}) {
    await writeFile(path, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(width)} ${String(height)}"><rect width="${String(width)}" height="${String(height)}" fill="${fill}" /></svg>`);
}

export async function writePng(path, { background = '#1e88e5', height = 64, width = 64 } = {}) {
    await sharp({
        create: { background, channels: 4, height, width },
    })
        .png()
        .toFile(path);
}

export function colorBounds(pixels, size, color) {
    const bounds = {
        maximumX: -1,
        maximumY: -1,
        minimumX: size,
        minimumY: size,
    };

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const offset = (y * size + x) * 3;

            if (pixels[offset] === color[0] && pixels[offset + 1] === color[1] && pixels[offset + 2] === color[2]) {
                bounds.maximumX = Math.max(bounds.maximumX, x);
                bounds.maximumY = Math.max(bounds.maximumY, y);
                bounds.minimumX = Math.min(bounds.minimumX, x);
                bounds.minimumY = Math.min(bounds.minimumY, y);
            }
        }
    }

    return bounds;
}

export function crc32(input) {
    let crc = 0xff_ff_ff_ff;

    for (const byte of input) {
        crc ^= byte;

        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
        }
    }

    return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

export function pngChunk(type, data = Buffer.alloc(0)) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const chunk = Buffer.alloc(12 + data.length);

    chunk.writeUInt32BE(data.length, 0);
    typeBuffer.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);

    return chunk;
}

export function withPngHeaderByte(input, index, value) {
    const output = Buffer.from(input);
    const headerTypeOffset = 12;
    const headerDataOffset = 16;

    output[headerDataOffset + index] = value;
    output.writeUInt32BE(crc32(output.subarray(headerTypeOffset, headerDataOffset + 13)), headerDataOffset + 13);

    return output;
}

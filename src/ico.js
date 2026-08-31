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

import { Buffer } from 'node:buffer';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maximumIcoBytes = 67_108_864;
const maximumIcoImages = 256;

const pngBitDepthsByColorType = new Map([
    [0, new Set([1, 2, 4, 8, 16])],
    [2, new Set([8, 16])],
    [3, new Set([1, 2, 4, 8])],
    [4, new Set([8, 16])],
    [6, new Set([8, 16])],
]);

function assertPngInput(input) {
    if (!Buffer.isBuffer(input)) {
        throw new TypeError('ICO image input must be a Buffer.');
    }

    if (input.length < 45 || !input.subarray(0, pngSignature.length).equals(pngSignature)) {
        throw new TypeError('ICO image input must be a valid PNG file.');
    }
}

function crc32(input, start, end) {
    let crc = 0xff_ff_ff_ff;

    for (let index = start; index < end; index += 1) {
        crc ^= input[index];

        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
        }
    }

    return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function readPngChunk(input, offset) {
    if (offset + 12 > input.length) {
        throw new TypeError('ICO image input contains a truncated PNG chunk.');
    }

    const length = input.readUInt32BE(offset);
    const nextOffset = offset + 12 + length;

    if (nextOffset > input.length) {
        throw new TypeError('ICO image input contains a truncated PNG chunk.');
    }

    const expectedCrc = input.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(input, offset + 4, offset + 8 + length);

    if (actualCrc !== expectedCrc) {
        throw new TypeError('ICO image input contains a PNG chunk with an invalid checksum.');
    }

    for (let index = offset + 4; index < offset + 8; index += 1) {
        const byte = input[index];

        if (!((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) {
            throw new TypeError('ICO image input contains an invalid PNG chunk type.');
        }
    }

    const reservedByte = input[offset + 6];

    if (reservedByte < 65 || reservedByte > 90) {
        throw new TypeError('ICO image input contains an invalid PNG reserved chunk bit.');
    }

    return {
        length,
        nextOffset,
        offset,
        type: input.toString('ascii', offset + 4, offset + 8),
    };
}

function dimensionsFromHeader(input, chunk) {
    if (chunk.type !== 'IHDR' || chunk.length !== 13) {
        throw new TypeError('ICO image input must start with a PNG IHDR chunk.');
    }

    const dimensions = {
        height: input.readUInt32BE(chunk.offset + 12),
        width: input.readUInt32BE(chunk.offset + 8),
    };

    const bitDepth = input.readUInt8(chunk.offset + 16);
    const colorType = input.readUInt8(chunk.offset + 17);
    const compression = input.readUInt8(chunk.offset + 18);
    const filter = input.readUInt8(chunk.offset + 19);
    const interlace = input.readUInt8(chunk.offset + 20);

    if (!pngBitDepthsByColorType.get(colorType)?.has(bitDepth)) {
        throw new TypeError('ICO image input contains an invalid PNG bit depth or color type.');
    }

    if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
        throw new TypeError('ICO image input contains unsupported PNG header methods.');
    }

    return {
        bitDepth,
        colorType,
        dimensions,
    };
}

function assertIcoDimensions(dimensions) {
    if (dimensions.width !== dimensions.height || dimensions.width < 1 || dimensions.width > 256) {
        throw new RangeError('ICO PNG dimensions must be square and between 1 and 256 pixels.');
    }
}

function invalidPalette(chunk, properties, state) {
    const paletteEntries = chunk.length / 3;

    return (
        state.seenPalette ||
        state.seenImageData ||
        chunk.length === 0 ||
        chunk.length % 3 !== 0 ||
        paletteEntries > 256 ||
        (properties.colorType === 3 && paletteEntries > 2 ** properties.bitDepth) ||
        properties.colorType === 0 ||
        properties.colorType === 4
    );
}

function inspectPngChunk(chunk, properties, state, inputLength) {
    if (chunk.type === 'IHDR') {
        throw new TypeError('ICO image input contains multiple PNG IHDR chunks.');
    }

    if (chunk.type === 'PLTE') {
        if (invalidPalette(chunk, properties, state)) {
            throw new TypeError('ICO image input contains an invalid PNG palette chunk.');
        }

        state.seenPalette = true;

        return false;
    }

    if (chunk.type === 'IDAT') {
        if (state.imageDataEnded || (properties.colorType === 3 && !state.seenPalette)) {
            throw new TypeError('ICO image input contains PNG image data in an invalid position.');
        }

        state.seenImageData = true;

        return false;
    }

    if (chunk.type === 'IEND') {
        if (!state.seenImageData || chunk.length !== 0 || chunk.nextOffset !== inputLength) {
            throw new TypeError('ICO image input contains an invalid PNG IEND chunk.');
        }

        return true;
    }

    if (state.seenImageData) {
        state.imageDataEnded = true;
    }

    if (chunk.type.charCodeAt(0) >= 65 && chunk.type.charCodeAt(0) <= 90) {
        throw new TypeError(`ICO image input contains an unsupported critical PNG chunk: ${chunk.type}.`);
    }

    return false;
}

function pngDimensions(input) {
    assertPngInput(input);

    const header = readPngChunk(input, pngSignature.length);
    const properties = dimensionsFromHeader(input, header);

    const state = {
        imageDataEnded: false,
        seenImageData: false,
        seenPalette: false,
    };

    let offset = header.nextOffset;

    while (offset < input.length) {
        const chunk = readPngChunk(input, offset);

        offset = chunk.nextOffset;

        if (inspectPngChunk(chunk, properties, state, input.length)) {
            assertIcoDimensions(properties.dimensions);

            return properties.dimensions;
        }
    }

    throw new TypeError('ICO image input must contain a complete PNG stream.');
}

export function createIco(images) {
    if (!Array.isArray(images) || images.length < 1 || images.length > maximumIcoImages) {
        throw new RangeError(`ICO must contain between 1 and ${String(maximumIcoImages)} PNG images.`);
    }

    const directorySize = 6 + images.length * 16;

    let totalSize = directorySize;

    for (const image of images) {
        assertPngInput(image);
        totalSize += image.length;

        if (totalSize > maximumIcoBytes) {
            throw new RangeError(`ICO output must not exceed ${String(maximumIcoBytes)} bytes.`);
        }
    }

    const entries = images.map((image) => ({
        data: image,
        ...pngDimensions(image),
    }));

    const sizes = new Set(entries.map(({ width }) => width));

    if (sizes.size !== entries.length) {
        throw new TypeError('ICO PNG dimensions must be unique.');
    }

    const directory = Buffer.alloc(directorySize);

    directory.writeUInt16LE(0, 0);
    directory.writeUInt16LE(1, 2);
    directory.writeUInt16LE(entries.length, 4);

    let imageOffset = directorySize;

    for (const [index, { data, height, width }] of entries.entries()) {
        const entryOffset = 6 + index * 16;

        directory.writeUInt8(width === 256 ? 0 : width, entryOffset);
        directory.writeUInt8(height === 256 ? 0 : height, entryOffset + 1);
        directory.writeUInt8(0, entryOffset + 2);
        directory.writeUInt8(0, entryOffset + 3);
        directory.writeUInt16LE(1, entryOffset + 4);
        directory.writeUInt16LE(32, entryOffset + 6);
        directory.writeUInt32LE(data.length, entryOffset + 8);
        directory.writeUInt32LE(imageOffset, entryOffset + 12);
        imageOffset += data.length;
    }

    return Buffer.concat([directory, ...entries.map(({ data }) => data)], totalSize);
}

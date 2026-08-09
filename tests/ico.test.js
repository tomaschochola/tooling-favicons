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
import test from 'node:test';
import sharp from 'sharp';
import { createIco } from '../src/ico.js';
import { crc32, pngChunk, withPngHeaderByte } from './helpers.js';

async function image(size = 16, options = {}) {
  return await sharp({ create: { background: '#1e88e5', channels: 4, height: size, width: size } })
    .png(options)
    .toBuffer();
}

function chunks(input) {
  const result = [];
  let offset = 8;

  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const end = offset + 12 + length;

    result.push({ buffer: input.subarray(offset, end), offset, type: input.toString('ascii', offset + 4, offset + 8) });
    offset = end;
  }

  return result;
}

function replaceChunkType(input, type, replacement) {
  const output = Buffer.from(input);
  const chunk = chunks(output).find((candidate) => candidate.type === type);
  const length = output.readUInt32BE(chunk.offset);
  const typeOffset = chunk.offset + 4;

  output.write(replacement, typeOffset, 4, 'ascii');
  output.writeUInt32BE(crc32(output.subarray(typeOffset, typeOffset + 4 + length)), typeOffset + 4 + length);

  return output;
}

test('packs PNG streams into ICO without changing their bytes', async () => {
  const images = await Promise.all([16, 32, 48, 256].map(async (size) => await image(size)));
  const ico = createIco(images);

  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), images.length);
  assert.equal(ico.readUInt8(54), 0);

  for (const [index, input] of images.entries()) {
    const entryOffset = 6 + index * 16;
    const imageLength = ico.readUInt32LE(entryOffset + 8);
    const imageOffset = ico.readUInt32LE(entryOffset + 12);

    assert.deepEqual(ico.subarray(imageOffset, imageOffset + imageLength), input);
  }
});

test('accepts valid indexed PNG input', async () => {
  const indexed = await image(16, { colours: 16, palette: true });
  const progressive = await image(32, { progressive: true });
  const ico = createIco([indexed, progressive]);

  assert.deepEqual(ico.subarray(ico.readUInt32LE(18), ico.readUInt32LE(18) + indexed.length), indexed);
});

test('rejects invalid collection and PNG framing', async () => {
  const input = await image();
  const corrupted = Buffer.from(input);
  const dataOffset = corrupted.indexOf(Buffer.from('IDAT')) + 4;

  corrupted[dataOffset] ^= 1;

  assert.throws(() => createIco(undefined), /between 1 and 256/u);
  assert.throws(() => createIco([]), /between 1 and 256/u);
  assert.throws(() => createIco(Array(257).fill(input)), /between 1 and 256/u);
  assert.throws(() => createIco(['png']), /must be a Buffer/u);
  assert.throws(() => createIco([Buffer.alloc(44)]), /valid PNG/u);
  assert.throws(() => createIco([corrupted]), /invalid checksum/u);
  assert.throws(() => createIco([input.subarray(0, input.length - 7)]), /truncated PNG chunk/u);

  const imageData = chunks(input).find((chunk) => chunk.type === 'IDAT');

  assert.throws(() => createIco([input.subarray(0, imageData.offset + 12)]), /truncated PNG chunk/u);

  const oversized = Buffer.alloc(67_108_864);

  input.subarray(0, 8).copy(oversized);
  assert.throws(() => createIco([oversized]), /must not exceed/u);
});

test('rejects invalid PNG headers, chunks, ordering, and dimensions', async () => {
  const input = await image();
  const firstChunkEnd = 8 + 12 + input.readUInt32BE(8);
  const imageDataOffset = input.indexOf(Buffer.from('IDAT')) - 4;
  const duplicateHeader = Buffer.concat([input.subarray(0, firstChunkEnd), input.subarray(8, firstChunkEnd), input.subarray(firstChunkEnd)]);
  const unknownCriticalChunk = Buffer.concat([input.subarray(0, imageDataOffset), pngChunk('ABCD'), input.subarray(imageDataOffset)]);
  const withoutEnd = input.subarray(0, chunks(input).find((chunk) => chunk.type === 'IEND').offset);

  assert.throws(() => createIco([withPngHeaderByte(input, 9, 1)]), /invalid PNG bit depth or color type/u);
  assert.throws(() => createIco([withPngHeaderByte(input, 10, 1)]), /unsupported PNG header methods/u);
  assert.throws(() => createIco([withPngHeaderByte(input, 7, 15)]), /dimensions must be square/u);
  assert.throws(() => createIco([replaceChunkType(input, 'IHDR', 'IDAT')]), /must start with a PNG IHDR/u);
  assert.throws(() => createIco([replaceChunkType(input, 'IDAT', '1DAT')]), /invalid PNG chunk type/u);
  assert.throws(() => createIco([replaceChunkType(input, 'IDAT', 'IDaT')]), /reserved chunk bit/u);
  assert.throws(() => createIco([duplicateHeader]), /multiple PNG IHDR chunks/u);
  assert.throws(() => createIco([unknownCriticalChunk]), /unsupported critical PNG chunk: ABCD/u);
  assert.throws(() => createIco([withoutEnd]), /complete PNG stream/u);
  assert.throws(() => createIco([input, input]), /dimensions must be unique/u);
});

test('rejects invalid palette, image-data, and end-chunk ordering', async () => {
  const truecolor = await image();
  const truecolorChunks = chunks(truecolor);
  const indexed = await image(16, { colours: 16, palette: true });
  const indexedChunks = chunks(indexed);
  const header = indexedChunks.find((chunk) => chunk.type === 'IHDR').buffer;
  const palette = indexedChunks.find((chunk) => chunk.type === 'PLTE').buffer;
  const imageData = indexedChunks.find((chunk) => chunk.type === 'IDAT').buffer;
  const end = indexedChunks.find((chunk) => chunk.type === 'IEND').buffer;
  const signature = indexed.subarray(0, 8);

  assert.throws(() => createIco([Buffer.concat([signature, header, imageData, end])]), /image data in an invalid position/u);
  assert.throws(() => createIco([Buffer.concat([signature, header, palette, palette, imageData, end])]), /invalid PNG palette/u);
  assert.throws(
    () =>
      createIco([
        Buffer.concat([
          truecolor.subarray(0, 8),
          truecolorChunks.find((chunk) => chunk.type === 'IHDR').buffer,
          truecolorChunks.find((chunk) => chunk.type === 'IDAT').buffer,
          pngChunk('tEXt'),
          truecolorChunks.find((chunk) => chunk.type === 'IDAT').buffer,
          truecolorChunks.find((chunk) => chunk.type === 'IEND').buffer,
        ]),
      ]),
    /image data in an invalid position/u,
  );
  assert.throws(() => createIco([Buffer.concat([signature, header, palette, end])]), /invalid PNG IEND/u);
  assert.throws(() => createIco([Buffer.concat([indexed, Buffer.from([0])])]), /invalid PNG IEND/u);
});

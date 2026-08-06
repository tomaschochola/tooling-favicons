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
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import sharp from 'sharp';
import { createIco, generateIcons, renderIcon as renderIconFile } from '../src/index.js';

const execute = promisify(execFile);
const generateIconsCli = fileURLToPath(new URL('../src/generate-icons-cli.js', import.meta.url));
const renderIcon = fileURLToPath(new URL('../src/render-icon-cli.js', import.meta.url));

function crc32(input) {
  let crc = 0xff_ff_ff_ff;

  for (const byte of input) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1));
    }
  }

  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);

  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);

  return chunk;
}

function withPngHeaderByte(input, index, value) {
  const output = Buffer.from(input);
  const headerTypeOffset = 12;
  const headerDataOffset = 16;

  output[headerDataOffset + index] = value;
  output.writeUInt32BE(crc32(output.subarray(headerTypeOffset, headerDataOffset + 13)), headerDataOffset + 13);

  return output;
}

async function createAnimatedGif() {
  const firstFrame = Buffer.from(Array(4).fill([255, 0, 0, 255]).flat());
  const secondFrame = Buffer.from(Array(4).fill([0, 0, 255, 255]).flat());

  return await sharp(Buffer.concat([firstFrame, secondFrame]), {
    raw: {
      channels: 4,
      height: 4,
      pageHeight: 2,
      width: 2,
    },
  })
    .gif({
      delay: [100, 100],
      loop: 0,
    })
    .toBuffer();
}

test('exposes concise icon generator usage', async () => {
  await assert.rejects(async () => await execute(generateIconsCli), {
    code: 2,
    stderr: /Usage: generate-icons SOURCE OUTPUT_DIRECTORY STYLE BACKGROUND/u,
  });
});

test('exposes concise icon renderer usage', async () => {
  await assert.rejects(async () => await execute(renderIcon), {
    code: 2,
    stderr: /Usage: render-icon SOURCE OUTPUT CANVAS_SIZE CONTENT_SIZE BACKGROUND/u,
  });
});

test('renders a centered raster icon at the requested size', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-'));
  const executable = join(directory, 'render-icon');
  const source = join(directory, 'source.png');
  const output = join(directory, 'output.png');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await sharp({
    create: {
      background: '#ff0000',
      channels: 4,
      height: 16,
      width: 16,
    },
  })
    .png()
    .toFile(source);

  await symlink(renderIcon, executable);

  const { stderr, stdout } = await execute(executable, [source, output, '64', '32', '#ffffff']);
  const metadata = await sharp(output).metadata();

  assert.equal(stderr, '');
  assert.equal(stdout, '');
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.height, 64);
  assert.equal(metadata.width, 64);
});

test('preserves PNG pixels when no resizing or background compositing is requested', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-lossless-png-'));
  const source = join(directory, 'source.png');
  const output = join(directory, 'output.png');
  const pixels = Buffer.alloc(64 * 64 * 4);

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (index * 47) % 256;
  }

  await sharp(pixels, {
    raw: {
      channels: 4,
      height: 64,
      width: 64,
    },
  })
    .png({ compressionLevel: 0 })
    .toFile(source);

  await renderIconFile({
    background: 'transparent',
    canvasSize: 64,
    contentSize: 64,
    output,
    source,
  });

  assert.deepEqual(await sharp(output).raw().toBuffer(), pixels);
});

test('rejects animated raster input instead of rendering only the first frame', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-animated-'));
  const source = join(directory, 'source.png');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await writeFile(source, await createAnimatedGif());

  await assert.rejects(
    async () =>
      await renderIconFile({
        background: 'transparent',
        canvasSize: 64,
        contentSize: 64,
        output: join(directory, 'output.png'),
        source,
      }),
    /Animated and multi-page image sources are not supported/u,
  );
});

test('generates the complete icon set through the Node API', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-'));
  const outputDirectory = join(directory, 'output');
  const source = join(directory, 'source.png');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await sharp({
    create: {
      background: '#ff0000',
      channels: 4,
      height: 64,
      width: 64,
    },
  })
    .png()
    .toFile(source);

  await generateIcons({
    background: '#ffffff',
    outputDirectory,
    source,
    style: 'symbol',
  });

  assert.deepEqual((await readdir(outputDirectory)).sort(), [
    'apple-touch-icon.png',
    'favicon-96x96.png',
    'favicon.ico',
    'icon-1024x1024.png',
    'icon-192x192.png',
    'icon-512x512.png',
    'maskable-icon-1024x1024.png',
    'maskable-icon-192x192.png',
    'maskable-icon-512x512.png',
  ]);

  const metadata = await sharp(join(outputDirectory, 'maskable-icon-512x512.png')).metadata();
  const statistics = await sharp(join(outputDirectory, 'maskable-icon-512x512.png')).stats();

  assert.equal(metadata.format, 'png');
  assert.equal(metadata.height, 512);
  assert.equal(metadata.width, 512);
  assert.equal(statistics.isOpaque, true);
});

test('generates deterministic icon bundle bytes', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-determinism-'));
  const firstOutput = join(directory, 'first');
  const secondOutput = join(directory, 'second');
  const source = join(directory, 'source.svg');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#1e88e5" /></svg>');

  const options = {
    background: '#ffffff',
    source,
    style: 'symbol',
  };

  await generateIcons({
    ...options,
    outputDirectory: firstOutput,
  });
  await generateIcons({
    ...options,
    outputDirectory: secondOutput,
  });

  const names = (await readdir(firstOutput)).sort();

  assert.deepEqual((await readdir(secondOutput)).sort(), names);

  for (const name of names) {
    assert.deepEqual(await readFile(join(secondOutput, name)), await readFile(join(firstOutput, name)));
  }
});

test('replaces the managed bundle without deleting unrelated output files', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-replace-'));
  const outputDirectory = join(directory, 'output');
  const source = join(directory, 'source.svg');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#1e88e5" /></svg>');
  await generateIcons({
    background: '#ffffff',
    outputDirectory,
    source,
    style: 'symbol',
  });
  await writeFile(join(outputDirectory, 'unrelated.txt'), 'preserve');

  const rasterSource = join(directory, 'source.png');

  await sharp(source).png().toFile(rasterSource);
  await writeFile(join(outputDirectory, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await generateIcons({
    background: '#ffffff',
    outputDirectory,
    source: rasterSource,
    style: 'fullbleed',
  });

  assert.equal(await readFile(join(outputDirectory, 'unrelated.txt'), 'utf8'), 'preserve');
  await assert.rejects(async () => await readFile(join(outputDirectory, 'favicon.svg')), {
    code: 'ENOENT',
  });
  assert.equal((await sharp(join(outputDirectory, 'icon-512x512.png')).metadata()).width, 512);
});

test('packs PNG streams into ICO without changing their bytes', async () => {
  const images = await Promise.all(
    [16, 32, 48].map(
      async (size) =>
        await sharp({
          create: {
            background: '#1e88e5',
            channels: 4,
            height: size,
            width: size,
          },
        })
          .png()
          .toBuffer(),
    ),
  );

  const ico = createIco(images);

  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), images.length);

  for (const [index, image] of images.entries()) {
    const entryOffset = 6 + index * 16;
    const imageLength = ico.readUInt32LE(entryOffset + 8);
    const imageOffset = ico.readUInt32LE(entryOffset + 12);

    assert.equal(imageLength, image.length);
    assert.deepEqual(ico.subarray(imageOffset, imageOffset + imageLength), image);
  }
});

test('packs a valid palette PNG into ICO without changing its bytes', async () => {
  const image = await sharp({
    create: {
      background: '#1e88e5',
      channels: 4,
      height: 16,
      width: 16,
    },
  })
    .png({
      colours: 16,
      palette: true,
    })
    .toBuffer();

  const ico = createIco([image]);
  const imageLength = ico.readUInt32LE(14);
  const imageOffset = ico.readUInt32LE(18);

  assert.equal(imageLength, image.length);
  assert.deepEqual(ico.subarray(imageOffset, imageOffset + imageLength), image);
});

test('rejects a PNG with corrupted chunk data when packing ICO', async () => {
  const image = await sharp({
    create: {
      background: '#1e88e5',
      channels: 4,
      height: 16,
      width: 16,
    },
  })
    .png()
    .toBuffer();

  const corrupted = Buffer.from(image);
  const imageDataOffset = corrupted.indexOf(Buffer.from('IDAT')) + 4;

  corrupted[imageDataOffset] ^= 1;

  assert.throws(() => createIco([corrupted]), /invalid checksum/u);
});

test('rejects structurally invalid PNG streams when packing ICO', async () => {
  const image = await sharp({
    create: {
      background: '#1e88e5',
      channels: 4,
      height: 16,
      width: 16,
    },
  })
    .png()
    .toBuffer();

  const firstChunkEnd = 8 + 12 + image.readUInt32BE(8);

  const duplicateHeader = Buffer.concat([image.subarray(0, firstChunkEnd), image.subarray(8, firstChunkEnd), image.subarray(firstChunkEnd)]);

  const imageDataOffset = image.indexOf(Buffer.from('IDAT')) - 4;

  const unknownCriticalChunk = Buffer.concat([image.subarray(0, imageDataOffset), pngChunk('ABCD'), image.subarray(imageDataOffset)]);

  assert.throws(() => createIco([withPngHeaderByte(image, 9, 1)]), /invalid PNG bit depth or color type/u);
  assert.throws(() => createIco([duplicateHeader]), /multiple PNG IHDR chunks/u);
  assert.throws(() => createIco([unknownCriticalChunk]), /unsupported critical PNG chunk: ABCD/u);
});

test('requires unique square PNG dimensions when packing ICO', async () => {
  const image = await sharp({
    create: {
      background: '#1e88e5',
      channels: 4,
      height: 16,
      width: 16,
    },
  })
    .png()
    .toBuffer();

  assert.throws(() => createIco([withPngHeaderByte(image, 7, 15)]), /dimensions must be square/u);
  assert.throws(() => createIco([image, image]), /dimensions must be unique/u);
});

test('bounds the number of images accepted by the ICO packer', async () => {
  const image = await sharp({
    create: {
      background: '#1e88e5',
      channels: 4,
      height: 16,
      width: 16,
    },
  })
    .png()
    .toBuffer();

  assert.throws(() => createIco(Array(257).fill(image)), /between 1 and 256 PNG images/u);
});

test('rejects active or externally referenced SVG input', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-unsafe-svg-'));
  const source = join(directory, 'source.svg');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

  await assert.rejects(
    async () =>
      await generateIcons({
        background: '#ffffff',
        outputDirectory: join(directory, 'output'),
        source,
        style: 'symbol',
      }),
    /SVG source must be static/u,
  );

  await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://example.com/icon.svg#icon" /></svg>');

  await assert.rejects(
    async () =>
      await generateIcons({
        background: '#ffffff',
        outputDirectory: join(directory, 'output'),
        source,
        style: 'symbol',
      }),
    /outside the document/u,
  );

  await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg" xml:base="https://example.com/"><use href="#icon" /></svg>');

  await assert.rejects(
    async () =>
      await generateIcons({
        background: '#ffffff',
        outputDirectory: join(directory, 'output'),
        source,
        style: 'symbol',
      }),
    /static and self-contained/u,
  );

  await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="16">A</text></svg>');

  await assert.rejects(
    async () =>
      await generateIcons({
        background: '#ffffff',
        outputDirectory: join(directory, 'output'),
        source,
        style: 'symbol',
      }),
    /static and self-contained/u,
  );
});

test('accepts a static self-contained SVG with an XML declaration', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-static-svg-'));
  const outputDirectory = join(directory, 'output');
  const source = join(directory, 'source.svg');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await writeFile(source, '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#1e88e5" /></svg>');

  await generateIcons({
    background: '#ffffff',
    outputDirectory,
    source,
    style: 'symbol',
  });

  assert.match(await readFile(join(outputDirectory, 'favicon.svg'), 'utf8'), /^<svg\b/u);
});

test('rejects a transparent installable icon background', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-transparent-background-'));
  const source = join(directory, 'source.png');

  context.after(async () => {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  });

  await sharp({
    create: {
      background: '#1e88e5',
      channels: 4,
      height: 64,
      width: 64,
    },
  })
    .png()
    .toFile(source);

  await assert.rejects(
    async () =>
      await generateIcons({
        background: 'transparent',
        outputDirectory: join(directory, 'output'),
        source,
        style: 'symbol',
      }),
    /must be opaque/u,
  );
});

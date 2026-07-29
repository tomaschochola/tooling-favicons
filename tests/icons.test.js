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
import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import sharp from 'sharp';
import { generateIcons } from '../src/index.js';

const execute = promisify(execFile);
const generateIconsCli = fileURLToPath(new URL('../src/generate-icons-cli.js', import.meta.url));
const renderIcon = fileURLToPath(new URL('../src/render-icon-cli.js', import.meta.url));

test('exposes concise icon generator usage', async () => {
  await assert.rejects(
    async () => await execute(generateIconsCli),
    {
      code: 2,
      stderr: /Usage: generate-icons SOURCE OUTPUT_DIRECTORY STYLE BACKGROUND/u,
    },
  );
});

test('exposes concise icon renderer usage', async () => {
  await assert.rejects(
    async () => await execute(renderIcon),
    {
      code: 2,
      stderr: /Usage: render-icon SOURCE OUTPUT CANVAS_SIZE CONTENT_SIZE BACKGROUND/u,
    },
  );
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

test('generates the complete icon set through the Node API', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'tooling-favicons-'));
  const fakeIcotool = join(directory, 'icotool');
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

  await writeFile(
    fakeIcotool,
    `#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';

const outputIndex = process.argv.indexOf('--output') + 1;
await writeFile(process.argv[outputIndex], 'ico');
`,
  );
  await chmod(fakeIcotool, 0o755);
  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  await generateIcons({
    background: '#ffffff',
    icotool: fakeIcotool,
    outputDirectory,
    source,
    style: 'symbol',
  });

  assert.deepEqual(
    (await readdir(outputDirectory)).sort(),
    [
      'apple-touch-icon.png',
      'favicon-96x96.png',
      'favicon.ico',
      'icon-1024x1024.png',
      'icon-192x192.png',
      'icon-512x512.png',
      'maskable-icon-1024x1024.png',
      'maskable-icon-192x192.png',
      'maskable-icon-512x512.png',
    ],
  );

  const metadata = await sharp(join(outputDirectory, 'maskable-icon-512x512.png')).metadata();

  assert.equal(metadata.format, 'png');
  assert.equal(metadata.height, 512);
  assert.equal(metadata.width, 512);
});

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

import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  extname,
  join,
  resolve,
} from 'node:path';
import { promisify } from 'node:util';
import { optimize } from 'svgo';
import { renderIcon } from './render-icon.js';

const execute = promisify(execFile);
const supportedExtensions = new Set(['.jpeg', '.jpg', '.png', '.svg']);

const outputNames = Object.freeze([
  'apple-touch-icon.png',
  'favicon-96x96.png',
  'favicon.ico',
  'favicon.svg',
  'icon-192x192.png',
  'icon-512x512.png',
  'icon-1024x1024.png',
  'maskable-icon-192x192.png',
  'maskable-icon-512x512.png',
  'maskable-icon-1024x1024.png',
]);

async function assertSource(source) {
  const sourceStat = await stat(source);

  if (!sourceStat.isFile()) {
    throw new TypeError(`Source must be a file: ${source}`);
  }

  const extension = extname(source).toLowerCase();

  if (!supportedExtensions.has(extension)) {
    throw new TypeError('Source must be an SVG, PNG, JPEG, or JPG file.');
  }

  return extension;
}

function contentSize(size, style) {
  if (style === 'fullbleed') {
    return size;
  }

  const padding = Math.floor((size + 5) / 10);

  return size - (2 * padding);
}

function maskableContentSize(size, style) {
  if (style === 'fullbleed') {
    return size;
  }

  // A 9/16 square fits inside the maskable safe-zone circle with radius 2/5.
  return Math.floor((size * 9) / 16);
}

async function createIco(command, workDirectory, output) {
  const inputs = [16, 32, 48].map((size) => join(workDirectory, `favicon-${String(size)}x${String(size)}.png`));

  try {
    await execute(command, [
      '--create',
      '--output',
      output,
      ...inputs,
    ], {
      timeout: 60_000,
      windowsHide: true,
    });
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error('icotool is required to generate favicon.ico.', {
        cause: error,
      });
    }

    throw error;
  }
}

async function publish(stageDirectory, outputDirectory, hasSvg) {
  await mkdir(outputDirectory, {
    recursive: true,
  });

  for (const name of outputNames) {
    const target = join(outputDirectory, name);

    if (name === 'favicon.svg' && !hasSvg) {
      await unlink(target).catch((error) => {
        if (error === null || typeof error !== 'object' || error.code !== 'ENOENT') {
          throw error;
        }
      });

      continue;
    }

    await rename(join(stageDirectory, name), target);
  }
}

export async function generateIcons({
  background,
  icotool = 'icotool',
  outputDirectory,
  source,
  style,
}) {
  if (style !== 'fullbleed' && style !== 'symbol') {
    throw new TypeError('Style must be "symbol" or "fullbleed".');
  }

  if (typeof background !== 'string' || background === '') {
    throw new TypeError('Background must be a non-empty Sharp color or "transparent".');
  }

  if (typeof icotool !== 'string' || icotool === '') {
    throw new TypeError('icotool must be a non-empty command or executable path.');
  }

  if (typeof source !== 'string' || source === '' || typeof outputDirectory !== 'string' || outputDirectory === '') {
    throw new TypeError('Source and output directory must be non-empty paths.');
  }

  const sourcePath = resolve(source);
  const outputPath = resolve(outputDirectory);
  const extension = await assertSource(sourcePath);
  const outputParent = dirname(outputPath);

  await mkdir(outputParent, {
    recursive: true,
  });

  const workDirectory = await mkdtemp(join(outputParent, '.tooling-favicons-'));
  const stageDirectory = join(workDirectory, 'output');

  try {
    await mkdir(stageDirectory);

    let renderSource = sourcePath;

    if (extension === '.svg') {
      const optimized = optimize(await readFile(sourcePath, 'utf8'), {
        multipass: true,
        path: sourcePath,
      });

      renderSource = join(stageDirectory, 'favicon.svg');
      await writeFile(renderSource, optimized.data, {
        encoding: 'utf8',
        flag: 'wx',
      });
    }

    for (const size of [16, 32, 48]) {
      await renderIcon({
        background: 'transparent',
        canvasSize: size,
        contentSize: size,
        output: join(workDirectory, `favicon-${String(size)}x${String(size)}.png`),
        source: renderSource,
      });
    }

    await createIco(icotool, workDirectory, join(stageDirectory, 'favicon.ico'));
    await renderIcon({
      background: 'transparent',
      canvasSize: 96,
      contentSize: 96,
      output: join(stageDirectory, 'favicon-96x96.png'),
      source: renderSource,
    });
    await renderIcon({
      background,
      canvasSize: 180,
      contentSize: contentSize(180, style),
      output: join(stageDirectory, 'apple-touch-icon.png'),
      source: renderSource,
    });

    for (const size of [192, 512, 1024]) {
      await renderIcon({
        background,
        canvasSize: size,
        contentSize: contentSize(size, style),
        output: join(stageDirectory, `icon-${String(size)}x${String(size)}.png`),
        source: renderSource,
      });
      await renderIcon({
        background,
        canvasSize: size,
        contentSize: maskableContentSize(size, style),
        output: join(stageDirectory, `maskable-icon-${String(size)}x${String(size)}.png`),
        source: renderSource,
      });
    }

    await publish(stageDirectory, outputPath, extension === '.svg');
  } finally {
    await rm(workDirectory, {
      force: true,
      recursive: true,
    });
  }
}

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

import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { createIco } from './ico.js';
import { publishBundle } from './publish.js';
import { assertColor, assertSquareSource, renderPng } from './render.js';
import { imageSourceExtension } from './source.js';
import { writeOptimizedSvg } from './svg.js';

const defaultFaviconSizes = Object.freeze([16, 32, 48]);
const defaultAnySizes = Object.freeze([192, 384, 512, 1024]);
const defaultMaskableSizes = Object.freeze([512, 1024]);
const maximumIcoSize = 256;
const maximumRasterSize = 10_000;
const pwaNamePattern = /^(?:icon|maskable-icon)-([1-9]\d*)x\1\.png$/u;
const webNames = Object.freeze(['apple-touch-icon.png', 'favicon-96x96.png', 'favicon.ico', 'favicon.svg']);

async function workDirectory(parent, operation) {
  await mkdir(parent, { recursive: true });

  const directory = await mkdtemp(join(parent, '.tooling-favicons-'));

  try {
    return await operation(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function preparedSource(source, directory, name) {
  const sourcePath = resolve(source);
  const extension = await imageSourceExtension(sourcePath);
  const path = join(directory, `${name}${extension}`);

  if (extension === '.svg') {
    await writeOptimizedSvg(sourcePath, path);
  } else {
    await copyFile(sourcePath, path);
  }

  return { extension, path };
}

async function writeIco(source, stageDirectory, workDirectoryPath, outputName, sizes, background) {
  const images = [];

  for (const size of sizes) {
    const output = join(workDirectoryPath, `ico-${String(size)}.png`);

    await renderPng({
      artworkSize: size,
      background,
      canvasSize: size,
      output,
      source,
    });
    images.push(await readFile(output));
  }

  await writeFile(join(stageDirectory, outputName), createIco(images), { flag: 'wx' });
}

function assertSizes(sizes, maximum = maximumRasterSize) {
  if (!Array.isArray(sizes) || sizes.length === 0) {
    throw new TypeError('At least one output size is required.');
  }

  const unique = new Set(sizes);

  if (unique.size !== sizes.length || sizes.some((size) => !Number.isSafeInteger(size) || size < 1 || size > maximum)) {
    throw new RangeError(`Sizes must be unique positive integers no greater than ${String(maximum)}.`);
  }
}

async function existingPwaNames(outputDirectory) {
  try {
    return (await readdir(outputDirectory)).filter((name) => pwaNamePattern.test(name));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

export async function generateWeb({ appleBackground, appleSource = undefined, outputDirectory, source }) {
  await assertColor(appleBackground, true);

  const outputPath = resolve(outputDirectory);

  await workDirectory(dirname(outputPath), async (directory) => {
    const stageDirectory = join(directory, 'stage');

    await mkdir(stageDirectory);

    const favicon = await preparedSource(source, directory, 'favicon-source');

    if (favicon.extension !== '.svg') {
      throw new TypeError('The web preset requires an SVG favicon source.');
    }

    const apple = appleSource === undefined || resolve(appleSource) === resolve(source) ? favicon : await preparedSource(appleSource, directory, 'apple-source');

    await assertSquareSource(favicon.path);
    await assertSquareSource(apple.path);
    await writeFile(join(stageDirectory, 'favicon.svg'), await readFile(favicon.path), { flag: 'wx' });
    await writeIco(favicon.path, stageDirectory, directory, 'favicon.ico', defaultFaviconSizes, 'transparent');
    await renderPng({
      artworkSize: 96,
      background: 'transparent',
      canvasSize: 96,
      output: join(stageDirectory, 'favicon-96x96.png'),
      source: favicon.path,
    });
    await renderPng({
      artworkSize: 180,
      background: appleBackground,
      canvasSize: 180,
      output: join(stageDirectory, 'apple-touch-icon.png'),
      source: apple.path,
    });
    await publishBundle({
      managedNames: webNames,
      outputDirectory: outputPath,
      stageDirectory,
      workDirectory: directory,
    });
  });
}

export async function generatePwa({ maskableBackground, maskableFit, maskableSizes = defaultMaskableSizes, maskableSource = undefined, outputDirectory, sizes = defaultAnySizes, source }) {
  assertSizes(sizes);
  assertSizes(maskableSizes);

  if (maskableFit !== 'canvas' && maskableFit !== 'safe') {
    throw new TypeError('Maskable fit must be "canvas" or "safe".');
  }

  await assertColor(maskableBackground, true);

  const outputPath = resolve(outputDirectory);

  await workDirectory(dirname(outputPath), async (directory) => {
    const stageDirectory = join(directory, 'stage');

    await mkdir(stageDirectory);

    const anyIcon = await preparedSource(source, directory, 'any-source');
    const resolvedMaskableSource = maskableSource ?? source;
    const maskableIcon = resolve(resolvedMaskableSource) === resolve(source) ? anyIcon : await preparedSource(resolvedMaskableSource, directory, 'maskable-source');

    await assertSquareSource(anyIcon.path);
    await assertSquareSource(maskableIcon.path);

    const generatedNames = [];

    for (const size of sizes) {
      const name = `icon-${String(size)}x${String(size)}.png`;

      generatedNames.push(name);
      await renderPng({
        artworkSize: size,
        background: 'transparent',
        canvasSize: size,
        output: join(stageDirectory, name),
        source: anyIcon.path,
      });
    }

    for (const size of maskableSizes) {
      const name = `maskable-icon-${String(size)}x${String(size)}.png`;
      const artworkSize = maskableFit === 'safe' ? Math.max(1, Math.floor((size * 0.8) / Math.SQRT2)) : size;

      generatedNames.push(name);
      await renderPng({
        artworkSize,
        background: maskableBackground,
        canvasSize: size,
        output: join(stageDirectory, name),
        source: maskableIcon.path,
      });
    }

    const managedNames = [...new Set([...(await existingPwaNames(outputPath)), ...generatedNames])].sort();

    await publishBundle({
      managedNames,
      outputDirectory: outputPath,
      stageDirectory,
      workDirectory: directory,
    });
  });
}

export async function generateIco({ background, output, sizes = defaultFaviconSizes, source }) {
  assertSizes(sizes, maximumIcoSize);
  await assertColor(background);

  const outputPath = resolve(output);

  if (extname(outputPath).toLowerCase() !== '.ico') {
    throw new TypeError('ICO output must use the .ico extension.');
  }

  await workDirectory(dirname(outputPath), async (directory) => {
    const stageDirectory = join(directory, 'stage');
    const prepared = await preparedSource(source, directory, 'ico-source');

    await mkdir(stageDirectory);
    await assertSquareSource(prepared.path);
    const outputName = basename(outputPath);

    await writeIco(prepared.path, stageDirectory, directory, outputName, sizes, background);
    await publishBundle({
      managedNames: [outputName],
      outputDirectory: dirname(outputPath),
      stageDirectory,
      workDirectory: directory,
    });
  });
}

export async function generatePng({ artworkSize, background, canvasSize, output, source }) {
  await assertColor(background);

  const outputPath = resolve(output);

  if (extname(outputPath).toLowerCase() !== '.png') {
    throw new TypeError('PNG output must use the .png extension.');
  }

  await workDirectory(dirname(outputPath), async (directory) => {
    const stageDirectory = join(directory, 'stage');
    const prepared = await preparedSource(source, directory, 'png-source');
    const outputName = basename(outputPath);

    await mkdir(stageDirectory);
    await renderPng({
      artworkSize,
      background,
      canvasSize,
      output: join(stageDirectory, outputName),
      source: prepared.path,
    });
    await publishBundle({
      managedNames: [outputName],
      outputDirectory: dirname(outputPath),
      stageDirectory,
      workDirectory: directory,
    });
  });
}

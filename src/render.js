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

import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import { imageSourceExtension } from './source.js';

const defaultSvgDensity = 72;
const maximumDimension = 10_000;
const maximumPixels = 100_000_000;
const maximumSvgDensity = 100_000;

const transparent = Object.freeze({
  alpha: 0,
  b: 0,
  g: 0,
  r: 0,
});

function assertSize(size, name) {
  if (!Number.isSafeInteger(size) || size < 1 || size > maximumDimension) {
    throw new RangeError(`${name} is invalid or exceeds the safety limit.`);
  }
}

async function metadata(source, density = defaultSvgDensity) {
  const result = await sharp(source, {
    animated: false,
    density,
    failOn: 'error',
    limitInputPixels: maximumPixels,
  }).metadata();

  assertImageMetadata(result);

  return result;
}

export function assertImageMetadata(result) {
  if ((result.pages ?? 1) !== 1) {
    throw new TypeError('Animated and multi-page image sources are not supported.');
  }

  if (!Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) || result.width < 1 || result.height < 1 || result.width * result.height > maximumPixels) {
    throw new RangeError(`Decoded image must contain between 1 and ${String(maximumPixels)} pixels.`);
  }
}

async function sourceDensity(source, extension, artworkSize) {
  const sourceMetadata = await metadata(source);

  if (extension !== '.svg') {
    return undefined;
  }

  const largestDimension = Math.max(sourceMetadata.width, sourceMetadata.height);

  return Math.min(maximumSvgDensity, Math.max(defaultSvgDensity, Math.ceil((defaultSvgDensity * artworkSize) / largestDimension)));
}

export async function assertSquareSource(source) {
  const sourceMetadata = await metadata(source);

  if (sourceMetadata.width !== sourceMetadata.height) {
    throw new TypeError('Preset and ICO sources must have a square canvas.');
  }
}

export async function assertColor(background, opaque = false) {
  if (typeof background !== 'string' || background === '') {
    throw new TypeError('Background must be a non-empty Sharp color or "transparent".');
  }

  let pixel;

  try {
    pixel = await sharp({
      create: {
        background: background === 'transparent' ? transparent : background,
        channels: 4,
        height: 1,
        width: 1,
      },
    })
      .raw()
      .toBuffer();
  } catch (error) {
    throw new TypeError('Background must be a valid Sharp color or "transparent".', { cause: error });
  }

  if (opaque && pixel[3] !== 255) {
    throw new TypeError('Apple touch and maskable backgrounds must be opaque.');
  }

  if (background !== 'transparent' && pixel[3] !== 255) {
    throw new TypeError('Background must be opaque or the literal "transparent".');
  }
}

export async function renderPng({ artworkSize, background, canvasSize, output, source }) {
  assertSize(canvasSize, 'Canvas size');
  assertSize(artworkSize, 'Artwork size');

  if (artworkSize > canvasSize) {
    throw new RangeError('Artwork size must not exceed the canvas size.');
  }

  if (typeof source !== 'string' || source === '' || typeof output !== 'string' || output === '') {
    throw new TypeError('Source and output must be non-empty paths.');
  }

  await assertColor(background);

  const sourcePath = resolve(source);
  const outputPath = resolve(output);
  const extension = await imageSourceExtension(sourcePath);
  const outputDirectory = dirname(outputPath);
  const density = await sourceDensity(sourcePath, extension, artworkSize);

  await mkdir(outputDirectory, { recursive: true });

  const workDirectory = await mkdtemp(join(outputDirectory, '.tooling-favicons-render-'));
  const temporaryOutput = join(workDirectory, 'icon.png');
  const padding = canvasSize - artworkSize;
  const paddingBefore = Math.floor(padding / 2);
  const paddingAfter = padding - paddingBefore;

  try {
    let image = sharp(sourcePath, {
      animated: false,
      ...(density === undefined ? {} : { density }),
      failOn: 'error',
      limitInputPixels: maximumPixels,
    })
      .autoOrient()
      .resize(artworkSize, artworkSize, {
        background: transparent,
        fit: 'contain',
      })
      .toColorspace('srgb')
      .extend({
        background: background === 'transparent' ? transparent : background,
        bottom: paddingAfter,
        left: paddingBefore,
        right: paddingAfter,
        top: paddingBefore,
      });

    if (background !== 'transparent') {
      image = image.flatten({ background });
    }

    await image
      .png({
        adaptiveFiltering: true,
        compressionLevel: 9,
        palette: false,
      })
      .toFile(temporaryOutput);

    await rename(temporaryOutput, outputPath);
  } finally {
    await rm(workDirectory, { force: true, recursive: true });
  }
}

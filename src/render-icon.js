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

import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import sharp from 'sharp';

const supportedExtensions = new Set(['.jpeg', '.jpg', '.png', '.svg']);
const maximumDimension = 16_384;
const maximumPixels = 100_000_000;

const transparent = Object.freeze({
  alpha: 0,
  b: 0,
  g: 0,
  r: 0,
});

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

export async function renderIcon({
  background,
  canvasSize,
  contentSize,
  output,
  source,
}) {
  if (
    !Number.isSafeInteger(canvasSize)
    || canvasSize <= 0
    || canvasSize > maximumDimension
    || canvasSize * canvasSize > maximumPixels
  ) {
    throw new RangeError('Canvas size is invalid or exceeds the safety limit.');
  }

  if (!Number.isSafeInteger(contentSize) || contentSize <= 0 || contentSize > canvasSize) {
    throw new RangeError('Content size must be a positive safe integer no greater than the canvas size.');
  }

  if (typeof background !== 'string' || background === '') {
    throw new TypeError('Background must be a non-empty Sharp color or "transparent".');
  }

  if (typeof source !== 'string' || source === '' || typeof output !== 'string' || output === '') {
    throw new TypeError('Source and output must be non-empty paths.');
  }

  const sourcePath = resolve(source);
  const outputPath = resolve(output);
  const extension = await assertSource(sourcePath);
  const outputDirectory = dirname(outputPath);

  await mkdir(outputDirectory, {
    recursive: true,
  });

  const workDirectory = await mkdtemp(join(outputDirectory, '.tooling-favicons-'));
  const temporaryOutput = join(workDirectory, 'icon.png');
  const padding = canvasSize - contentSize;
  const paddingBefore = Math.floor(padding / 2);
  const paddingAfter = padding - paddingBefore;

  try {
    let image = sharp(sourcePath, {
      ...(extension === '.svg'
        ? {
            density: 300,
          }
        : {}),
      failOn: 'error',
      limitInputPixels: 100_000_000,
    })
      .autoOrient()
      .resize(contentSize, contentSize, {
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
      image = image.flatten({
        background,
      });
    }

    await image
      .png({
        adaptiveFiltering: true,
        compressionLevel: 9,
      })
      .toFile(temporaryOutput);

    const metadata = await sharp(temporaryOutput).metadata();

    if (metadata.format !== 'png' || metadata.width !== canvasSize || metadata.height !== canvasSize) {
      throw new Error(
        `Unexpected rendered icon: ${String(metadata.width)}x${String(metadata.height)} ${String(metadata.format)}`,
      );
    }

    await rename(temporaryOutput, outputPath);
  } finally {
    await rm(workDirectory, {
      force: true,
      recursive: true,
    });
  }
}

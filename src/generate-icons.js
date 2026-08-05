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
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import sharp from 'sharp';
import { optimize } from 'svgo';
import { createIco } from './ico.js';
import { renderIcon } from './render-icon.js';
import { imageSourceExtension } from './source.js';

const maskableSafeZoneSquareRatio = 9 / 16;
const maximumSvgElements = 100_000;

const staticSvgForbiddenElements = new Set([
  'a',
  'animate',
  'animatemotion',
  'animatetransform',
  'audio',
  'discard',
  'embed',
  'foreignobject',
  'iframe',
  'image',
  'object',
  'script',
  'set',
  'text',
  'textpath',
  'tspan',
  'video',
]);

const staticSvgCssControlPattern = /@import\b|@keyframes\b/iu;
const staticSvgCssUrlPattern = /url\s*\(/iu;
const staticSvgInternalCssUrlPattern = /url\s*\(\s*(["']?)#[^)"'\s]+\1\s*\)/giu;

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

function assertStaticSvgValue(value) {
  const withoutInternalReferences = value.replace(staticSvgInternalCssUrlPattern, '');

  if (
    staticSvgCssControlPattern.test(value)
    || staticSvgCssUrlPattern.test(withoutInternalReferences)
  ) {
    throw new TypeError('SVG source must be static and self-contained.');
  }
}

const assertStaticSvgPlugin = Object.freeze({
  name: 'assertStaticSvg',
  fn: () => {
    let elementCount = 0;

    return {
      doctype: {
        enter: () => {
          throw new TypeError('SVG source must not contain a document type declaration.');
        },
      },
      instruction: {
        enter: (node) => {
          if (node.name.toLowerCase() !== 'xml') {
            throw new TypeError('SVG source must not contain processing instructions.');
          }
        },
      },
      element: {
        enter: (node) => {
          elementCount += 1;

          if (elementCount > maximumSvgElements) {
            throw new RangeError(`SVG source must not exceed ${String(maximumSvgElements)} elements.`);
          }

          const elementName = node.name.toLowerCase().split(':').at(-1);

          if (staticSvgForbiddenElements.has(elementName)) {
            throw new TypeError('SVG source must be static and self-contained.');
          }

          for (const [name, value] of Object.entries(node.attributes)) {
            const attributeName = name.toLowerCase().split(':').at(-1);

            if (attributeName === 'base' || attributeName.startsWith('on')) {
              throw new TypeError('SVG source must be static and self-contained.');
            }

            if (attributeName === 'href' && !value.trim().startsWith('#')) {
              throw new TypeError('SVG source references a resource outside the document.');
            }

            assertStaticSvgValue(value);
          }

          if (elementName === 'style') {
            for (const child of node.children) {
              if (child.type === 'text' || child.type === 'cdata') {
                assertStaticSvgValue(child.value);
              }
            }
          }
        },
      },
    };
  },
});

async function assertOpaqueBackground(background) {
  let pixel;

  try {
    pixel = await sharp({
      create: {
        background,
        channels: 4,
        height: 1,
        width: 1,
      },
    })
      .raw()
      .toBuffer();
  } catch (error) {
    throw new TypeError('Background must be a valid opaque Sharp color.', { cause: error });
  }

  if (pixel[3] !== 255) {
    throw new TypeError('Background must be opaque for installable application icons.');
  }
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

  return Math.floor(size * maskableSafeZoneSquareRatio);
}

async function writeIco(workDirectory, output) {
  const images = await Promise.all(
    [16, 32, 48].map(async (size) => await readFile(join(workDirectory, `favicon-${String(size)}x${String(size)}.png`))),
  );

  await writeFile(output, createIco(images), {
    flag: 'wx',
  });
}

async function moveIfPresent(source, target) {
  try {
    await rename(source, target);

    return true;
  } catch (error) {
    if (error === null || typeof error !== 'object' || error.code !== 'ENOENT') {
      throw error;
    }

    return false;
  }
}

async function restorePublishedFiles(operations) {
  const failures = [];

  for (const { backup, hadTarget, target } of operations.toReversed()) {
    try {
      await rm(target, {
        force: true,
        recursive: true,
      });

      if (hadTarget) {
        await rename(backup, target);
      }
    } catch (error) {
      failures.push(error);
    }
  }

  return failures;
}

async function publish(stageDirectory, outputDirectory, hasSvg) {
  await mkdir(outputDirectory, {
    recursive: true,
  });

  const backupDirectory = join(dirname(stageDirectory), 'backup');
  const operations = [];

  await mkdir(backupDirectory);

  try {
    for (const name of outputNames) {
      const backup = join(backupDirectory, name);
      const target = join(outputDirectory, name);
      const hadTarget = await moveIfPresent(target, backup);

      operations.push({
        backup,
        hadTarget,
        target,
      });

      if (name !== 'favicon.svg' || hasSvg) {
        await rename(join(stageDirectory, name), target);
      }
    }
  } catch (error) {
    const rollbackFailures = await restorePublishedFiles(operations);

    if (rollbackFailures.length > 0) {
      throw new AggregateError([error, ...rollbackFailures], 'Unable to publish or restore the favicon bundle.');
    }

    throw error;
  }
}

export async function generateIcons({
  background,
  outputDirectory,
  source,
  style,
}) {
  if (style !== 'fullbleed' && style !== 'symbol') {
    throw new TypeError('Style must be "symbol" or "fullbleed".');
  }

  if (typeof background !== 'string' || background === '') {
    throw new TypeError('Background must be a non-empty opaque Sharp color.');
  }

  if (typeof source !== 'string' || source === '' || typeof outputDirectory !== 'string' || outputDirectory === '') {
    throw new TypeError('Source and output directory must be non-empty paths.');
  }

  const sourcePath = resolve(source);
  const outputPath = resolve(outputDirectory);
  const extension = await imageSourceExtension(sourcePath);
  const outputParent = dirname(outputPath);

  await assertOpaqueBackground(background);

  await mkdir(outputParent, {
    recursive: true,
  });

  const workDirectory = await mkdtemp(join(outputParent, '.tooling-favicons-'));
  const stageDirectory = join(workDirectory, 'output');

  try {
    await mkdir(stageDirectory);

    let renderSource = sourcePath;

    if (extension === '.svg') {
      const svg = await readFile(sourcePath, 'utf8');

      const optimized = optimize(svg, {
        multipass: true,
        path: sourcePath,
        plugins: [
          assertStaticSvgPlugin,
          {
            name: 'preset-default',
            params: {
              overrides: {
                cleanupIds: false,
              },
            },
          },
        ],
      });

      renderSource = join(stageDirectory, 'favicon.svg');
      await writeFile(renderSource, Buffer.byteLength(optimized.data) < Buffer.byteLength(svg) ? optimized.data : svg, {
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

    await writeIco(workDirectory, join(stageDirectory, 'favicon.ico'));
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

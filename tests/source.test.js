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
import { mkdir, open, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { imageSourceExtension } from '../src/source.js';
import { temporaryDirectory } from './helpers.js';

test('accepts every supported image extension case-insensitively', async (context) => {
  const directory = await temporaryDirectory(context);

  for (const [name, extension] of [
    ['image.SVG', '.svg'],
    ['image.PNG', '.png'],
    ['image.JPEG', '.jpeg'],
    ['image.JPG', '.jpg'],
  ]) {
    const path = join(directory, name);

    await writeFile(path, 'x');
    assert.equal(await imageSourceExtension(path), extension);
  }
});

test('rejects missing, non-file, oversized, and unsupported sources', async (context) => {
  const directory = await temporaryDirectory(context);
  const folder = join(directory, 'folder.svg');
  const oversized = join(directory, 'oversized.png');
  const unsupported = join(directory, 'image.gif');

  await mkdir(folder);
  await writeFile(unsupported, 'x');

  const file = await open(oversized, 'w');

  await file.truncate(16_777_217);
  await file.close();

  await assert.rejects(async () => await imageSourceExtension(join(directory, 'missing.svg')), { code: 'ENOENT' });
  await assert.rejects(async () => await imageSourceExtension(folder), /must be a file/u);
  await assert.rejects(async () => await imageSourceExtension(oversized), /must not exceed/u);
  await assert.rejects(async () => await imageSourceExtension(unsupported), /must be an SVG, PNG, JPEG, or JPG/u);
});

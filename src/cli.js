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

import process from 'node:process';
import { generateIcons } from './generate-icons.js';
import { renderIcon } from './render-icon.js';

class UsageError extends TypeError {
}

function parseSize(value, name) {
  if (!(/^[1-9]\d*$/u).test(value)) {
    throw new UsageError(`${name} must be a positive integer.`);
  }

  const size = Number(value);

  if (!Number.isSafeInteger(size)) {
    throw new UsageError(`${name} must be a positive safe integer.`);
  }

  return size;
}

export async function runGenerateIconsCli(argv = process.argv.slice(2)) {
  try {
    const [source, outputDirectory, style, background] = argv;

    if (
      source === undefined
      || outputDirectory === undefined
      || style === undefined
      || background === undefined
      || argv.length !== 4
    ) {
      throw new UsageError('Usage: generate-icons SOURCE OUTPUT_DIRECTORY STYLE BACKGROUND');
    }

    await generateIcons({
      background,
      outputDirectory,
      source,
      style,
    });

    return 0;
  } catch (error) {
    process.stderr.write(`generate-icons: ${error instanceof Error ? error.message : String(error)}\n`);

    return error instanceof UsageError ? 2 : 1;
  }
}

export async function runRenderIconCli(argv = process.argv.slice(2)) {
  try {
    const [source, output, canvasValue, contentValue, background] = argv;

    if (
      source === undefined
      || output === undefined
      || canvasValue === undefined
      || contentValue === undefined
      || background === undefined
      || argv.length !== 5
    ) {
      throw new UsageError('Usage: render-icon SOURCE OUTPUT CANVAS_SIZE CONTENT_SIZE BACKGROUND');
    }

    await renderIcon({
      background,
      canvasSize: parseSize(canvasValue, 'CANVAS_SIZE'),
      contentSize: parseSize(contentValue, 'CONTENT_SIZE'),
      output,
      source,
    });

    return 0;
  } catch (error) {
    process.stderr.write(`render-icon: ${error instanceof Error ? error.message : String(error)}\n`);

    return error instanceof UsageError ? 2 : 1;
  }
}

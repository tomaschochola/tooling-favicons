import { stat } from 'node:fs/promises';
import { extname } from 'node:path';

const maximumSourceBytes = 16_777_216;
const supportedExtensions = new Set(['.jpeg', '.jpg', '.png', '.svg']);

export async function imageSourceExtension(source) {
  const sourceStat = await stat(source);

  if (!sourceStat.isFile()) {
    throw new TypeError(`Source must be a file: ${source}`);
  }

  if (sourceStat.size > maximumSourceBytes) {
    throw new RangeError(`Source must not exceed ${String(maximumSourceBytes)} bytes.`);
  }

  const extension = extname(source).toLowerCase();

  if (!supportedExtensions.has(extension)) {
    throw new TypeError('Source must be an SVG, PNG, JPEG, or JPG file.');
  }

  return extension;
}

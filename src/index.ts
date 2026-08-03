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

import type { Buffer } from 'node:buffer';

export type FaviconStyle = 'fullbleed' | 'symbol';

export interface GenerateIconsOptions {
  readonly background: string;
  readonly outputDirectory: string;
  readonly source: string;
  readonly style: FaviconStyle;
}

export interface RenderIconOptions {
  readonly background: string;
  readonly canvasSize: number;
  readonly contentSize: number;
  readonly output: string;
  readonly source: string;
}

export declare function generateIcons(options: GenerateIconsOptions): Promise<void>;

export declare function createIco(images: readonly Buffer[]): Buffer;

export declare function renderIcon(options: RenderIconOptions): Promise<void>;

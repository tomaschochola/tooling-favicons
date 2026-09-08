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
import { readFile, writeFile } from 'node:fs/promises';
import { optimize } from 'svgo';

const maximumSvgElements = 100_000;
const svgFloatPrecision = 8;
const staticSvgCssControlPattern = /@import\b|@keyframes\b/iu;
const staticSvgCssUrlPattern = /url\s*\(/iu;
const staticSvgInternalCssUrlPattern = /url\s*\(\s*(["']?)#[^)"'\s]+\1\s*\)/giu;

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

function assertStaticSvgValue(value) {
    if (value.includes('\\')) {
        throw new TypeError('SVG source must not contain CSS escape sequences.');
    }

    const withoutInternalReferences = value.replace(staticSvgInternalCssUrlPattern, '');

    if (staticSvgCssControlPattern.test(value) || staticSvgCssUrlPattern.test(withoutInternalReferences)) {
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

export async function writeOptimizedSvg(source, output) {
    const svg = await readFile(source, 'utf8');
    const optimized = optimize(svg, {
        floatPrecision: svgFloatPrecision,
        multipass: true,
        path: source,
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

    await writeFile(output, Buffer.byteLength(optimized.data) < Buffer.byteLength(svg) ? optimized.data : svg, {
        encoding: 'utf8',
        flag: 'wx',
    });
}

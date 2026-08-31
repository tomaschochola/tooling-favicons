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
import process from 'node:process';
import test from 'node:test';
import { executeCli } from '../src/command.js';
import { temporaryDirectory, writeSvg } from './helpers.js';

function createStreams() {
    const output = {
        stderr: '',
        stdout: '',
    };

    return {
        output,
        streams: {
            stderr: {
                write(value) {
                    output.stderr += value;
                },
            },
            stdout: {
                write(value) {
                    output.stdout += value;
                },
            },
        },
    };
}

test('prints help without starting generation', async () => {
    const { output, streams } = createStreams();
    let generated = false;

    const exitCode = await executeCli(['--help'], streams, async () => {
        generated = true;
    });

    assert.equal(exitCode, 0);
    assert.equal(generated, false);
    assert.match(output.stdout, /^Usage:/u);
    assert.equal(output.stderr, '');
});

test('passes parsed options to the selected operation', async () => {
    const { output, streams } = createStreams();
    let received;

    const exitCode = await executeCli(['png', 'source.svg', 'icon.png', '--background', 'transparent', '--canvas-size', '64', '--artwork-size', '32'], streams, async (options) => {
        received = options;
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(received, {
        artworkSize: 32,
        background: 'transparent',
        canvasSize: 64,
        output: 'icon.png',
        source: 'source.svg',
        type: 'png',
    });
    assert.deepEqual(output, {
        stderr: '',
        stdout: '',
    });
});

test('distinguishes usage, operational, and non-Error failures', async () => {
    const usage = createStreams();
    const operational = createStreams();
    const nonError = createStreams();
    const arguments_ = ['png', 'source.svg', 'icon.png', '--background', 'transparent', '--canvas-size', '64', '--artwork-size', '32'];

    assert.equal(await executeCli([], usage.streams), 2);
    assert.match(usage.output.stderr, /^tooling-favicons: Expected a command/u);
    assert.match(usage.output.stderr, /Usage:/u);
    assert.equal(usage.output.stdout, '');

    assert.equal(
        await executeCli(arguments_, operational.streams, async () => {
            throw new Error('generation failed');
        }),
        1,
    );
    assert.equal(operational.output.stderr, 'tooling-favicons: generation failed\n');

    assert.equal(
        await executeCli(arguments_, nonError.streams, async () => {
            throw 'non-error';
        }),
        1,
    );
    assert.equal(nonError.output.stderr, 'tooling-favicons: non-error\n');
});

test('dispatches a parsed command to the production generator', async (context) => {
    const directory = await temporaryDirectory(context);
    const source = `${directory}/source.svg`;
    const output = `${directory}/icon.png`;
    const streams = createStreams();

    await writeSvg(source);

    assert.equal(await executeCli(['png', source, output, '--background', 'transparent', '--canvas-size', '64', '--artwork-size', '32'], streams.streams), 0);
    assert.deepEqual(streams.output, {
        stderr: '',
        stdout: '',
    });
});

test('executable entry point delegates process arguments to the command', async (context) => {
    let stdout = '';
    const originalArguments = process.argv;
    const originalExitCode = process.exitCode;

    context.mock.method(process.stdout, 'write', (value) => {
        stdout += value;

        return true;
    });

    try {
        process.argv = [process.execPath, 'tooling-favicons', '--help'];
        await import('../src/cli.js');
        assert.equal(process.exitCode, 0);
        assert.match(stdout, /Usage:/u);
    } finally {
        process.argv = originalArguments;
        process.exitCode = originalExitCode;
    }
});

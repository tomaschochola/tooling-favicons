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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { PublishBundleError, publishBundle, restore } from '../src/publish.js';
import { temporaryDirectory } from './helpers.js';

test('publishes staged files, replaces targets, and removes stale managed files', async (context) => {
    const directory = await temporaryDirectory(context);
    const outputDirectory = join(directory, 'output');
    const stageDirectory = join(directory, 'stage');
    const workDirectory = join(directory, 'work');

    await mkdir(outputDirectory);
    await mkdir(stageDirectory);
    await mkdir(workDirectory);
    await writeFile(join(outputDirectory, 'replace'), 'old');
    await writeFile(join(outputDirectory, 'stale'), 'old');
    await writeFile(join(stageDirectory, 'replace'), 'new');
    await writeFile(join(stageDirectory, 'create'), 'new');
    await publishBundle({ managedNames: ['replace', 'create', 'stale'], outputDirectory, stageDirectory, workDirectory });

    assert.equal(await readFile(join(outputDirectory, 'replace'), 'utf8'), 'new');
    assert.equal(await readFile(join(outputDirectory, 'create'), 'utf8'), 'new');
    await assert.rejects(async () => await readFile(join(outputDirectory, 'stale')), { code: 'ENOENT' });
});

test('rolls back all completed replacements when publication fails', async (context) => {
    const directory = await temporaryDirectory(context);
    const outputDirectory = join(directory, 'output');
    const stageDirectory = join(directory, 'stage');
    const workDirectory = join(directory, 'work');

    await mkdir(outputDirectory);
    await mkdir(stageDirectory);
    await mkdir(workDirectory);
    await writeFile(join(outputDirectory, 'first'), 'old');
    await writeFile(join(outputDirectory, 'parent'), 'blocking file');
    await writeFile(join(stageDirectory, 'first'), 'new');

    await assert.rejects(
        async () => await publishBundle({ managedNames: ['first', 'parent/second'], outputDirectory, stageDirectory, workDirectory }),
        (error) => error instanceof PublishBundleError && !error.recoveryRequired,
    );
    assert.equal(await readFile(join(outputDirectory, 'first'), 'utf8'), 'old');
});

test('reports rollback failures without abandoning remaining restoration work', async (context) => {
    const directory = await temporaryDirectory(context);
    const target = join(directory, 'target');

    await writeFile(target, 'remove');

    const failures = await restore([
        {
            backup: join(directory, 'missing-backup'),
            hadTarget: true,
            target,
        },
    ]);

    assert.equal(failures.length, 1);
    assert.equal(failures[0].code, 'ENOENT');
});

test('preserves recovery metadata when publication rollback fails', async (context) => {
    const directory = await temporaryDirectory(context);
    const outputDirectory = join(directory, 'output');
    const stageDirectory = join(directory, 'stage');
    const workDirectory = join(directory, 'work');

    await mkdir(outputDirectory);
    await mkdir(stageDirectory);
    await mkdir(workDirectory);
    await writeFile(join(outputDirectory, 'first'), 'old');
    await writeFile(join(outputDirectory, 'parent'), 'blocking file');
    await writeFile(join(stageDirectory, 'first'), 'new');

    await assert.rejects(
        async () => await publishBundle({ managedNames: ['first', 'parent/second'], outputDirectory, stageDirectory, workDirectory }, async () => [new Error('rollback failed')]),
        (error) => error instanceof PublishBundleError && error.recoveryRequired && error.message.includes(join(workDirectory, 'backup')),
    );
});

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

import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export class PublishBundleError extends AggregateError {
    constructor(errors, message, options = {}) {
        super(errors, message, options);

        this.recoveryRequired = errors.length > 1;
    }
}

async function moveIfPresent(source, target) {
    try {
        await rename(source, target);

        return true;
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }

        return false;
    }
}

export async function restore(operations) {
    const failures = [];

    for (const { backup, hadTarget, target } of operations.toReversed()) {
        try {
            await rm(target, { force: true, recursive: true });

            if (hadTarget) {
                await rename(backup, target);
            }
        } catch (error) {
            failures.push(error);
        }
    }

    return failures;
}

export async function publishBundle({ managedNames, outputDirectory, stageDirectory, workDirectory }, restoreOperation = restore) {
    await mkdir(outputDirectory, { recursive: true });

    const backupDirectory = join(workDirectory, 'backup');
    const operations = [];

    await mkdir(backupDirectory);

    try {
        for (const name of managedNames) {
            const backup = join(backupDirectory, name);
            const target = join(outputDirectory, name);
            const hadTarget = await moveIfPresent(target, backup);

            operations.push({ backup, hadTarget, target });
            await moveIfPresent(join(stageDirectory, name), target);
        }
    } catch (error) {
        const rollbackFailures = await restoreOperation(operations);
        const recoveryMessage = rollbackFailures.length === 0 ? '' : ` Recovery data was preserved at ${backupDirectory}.`;

        throw new PublishBundleError([error, ...rollbackFailures], `Unable to publish generated icon files: ${error.message}.${recoveryMessage}`, { cause: error });
    }
}

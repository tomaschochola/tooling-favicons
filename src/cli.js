#!/usr/bin/env node

import process from 'node:process';
import { executeCli } from './command.js';

process.exitCode = await executeCli(process.argv.slice(2), process);

#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { terminateTree } from './terminate.js';
import type { ProcessSignal } from './types.js';

const HELP = `kill-tree <pid> [signal] [options]

Reliably terminate a process and its descendants.

Options:
  --force-after <ms>  Wait before escalating to SIGKILL (default: 5000)
  --poll <ms>         Liveness polling interval (default: 50)
  --no-root           Terminate descendants but leave the root process alive
  --allow-pid-1       Explicitly permit targeting PID 1
  --json              Print the structured termination report as JSON
  -h, --help          Show this help
  -v, --version       Show the package version
`;

interface CliOptions {
  pid?: number;
  signal?: ProcessSignal;
  gracePeriodMs?: number;
  pollIntervalMs?: number;
  includeRoot: boolean;
  allowPid1: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

function readNumber(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`${flag} requires a value`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${flag} must be a non-negative number`);
  }
  return parsed;
}

export function parseArgs(args: string[]): CliOptions {
  const parsed: CliOptions = {
    includeRoot: true,
    allowPid1: false,
    json: false,
    help: false,
    version: false,
  };
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (argument === '--') {
      positional.push(...args.slice(index + 1));
      break;
    }
    if (argument === '-h' || argument === '--help') parsed.help = true;
    else if (argument === '-v' || argument === '--version') parsed.version = true;
    else if (argument === '--json') parsed.json = true;
    else if (argument === '--no-root') parsed.includeRoot = false;
    else if (argument === '--allow-pid-1') parsed.allowPid1 = true;
    else if (argument === '--force-after') {
      parsed.gracePeriodMs = readNumber(args[(index += 1)], argument);
    } else if (argument.startsWith('--force-after=')) {
      parsed.gracePeriodMs = readNumber(argument.split('=', 2)[1], '--force-after');
    } else if (argument === '--poll') {
      parsed.pollIntervalMs = readNumber(args[(index += 1)], argument);
    } else if (argument.startsWith('--poll=')) {
      parsed.pollIntervalMs = readNumber(argument.split('=', 2)[1], '--poll');
    } else if (argument.startsWith('-')) {
      throw new Error(`unknown option: ${argument}`);
    } else positional.push(argument);
  }

  if (positional[0] !== undefined) parsed.pid = Number(positional[0]);
  if (positional[1] !== undefined) {
    const numeric = Number(positional[1]);
    parsed.signal = Number.isNaN(numeric)
      ? (positional[1] as NodeJS.Signals)
      : numeric;
  }
  if (positional.length > 2) throw new Error('too many positional arguments');
  return parsed;
}

async function readVersion(): Promise<string> {
  const contents = await readFile(new URL('../package.json', import.meta.url), 'utf8');
  return (JSON.parse(contents) as { version: string }).version;
}

async function main(): Promise<void> {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`kill-tree: ${(error as Error).message}`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.version) {
    console.log(await readVersion());
    return;
  }
  if (options.pid === undefined) {
    console.error('kill-tree: missing pid\n');
    process.stderr.write(HELP);
    process.exitCode = 2;
    return;
  }

  try {
    const report = await terminateTree(options.pid, {
      ...(options.signal !== undefined ? { signal: options.signal } : {}),
      ...(options.gracePeriodMs !== undefined
        ? { gracePeriodMs: options.gracePeriodMs }
        : {}),
      ...(options.pollIntervalMs !== undefined
        ? { pollIntervalMs: options.pollIntervalMs }
        : {}),
      includeRoot: options.includeRoot,
      allowPid1: options.allowPid1,
      ignoreMissing: false,
    });

    if (options.json) console.log(JSON.stringify(report, null, 2));
    else {
      const escalation = report.escalated ? ' after escalation' : '';
      console.log(
        `terminated ${report.exited.length} process${report.exited.length === 1 ? '' : 'es'}${escalation} in ${Math.round(report.durationMs)}ms`,
      );
    }
    if (report.survivors.length > 0 || report.failures.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    console.error(`kill-tree: ${nodeError.message}`);
    process.exitCode = nodeError.code === 'ESRCH' ? 1 : 2;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href
) {
  void main();
}

#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatProjectTextReport, formatTextReport } from '../core/reporter';
import { analyzeProject } from '../project/analyze-project';
import { analyzeReactSources } from '../react/analyze';
import {
  TOOL_VERSION,
  createAnalysisJsonReport,
  createProjectJsonReport,
} from '../report-schema';

interface CliOptions {
  component?: string;
  test?: string;
  root?: string;
  json: boolean;
}

interface ParsedOptions {
  options: CliOptions;
  error?: string;
}

function usage(): string {
  return [
    `ui-behavior-coverage ${TOOL_VERSION}`,
    '',
    'Usage:',
    '  ubc scan [root] [--json]',
    '  ubc analyze --component <component.tsx> --test <component.test.tsx> [--json]',
    '  ubc --version',
    '',
    'What scan understands:',
    '  React/TSX/JSX projects with Jest/Vitest-style tests and Testing Library-style assertions.',
    '  Native disabled-button suppression and Material UI Button, Checkbox, Switch, Radio,',
    '  TextField/native Select behavior, rendered disabled/checked/value state, reliable open-state',
    '  visibility, explicit aria-* forwarding, and limited useInput/useController form state.',
    '  Project discovery includes local component composition, barrel exports, tsconfig path aliases,',
    '  simple prop forwarding, styled wrappers, and configurable render-helper normalization.',
    '',
    'Exit codes:',
    '  0  scan/analyze completed successfully',
    '  1  invalid command or arguments',
    '  2  analysis or filesystem failure',
    '',
    'JSON output is versioned with schemaVersion and toolVersion.',
  ].join('\n');
}

function parseOptions(args: string[], allowRoot: boolean): ParsedOptions {
  const options: CliOptions = { json: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--component' || arg === '--test') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        return { options, error: `${arg} requires a file path.` };
      }
      if (arg === '--component') options.component = value;
      else options.test = value;
      i += 1;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg?.startsWith('-')) {
      return { options, error: `Unknown option: ${arg}` };
    }
    if (arg) {
      if (!allowRoot) return { options, error: `Unexpected argument: ${arg}` };
      if (options.root) return { options, error: 'Only one scan root may be supplied.' };
      options.root = arg;
    }
  }

  return { options };
}

function usageError(message: string): void {
  process.stderr.write(`${message}\n\n${usage()}\n`);
  process.exitCode = 1;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return;
  }

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const command = args[0];
  if (command !== 'scan' && command !== 'analyze') {
    usageError(`Unknown command: ${command ?? ''}`);
    return;
  }

  const parsed = parseOptions(args.slice(1), command === 'scan');
  if (parsed.error) {
    usageError(parsed.error);
    return;
  }
  const options = parsed.options;

  if (command === 'scan') {
    if (options.component || options.test) {
      usageError('--component and --test are only valid with the analyze command.');
      return;
    }
    const report = analyzeProject(options.root ?? '.');
    if (options.json) {
      process.stdout.write(`${JSON.stringify(createProjectJsonReport(report), null, 2)}\n`);
    } else {
      process.stdout.write(`${formatProjectTextReport(report)}\n`);
    }
    return;
  }

  if (!options.component || !options.test) {
    usageError('Both --component and --test are required.');
    return;
  }

  const componentFile = resolve(options.component);
  const testFile = resolve(options.test);
  const report = analyzeReactSources({
    componentSource: readFileSync(componentFile, 'utf8'),
    testSource: readFileSync(testFile, 'utf8'),
    componentFile,
    testFile,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(createAnalysisJsonReport(report), null, 2)}\n`);
  } else {
    process.stdout.write(`${formatTextReport(report)}\n`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Analysis failed: ${message}\n`);
  process.exitCode = 2;
}

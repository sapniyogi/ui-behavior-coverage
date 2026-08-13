#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatProjectTextReport, formatTextReport } from '../core/reporter';
import { analyzeProject } from '../project/analyze-project';
import { analyzeReactSources } from '../react/analyze';

interface CliOptions {
  component?: string;
  test?: string;
  root?: string;
  json: boolean;
}

function usage(): string {
  return [
    'ui-behavior-coverage',
    '',
    'Usage:',
    '  ubc analyze --component <component.tsx> --test <component.test.tsx> [--json]',
    '  ubc scan [root] [--json]',
    '',
    'Scope:',
    '  React/TSX source + Jest/Vitest-style tests using render(), click(), and expect().',
    '  Providers: native HTML and Material UI Button/Checkbox behavioral contracts.',
    '  Project scan supports local TSX components and supported direct @mui/material test imports.',
  ].join('\n');
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { json: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--component') options.component = args[++i];
    else if (arg === '--test') options.test = args[++i];
    else if (arg === '--json') options.json = true;
    else if (arg && !arg.startsWith('-') && !options.root) options.root = arg;
  }

  return options;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const command = args[0];
  const options = parseArgs(args.slice(1));

  if (command === 'scan') {
    const report = analyzeProject(options.root ?? '.');
    if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else process.stdout.write(`${formatProjectTextReport(report)}\n`);
    return;
  }

  if (command !== 'analyze') {
    process.stderr.write(`Unknown command: ${command ?? ''}\n\n${usage()}\n`);
    process.exitCode = 1;
    return;
  }

  if (!options.component || !options.test) {
    process.stderr.write(`Both --component and --test are required.\n\n${usage()}\n`);
    process.exitCode = 1;
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

  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${formatTextReport(report)}\n`);
}

main();

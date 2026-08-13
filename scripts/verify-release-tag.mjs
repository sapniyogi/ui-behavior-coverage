import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];

assert.ok(tag, 'A release tag is required through GITHUB_REF_NAME or argv.');
assert.equal(tag, `v${packageJson.version}`, `Release tag ${tag} must match package version ${packageJson.version}.`);

process.stdout.write(`Release tag ${tag} matches package version ${packageJson.version}.\n`);

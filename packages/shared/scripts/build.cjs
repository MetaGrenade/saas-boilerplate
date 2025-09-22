#!/usr/bin/env node
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

function exitWithError(message, error) {
  console.error(message);
  if (error) {
    console.error(error);
  }
  process.exit(1);
}

let tscExecutable;
try {
  tscExecutable = require.resolve('typescript/bin/tsc', { paths: [__dirname] });
} catch (error) {
  exitWithError('Unable to locate the local TypeScript compiler. Did you install dependencies for @saas-boilerplate/shared?', error);
}

const tsconfigPath = resolve(__dirname, '../tsconfig.build.json');

const result = spawnSync(process.execPath, [tscExecutable, '--project', tsconfigPath], {
  stdio: 'inherit',
});

if (typeof result.status === 'number' && result.status !== 0) {
  process.exit(result.status);
}

if (result.error) {
  exitWithError('Failed to run the TypeScript compiler.', result.error);
}

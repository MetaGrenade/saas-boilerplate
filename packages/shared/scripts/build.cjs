#!/usr/bin/env node
const { existsSync, readdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { spawnSync } = require('node:child_process');

function exitWithError(message, error) {
  console.error(message);
  if (error) {
    console.error(error);
  }
  process.exit(1);
}

const packageRoot = resolve(__dirname, '..');

const candidateResolutionDirectories = new Set([
  __dirname,
  packageRoot,
]);

const workspaceRoot = (() => {
  let current = packageRoot;

  while (true) {
    const parent = resolve(current, '..');

    if (parent === current) {
      return null;
    }

    if (existsSync(resolve(parent, 'pnpm-workspace.yaml'))) {
      return parent;
    }

    current = parent;
  }
})();

if (workspaceRoot) {
  candidateResolutionDirectories.add(workspaceRoot);

  const packagesDir = resolve(workspaceRoot, 'packages');
  try {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidateResolutionDirectories.add(resolve(packagesDir, entry.name));
      }
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn('Failed to inspect workspace packages while resolving TypeScript.', error);
    }
  }
}

let tscExecutable;
for (const baseDir of candidateResolutionDirectories) {
  try {
    const typescriptPackageJson = require.resolve('typescript/package.json', { paths: [baseDir] });
    tscExecutable = resolve(dirname(typescriptPackageJson), 'bin', 'tsc');
    break;
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') {
      console.warn(`Attempted to resolve TypeScript from "${baseDir}" but failed.`, error);
    }
  }
}

if (!tscExecutable) {
  exitWithError(
    'Unable to locate the local TypeScript compiler. Did you install dependencies for @saas-boilerplate/shared?',
  );
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

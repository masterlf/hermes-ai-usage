'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const harness = path.join(root, 'tests', 'fuzz_ui_contracts.js');
const usage = 'Usage: FUZZ_RUNS=<1..1000> [FUZZ_SEED=<signed-32-bit-integer> [FUZZ_PATH=<counterexample-path>]] make fuzz';

function validate(overrides = {}) {
  const env = { ...process.env };
  for (const name of ['FUZZ_RUNS', 'FUZZ_SEED', 'FUZZ_PATH']) delete env[name];
  Object.assign(env, overrides);
  return spawnSync(process.execPath, [harness, '--validate-config'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 5_000
  });
}

for (const [name, env, expected] of [
  ['default runs', {}, 'fuzz config: ok (250 runs/property)\n'],
  ['maximum runs', { FUZZ_RUNS: '1000' }, 'fuzz config: ok (1000 runs/property)\n'],
  ['seed replay', { FUZZ_SEED: '-123' }, 'fuzz config: ok (250 runs/property, seed -123)\n'],
  ['seed and path replay', { FUZZ_SEED: '123', FUZZ_PATH: '4:2:0' }, 'fuzz config: ok (250 runs/property, seed 123, path 4:2:0)\n']
]) {
  const result = validate(env);
  assert.strictEqual(result.status, 0, `${name} rejected: ${result.stderr}`);
  assert.strictEqual(result.stdout, expected, `${name} reported an unexpected configuration`);
  assert.strictEqual(result.stderr, '', `${name} wrote to stderr`);
}

for (const [name, env] of [
  ['empty runs', { FUZZ_RUNS: '' }],
  ['noninteger runs', { FUZZ_RUNS: 'abc' }],
  ['fractional runs', { FUZZ_RUNS: '1.5' }],
  ['zero runs', { FUZZ_RUNS: '0' }],
  ['negative runs', { FUZZ_RUNS: '-1' }],
  ['runs above ceiling', { FUZZ_RUNS: '1001' }],
  ['runs with suffix', { FUZZ_RUNS: '12runs' }],
  ['runs with whitespace', { FUZZ_RUNS: ' 10' }],
  ['empty seed', { FUZZ_SEED: '' }],
  ['noninteger seed', { FUZZ_SEED: '1x' }],
  ['seed above signed 32-bit range', { FUZZ_SEED: '2147483648' }],
  ['path without seed', { FUZZ_PATH: '1:0' }],
  ['empty path', { FUZZ_SEED: '1', FUZZ_PATH: '' }],
  ['malformed path', { FUZZ_SEED: '1', FUZZ_PATH: '1::0' }]
]) {
  const result = validate(env);
  assert.strictEqual(result.status, 2, `${name} did not fail with usage status: stdout=${result.stdout} stderr=${result.stderr}`);
  assert.strictEqual(result.stdout, '', `${name} wrote to stdout`);
  assert.strictEqual(result.stderr, `${usage}\n`, `${name} did not return the sanitized usage error`);
}

console.log('fuzz configuration contract: ok');

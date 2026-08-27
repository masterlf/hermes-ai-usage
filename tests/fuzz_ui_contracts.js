'use strict';

const USAGE = 'Usage: FUZZ_RUNS=<1..1000> [FUZZ_SEED=<signed-32-bit-integer> [FUZZ_PATH=<counterexample-path>]] make fuzz';

function failUsage() {
  console.error(USAGE);
  process.exit(2);
}

function parseInteger(name, fallback, minimum, maximum) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) return fallback;
  const raw = process.env[name];
  if (!/^-?(0|[1-9]\d*)$/.test(raw)) failUsage();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) failUsage();
  return value;
}

function parseReplayPath() {
  if (!Object.prototype.hasOwnProperty.call(process.env, 'FUZZ_PATH')) return undefined;
  const path = process.env.FUZZ_PATH;
  if (!Object.prototype.hasOwnProperty.call(process.env, 'FUZZ_SEED')
      || path.length > 4096
      || !/^\d+(?::\d+)*$/.test(path)
      || path.split(':').some(part => !Number.isSafeInteger(Number(part)))) {
    failUsage();
  }
  return path;
}

const RUNS = parseInteger('FUZZ_RUNS', 250, 1, 1000);
const SEED = parseInteger('FUZZ_SEED', undefined, -2147483648, 2147483647);
const PATH = parseReplayPath();
const parameters = {
  numRuns: RUNS,
  interruptAfterTimeLimit: 20_000,
  markInterruptAsFailure: true,
  verbose: 1
};
if (SEED !== undefined) parameters.seed = SEED;
if (PATH !== undefined) parameters.path = PATH;

if (process.argv.length === 3 && process.argv[2] === '--validate-config') {
  const replay = [SEED === undefined ? null : `seed ${SEED}`, PATH === undefined ? null : `path ${PATH}`]
    .filter(Boolean)
    .join(', ');
  console.log(`fuzz config: ok (${RUNS} runs/property${replay ? `, ${replay}` : ''})`);
  process.exit(0);
}

const assert = require('assert');
const fc = require('fast-check');
const fs = require('fs');
const vm = require('vm');

function createElement(type, props, ...children) {
  return { type, props: { ...(props || {}), children: children.length === 1 ? children[0] : children }, children };
}

function loadWebContracts() {
  let source = fs.readFileSync('dashboard/dist/index.js', 'utf8');
  const marker = 'registry.register("ai-usage-monitor", AIUsagePage);';
  assert(source.includes(marker), 'Web bundle registration marker changed');
  source = source.replace(marker, [
    'window.__contracts = { compositionOf, quotaPercentages, normalizeHistoryResponse,',
    '  HistoryUnavailable, ProfileBreakdown, UsageChart, HistoryTable, text };',
    marker
  ].join('\n'));
  const React = {
    createElement,
    useState: initial => [initial, () => {}],
    useRef: initial => ({ current: initial }),
    useCallback: fn => fn,
    useEffect: () => {}
  };
  const sandbox = {
    window: {
      __HERMES_PLUGIN_SDK__: { React, fetchJSON: () => Promise.resolve({}) },
      __HERMES_PLUGINS__: { register: () => {} },
      setInterval: () => 1,
      clearInterval: () => {}
    },
    document: { documentElement: { lang: 'en' } },
    navigator: { language: 'en-US' },
    ResizeObserver: class ResizeObserver { observe() {} disconnect() {} },
    Intl, Number, Date, Promise, Object, String, Math, console
  };
  vm.runInNewContext(source, sandbox, { timeout: 2_000 });
  return sandbox.window.__contracts;
}

function loadDesktopContracts() {
  const original = fs.readFileSync('desktop/plugin.js', 'utf8');
  const bodyStart = original.indexOf('\n\nconst ID');
  assert(bodyStart >= 0, 'Desktop import boundary changed');
  let source = `
const haptic = () => {};
const host = { state: { profile: 'default', activeSessionId: null }, navigate: () => {}, request: () => Promise.resolve({}) };
const PALETTE_AREA = 'palette';
const ROUTES_AREA = 'routes';
const SIDEBAR_NAV_AREA = 'sidebar';
const STATUSBAR_AREAS = { right: 'status-right' };
const Tip = function Tip() {};
const usePluginI18n = () => (key, ...args) => key + (args.length ? ':' + args.join(',') : '');
const useQuery = () => ({ data: null, refetch: () => {} });
const useValue = value => value;
const useState = initial => [initial, () => {}];
const useRef = initial => ({ current: initial });
const useEffect = () => {};
const jsx = (type, props) => ({ type, props: props || {} });
const jsxs = jsx;
` + original.slice(bodyStart + 2);
  source = source.replace('export default {', [
    'globalThis.__contracts = { compositionOf, quotaPercentages, normalizeHistoryResponse,',
    '  HistoryUnavailable, ProfileBreakdown, UsageChart, HistoryCard };',
    'globalThis.__plugin = {'
  ].join('\n'));
  const sandbox = {
    globalThis: {},
    document: { documentElement: { lang: 'en' } },
    navigator: { language: 'en-US' },
    ResizeObserver: class ResizeObserver { observe() {} disconnect() {} },
    Intl, Number, Date, Promise, Object, String, Math, console
  };
  vm.runInNewContext(source, sandbox, { timeout: 2_000 });
  return sandbox.globalThis.__contracts;
}

const web = loadWebContracts();
const desktop = loadDesktopContracts();
for (const contracts of [web, desktop]) {
  for (const name of ['compositionOf', 'quotaPercentages', 'normalizeHistoryResponse']) {
    assert.strictEqual(typeof contracts[name], 'function', `${name} was not loaded from product code`);
  }
}

function resolveTree(node, depth = 0) {
  if (depth > 100) throw new Error('render tree exceeded depth bound');
  if (node == null || node === false || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(child => resolveTree(child, depth + 1));
  if (typeof node.type === 'function') return resolveTree(node.type(node.props || {}), depth + 1);
  const children = node.children !== undefined ? node.children : node.props && node.props.children;
  return { ...node, children: resolveTree(children, depth + 1), props: { ...(node.props || {}) } };
}

function assertNoCodeSink(node) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach(assertNoCodeSink);
  const props = node.props || {};
  for (const sink of ['dangerouslySetInnerHTML', 'innerHTML', 'outerHTML']) {
    assert(!Object.prototype.hasOwnProperty.call(props, sink), `render introduced ${sink}`);
  }
  assertNoCodeSink(node.children !== undefined ? node.children : props.children);
}

function containsRole(node, role) {
  if (node == null || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(child => containsRole(child, role));
  return Boolean(node.props && node.props.role === role)
    || containsRole(node.children !== undefined ? node.children : node.props && node.props.children, role);
}

const counter = fc.oneof(
  fc.integer({ min: 0, max: 1_000_000_000 }),
  fc.constantFrom(0, 1, Number.MAX_SAFE_INTEGER)
);
const timestamp = fc.oneof(
  counter,
  fc.double({ min: 0, max: Number.MAX_VALUE, noNaN: true, noDefaultInfinity: true })
);
const counters = fc.record({
  sessions: counter,
  api_calls: counter,
  input_tokens: counter,
  output_tokens: counter,
  cache_read_tokens: counter,
  cache_write_tokens: counter,
  reasoning_tokens: counter,
  total_tokens: counter
});
const hostileString = fc.oneof(
  fc.string({ maxLength: 80 }),
  fc.constantFrom(
    '<img src=x onerror=globalThis.__fuzzExecuted=true>',
    '<script>globalThis.__fuzzExecuted=true</script>',
    '${7*7}', '{{constructor.constructor("return process")()}}',
    '\u202e<script>', '\u0000\n\r\t&< >"\''
  )
);
const point = fc.record({ bucket_start: counter }).chain(base =>
  counters.map(values => ({ ...values, ...base }))
);
const profile = fc.tuple(hostileString.filter(value => value.length > 0 && value.length <= 64), counters)
  .map(([name, values]) => ({ profile: name, ...values }));
const row = fc.record({
  started_at: timestamp,
  ended_at: fc.oneof(fc.constant(null), timestamp),
  duration_seconds: counter,
  is_active: fc.boolean(),
  api_call_count: counter,
  input_tokens: counter,
  output_tokens: counter,
  cache_read_tokens: counter,
  cache_write_tokens: counter,
  reasoning_tokens: counter,
  total_tokens: counter,
  model: hostileString,
  provider: hostileString,
  surface: hostileString,
  source: hostileString,
  workload_type: hostileString,
  profile: fc.oneof(fc.constant(null), hostileString),
  session_ref: fc.oneof(fc.constant(null), hostileString)
});
const validHistory = fc.record({
  available: fc.constant(true),
  days: fc.integer({ min: 1, max: 90 }),
  profile_scope: fc.constantFrom('current', 'all'),
  provider_quota_scope: fc.constant('account_shared_not_attributed'),
  totals: counters,
  series: fc.tuple(fc.constantFrom('hour', 'day'), fc.array(point, { maxLength: 8 }))
    .map(([bucket, points]) => ({ bucket, bucket_seconds: bucket === 'hour' ? 3600 : 86400, timezone: 'UTC', points })),
  rows: fc.array(row, { maxLength: 8 }),
  profiles: fc.array(profile, { maxLength: 8 }),
  row_count: counter,
  rows_truncated: fc.boolean(),
  selected_bucket_start: fc.oneof(fc.constant(null), counter),
  partial: fc.boolean()
});

fc.assert(fc.property(fc.anything({ maxDepth: 5, maxKeys: 20 }), payload => {
  const webResult = web.normalizeHistoryResponse({ history: payload });
  const desktopResult = desktop.normalizeHistoryResponse({ history: payload });
  assert.strictEqual(webResult.available === false, desktopResult.available === false, 'Web/Desktop malformed semantics diverged');
  if (webResult.available === false) {
    assert.deepStrictEqual(Object.keys(webResult), ['available']);
    assert.deepStrictEqual(Object.keys(desktopResult), ['available']);
    const webUnavailable = resolveTree(web.HistoryUnavailable({ history: webResult, error: false, t: web.text() }));
    const desktopUnavailable = resolveTree(desktop.HistoryUnavailable({ history: desktopResult, error: false }));
    assert(containsRole(webUnavailable, 'alert'), 'Web malformed success did not render unavailable alert');
    assert(containsRole(desktopUnavailable, 'alert'), 'Desktop malformed success did not render unavailable alert');
  }
}), parameters);

fc.assert(fc.property(validHistory, history => {
  assert.strictEqual(web.normalizeHistoryResponse({ history }), history, 'Web rejected valid history');
  assert.strictEqual(desktop.normalizeHistoryResponse({ history }), history, 'Desktop rejected valid history');
  const webT = web.text();
  const trees = [
    web.ProfileBreakdown({ history, t: webT }),
    web.UsageChart({ history, t: webT, days: history.days, selectedBucket: null, onDays: () => {}, onSelect: () => {} }),
    web.HistoryTable({ history, selectedBucket: null, t: webT }),
    desktop.ProfileBreakdown({ history }),
    desktop.UsageChart({ history, days: history.days, selectedBucket: null, onDays: () => {}, onSelect: () => {} }),
    desktop.HistoryCard({ history, selectedBucket: null })
  ];
  for (const tree of trees) assertNoCodeSink(resolveTree(tree));
}), parameters);

const numericLike = fc.oneof(
  fc.double({ noNaN: false, noDefaultInfinity: false }),
  fc.integer(), hostileString,
  fc.constantFrom(NaN, Infinity, -Infinity, Number.MAX_VALUE, Number.MIN_VALUE),
  fc.constant(null), fc.constant(undefined), fc.constant({}), fc.constant([])
);
fc.assert(fc.property(fc.record({
  input_tokens: numericLike,
  output_tokens: numericLike,
  cache_read_tokens: numericLike,
  cache_write_tokens: numericLike,
  reasoning_tokens: numericLike
}), fc.record({ used_percent: numericLike, remaining_percent: numericLike }), (usage, window) => {
  const webComposition = web.compositionOf(usage);
  const desktopComposition = desktop.compositionOf(usage);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(webComposition)), JSON.parse(JSON.stringify(desktopComposition)), 'Web/Desktop counter semantics diverged');
  for (const value of [...webComposition.shareTenths, webComposition.reasoningOutputTenths]) {
    assert(Number.isFinite(value) && value >= 0 && value <= 1000, 'percentage escaped 0..1000 tenths');
  }
  const webQuota = web.quotaPercentages(window);
  const desktopQuota = desktop.quotaPercentages(window);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(webQuota)), JSON.parse(JSON.stringify(desktopQuota)), 'Web/Desktop quota semantics diverged');
  for (const value of [webQuota.used, webQuota.remaining]) {
    assert(value === null || (Number.isFinite(value) && value >= 0 && value <= 100), 'quota escaped 0..100');
  }
}), parameters);

const zeroHistory = {
  available: true, days: 7, profile_scope: 'all', provider_quota_scope: 'account_shared_not_attributed',
  totals: { sessions: 0, api_calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 0 },
  series: { bucket: 'day', bucket_seconds: 86400, timezone: 'UTC', points: [] },
  rows: [], profiles: [], row_count: 0, rows_truncated: false, selected_bucket_start: null, partial: false
};
assert.strictEqual(web.normalizeHistoryResponse({ history: zeroHistory }), zeroHistory, 'Web valid zero must remain valid');
assert.strictEqual(desktop.normalizeHistoryResponse({ history: zeroHistory }), zeroHistory, 'Desktop valid zero must remain valid');
console.log(`property fuzz contracts: ok (${parameters.numRuns} runs/property)`);

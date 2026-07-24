'use strict';

const fs = require('fs');
const vm = require('vm');
let source = fs.readFileSync('desktop/plugin.js', 'utf8');
const bodyStart = source.indexOf('\n\nconst ID');
if (bodyStart < 0) throw new Error('Desktop import boundary not found');
source = `
const haptic = () => {};
const host = { state: { profile: 'default', activeSessionId: 'active-session' }, navigate: () => {}, request: () => Promise.resolve({}) };
const PALETTE_AREA = 'palette';
const ROUTES_AREA = 'routes';
const SIDEBAR_NAV_AREA = 'sidebar';
const STATUSBAR_AREAS = { right: 'status-right' };
const Tip = function Tip() {};
const usePluginI18n = () => (key, ...args) => {
  const value = globalThis.__i18n && globalThis.__i18n.en && globalThis.__i18n.en[key];
  return typeof value === 'function' ? value(...args) : value || key;
};
const useQuery = options => {
  const key = options.queryKey || [];
  if (key.includes('account')) return { data: { account: { available: false } }, refetch: () => {} };
  if (key.includes('session')) return { data: { input: 1, output: 2, total: 3 }, refetch: () => {} };
  if (key.includes('history')) return { data: { history: {
    totals: { total_tokens: 170, api_calls: 3 },
    series: { bucket: 'day', bucket_seconds: 86400, points: [{ bucket_start: 1784851200, input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, reasoning_tokens: 5, total_tokens: 170 }] },
    rows: [{ started_at: 1784900000, model: 'gpt-test', provider: 'openai-codex', source: 'desktop', api_call_count: 3, total_tokens: 170, session_ref: 'abcd12345678' }]
  } }, refetch: () => {} };
  return { data: null, refetch: () => {} };
};
const useValue = value => value;
let stateCall = 0;
const useState = initial => {
  stateCall += 1;
  if (stateCall === 2) return [1784851200, () => {}];
  return [initial, () => {}];
};
const jsx = (type, props) => ({ type, props });
const jsxs = jsx;
` + source.slice(bodyStart + 2);
source = source.replace('export default {', 'globalThis.__plugin = {');
if (!source.includes('bucket_start=')) throw new Error('Desktop bucket-specific history request missing');
const sandbox = { globalThis: {}, Intl, Number, Date, Math, Promise, console };
vm.runInNewContext(source, sandbox);
const plugin = sandbox.globalThis.__plugin;
if (!plugin || plugin.id !== 'ai-usage-monitor') throw new Error('desktop plugin export missing');
let contributions;
let i18n;
plugin.register({
  rest: () => Promise.resolve({}),
  i18n: { register: value => { i18n = value; sandbox.globalThis.__i18n = value; } },
  registerMany: value => { contributions = value; }
});
const ids = (contributions || []).map(item => item.id).sort().join(',');
if (ids !== 'chip,nav,open,page') throw new Error('unexpected Desktop contributions: ' + ids);
if (!i18n || !i18n.en || !i18n.fr) throw new Error('Desktop translations missing');
function flatten(node) {
  if (node === null || node === undefined || node === false) return '';
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node.type === 'function') return flatten(node.type(node.props || {}));
  return flatten(node.props && node.props.children);
}
const page = (contributions || []).find(item => item.id === 'page');
const rendered = flatten(page.render());
if (!rendered.includes('Token usage')) throw new Error('Desktop usage chart missing: ' + rendered);
if (!rendered.includes('Selected bucket sessions')) throw new Error('Desktop selected-bucket subtitle missing: ' + rendered);
if (!rendered.includes('Period total: 170 tok · 3 calls')) throw new Error('Desktop period totals scope missing: ' + rendered);
if (!rendered.includes('Log ref')) throw new Error('Desktop log reference label missing: ' + rendered);
if (!rendered.includes('abcd12345678')) throw new Error('Desktop log reference missing: ' + rendered);
if (rendered.includes('1970')) throw new Error('Desktop Unix seconds were rendered as milliseconds: ' + rendered);
console.log('desktop bundle smoke: ok');

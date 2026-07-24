'use strict';

const fs = require('fs');
const vm = require('vm');

let registered;
let effect;
let state;
const calls = [];
const snapshot = {
  account: {
    available: true,
    provider: 'openai-codex',
    plan: 'Pro',
    windows: [{ label: 'Session', used_percent: 14, remaining_percent: 86, reset_at: '2026-07-29T01:07:13Z' }],
    details: []
  }
};
const history = {
  history: {
    totals: { sessions: 2, api_calls: 3, input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, total_tokens: 170 },
    rows: [{ started_at: 1784900000, ended_at: 1784900010, model: 'gpt-test', provider: 'openai-codex', source: 'desktop', api_call_count: 3, total_tokens: 170 }]
  }
};
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length === 1 ? children[0] : children },
    children
  }),
  useState: initial => {
    if (state === undefined) state = initial;
    return [state, update => { state = typeof update === 'function' ? update(state) : update; }];
  },
  useCallback: fn => fn,
  useEffect: fn => { effect = fn; }
};
const sandbox = {
  window: {
    __HERMES_PLUGIN_SDK__: {
      React,
      fetchJSON: path => {
        calls.push(path);
        return Promise.resolve(path.includes('/snapshot') ? snapshot : history);
      }
    },
    __HERMES_PLUGINS__: { register: (name, component) => { registered = { name, component }; } },
    setInterval: () => 1,
    clearInterval: () => {}
  },
  document: { documentElement: { lang: 'fr' } },
  navigator: { language: 'fr-FR' },
  Intl, Number, Promise, Object, String, Math, console
};

function flatten(node) {
  if (node === null || node === undefined || node === false) return '';
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node.type === 'function') return flatten(node.type(node.props));
  return (node.children || []).map(flatten).join(' ');
}

(async () => {
  vm.runInNewContext(fs.readFileSync('runtime/dashboard/dist/index.js', 'utf8'), sandbox);
  if (!registered || registered.name !== 'ai-usage-monitor') throw new Error('dashboard plugin did not register');
  registered.component();
  if (!effect) throw new Error('dashboard effect was not registered');
  effect();
  await new Promise(resolve => setImmediate(resolve));
  const rendered = flatten(registered.component());
  if (!rendered.includes('86% restants')) throw new Error('provider quota was not rendered');
  if (!rendered.includes('gpt-test')) throw new Error('history row was not rendered: ' + rendered);
  if (calls.length !== 2 || !calls.every(path => path.startsWith('/api/plugins/ai-usage-monitor/'))) {
    throw new Error('unexpected dashboard API destination');
  }
  console.log('dashboard bundle smoke: ok');
})().catch(error => { console.error(error); process.exit(1); });

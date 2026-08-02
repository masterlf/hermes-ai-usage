'use strict';

const fs = require('fs');
const vm = require('vm');

let registered;
let effect;
let stateCursor = 0;
const states = [];
const calls = [];
let holdNextUnfiltered = false;
let resolveStaleHistory;
const snapshot = {
  account: {
    available: true,
    provider: 'openai-codex',
    plan: 'Pro',
    windows: [{ label: 'Session', used_percent: null, remaining_percent: 35, reset_at: '2026-07-29T01:07:13Z' }],
    details: []
  }
};
const history = {
  history: {
    days: 7,
    totals: { sessions: 2, api_calls: 3, input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, total_tokens: 170 },
    series: {
      bucket: 'day',
      bucket_seconds: 86400,
      points: [{ bucket_start: 1784851200, sessions: 2, api_calls: 3, input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, reasoning_tokens: 5, total_tokens: 170 }]
    },
    rows: [{ started_at: 1784900000, ended_at: 1784900010, model: 'gpt-test', provider: 'openai-codex', surface: 'cli', source: 'cli', workload_type: 'subagent', profile: 'security', duration_seconds: 125, is_active: false, api_call_count: 3, input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, reasoning_tokens: 5, total_tokens: 120000, session_ref: 'abcd12345678' }]
  }
};
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.length === 1 ? children[0] : children },
    children
  }),
  useState: initial => {
    const index = stateCursor++;
    if (states[index] === undefined) states[index] = initial;
    return [states[index], update => {
      states[index] = typeof update === 'function' ? update(states[index]) : update;
    }];
  },
  useRef: initial => {
    const index = stateCursor++;
    if (states[index] === undefined) states[index] = { current: initial };
    return states[index];
  },
  useCallback: fn => fn,
  useEffect: fn => { if (String(fn).includes('load(false)')) effect = fn; }
};
const sandbox = {
  window: {
    __HERMES_PLUGIN_SDK__: {
      React,
      fetchJSON: path => {
        calls.push(path);
        if (path.includes('/snapshot')) return Promise.resolve(snapshot);
        if (path.includes('bucket_start=')) {
          return Promise.resolve({ history: {
            ...history.history,
            selected_bucket_start: 1784851200,
            rows: [{ ...history.history.rows[0], model: 'selected-model' }]
          } });
        }
        if (holdNextUnfiltered) {
          holdNextUnfiltered = false;
          return new Promise(resolve => {
            resolveStaleHistory = () => resolve({ history: {
              ...history.history,
              rows: [{ ...history.history.rows[0], model: 'stale-model' }]
            } });
          });
        }
        if (path.includes('days=30')) {
          return Promise.resolve({ history: {
            ...history.history,
            days: 30,
            totals: { ...history.history.totals, sessions: 30 },
            rows: [{ ...history.history.rows[0], model: 'thirty-day-model' }]
          } });
        }
        return Promise.resolve(history);
      }
    },
    __HERMES_PLUGINS__: { register: (name, component) => { registered = { name, component }; } },
    setInterval: () => 1,
    clearInterval: () => {}
  },
  document: { documentElement: { lang: 'fr' } },
  navigator: { language: 'fr-FR' },
  ResizeObserver: class ResizeObserver { observe() {} disconnect() {} },
  Intl, Number, Promise, Object, String, Math, console
};

function flatten(node) {
  if (node === null || node === undefined || node === false) return '';
  if (Array.isArray(node)) return node.map(flatten).join(' ');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node.type === 'function') return flatten(node.type(node.props));
  return (node.children || []).map(flatten).join(' ');
}

function findFirst(node, predicate) {
  if (node === null || node === undefined || node === false) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findFirst(child, predicate);
      if (match) return match;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (typeof node.type === 'function') return findFirst(node.type(node.props), predicate);
  if (predicate(node)) return node;
  return findFirst(node.children || [], predicate);
}

function findAll(node, predicate, matches = []) {
  if (node === null || node === undefined || node === false) return matches;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, matches);
    return matches;
  }
  if (typeof node !== 'object') return matches;
  if (typeof node.type === 'function') return findAll(node.type(node.props), predicate, matches);
  if (predicate(node)) matches.push(node);
  findAll(node.children || [], predicate, matches);
  return matches;
}

function render() {
  stateCursor = 0;
  return registered.component();
}

function contrastRatio(foreground, background) {
  const luminance = color => {
    const channels = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16) / 255);
    const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

(async () => {
  vm.runInNewContext(fs.readFileSync('runtime/dashboard/dist/index.js', 'utf8'), sandbox);
  const dashboardSource = fs.readFileSync('runtime/dashboard/dist/index.js', 'utf8');
  const dashboardStyles = fs.readFileSync('runtime/dashboard/dist/style.css', 'utf8');
  if (!dashboardSource.includes('ResizeObserver')) throw new Error('dashboard chart is not container-aware');
  if (!dashboardSource.includes('role: "progressbar"')) throw new Error('dashboard quota progress semantics missing');
  if (dashboardStyles.includes('prefers-color-scheme')) throw new Error('token bands must follow the dashboard theme, not the OS theme');
  const sharedBandRule = dashboardStyles.match(/\.aum-band-green,[^{]+\{([^}]*)\}/);
  if (!sharedBandRule || !sharedBandRule[1].includes('color: var(--color-foreground)')) {
    throw new Error('dashboard token-band text does not use the contrast-safe theme foreground');
  }
  if (contrastRatio('#ffe6cb', '#041c1c') < 4.5) {
    throw new Error('Hermes default dashboard foreground does not meet WCAG AA contrast');
  }
  for (const band of ['green', 'blue', 'yellow', 'orange', 'red']) {
    if (!dashboardStyles.includes('.aum-band-' + band + ' { --aum-band-marker: var(--')) {
      throw new Error('dashboard theme marker missing for token band: ' + band);
    }
  }
  for (const threshold of ['10000', '50000', '100000', '250000']) {
    if (!dashboardSource.includes(threshold)) throw new Error('dashboard token-band threshold missing: ' + threshold);
  }
  if (!registered || registered.name !== 'ai-usage-monitor') throw new Error('dashboard plugin did not register');
  render();
  if (!effect) throw new Error('dashboard effect was not registered');
  effect();
  await new Promise(resolve => setImmediate(resolve));
  const rendered = flatten(render());
  if (!rendered.includes('35% restants')) throw new Error('provider quota fallback was not rendered');
  if (!rendered.includes('65% utilisés')) throw new Error('provider used fallback was not rendered');
  if (!rendered.includes('gpt-test')) throw new Error('history row was not rendered: ' + rendered);
  if (!rendered.includes('Utilisation des tokens')) throw new Error('usage chart was not rendered: ' + rendered);
  const periodButtons = findAll(render(), node => node.type === 'button' && node.props && typeof node.props.onClick === 'function');
  const thirtyDayButton = periodButtons.find(node => flatten(node).includes('30d'));
  if (!thirtyDayButton) throw new Error('30-day period button was not rendered');
  thirtyDayButton.props.onClick();
  const thirtyDayRendered = flatten(render());
  if (!thirtyDayRendered.includes('Activité Hermes · 7 jours')) {
    throw new Error('old seven-day totals were mislabeled before thirty-day data arrived: ' + thirtyDayRendered);
  }
  effect();
  await new Promise(resolve => setImmediate(resolve));
  const thirtyDayLoaded = flatten(render());
  if (!thirtyDayLoaded.includes('Activité Hermes · 30 jours')) throw new Error('web totals scope did not follow loaded thirty-day data: ' + thirtyDayLoaded);
  if (!thirtyDayLoaded.includes('thirty-day-model')) throw new Error('thirty-day history response was not rendered: ' + thirtyDayLoaded);
  if (!rendered.includes('abcd12345678')) throw new Error('log reference was not rendered: ' + rendered);
  if (!rendered.includes('Élevée')) throw new Error('visible token band was not rendered: ' + rendered);
  if (!rendered.includes('CLI · Sous-agent · security')) throw new Error('safe workload context was not rendered: ' + rendered);
  if (!rendered.includes('2 min 05 s')) throw new Error('session duration was not rendered: ' + rendered);
  sandbox.document.documentElement.lang = 'en';
  const englishRendered = flatten(render());
  if (!englishRendered.includes('2m 05s')) throw new Error('English session duration was not localized: ' + englishRendered);
  sandbox.document.documentElement.lang = 'fr';
  if (rendered.includes('1970')) throw new Error('Unix seconds were rendered as milliseconds: ' + rendered);
  const chart = findFirst(render(), node => node.type === 'svg' && node.props && node.props.role === 'group');
  if (!chart) throw new Error('chart was not exposed as a labelled group');
  if (!chart.props['aria-label']) throw new Error('chart group is not labelled');
  const chartBar = findFirst(chart, node => node.type === 'g' && node.props && node.props.role === 'button');
  if (!chartBar) throw new Error('interactive chart bar was not rendered');
  if (chartBar.props['aria-pressed'] !== false) throw new Error('unselected chart bar state was not exposed');
  let spacePrevented = false;
  holdNextUnfiltered = true;
  effect();
  await new Promise(resolve => setImmediate(resolve));
  if (!resolveStaleHistory) throw new Error('stale history request was not held');
  chartBar.props.onKeyDown({ key: ' ', preventDefault: () => { spacePrevented = true; } });
  if (!spacePrevented) throw new Error('Space on a chart bar did not prevent page scrolling');
  const filtered = flatten(render());
  if (!filtered.includes('Sessions du créneau sélectionné')) throw new Error('chart selection did not filter history: ' + filtered);
  const selectedChartBar = findFirst(render(), node => node.type === 'g' && node.props && node.props.role === 'button');
  if (!selectedChartBar || selectedChartBar.props['aria-pressed'] !== true) throw new Error('selected chart bar state was not exposed');
  const modelCell = findFirst(render(), node => node.type === 'td' && node.props && node.props.className === 'aum-model');
  if (!modelCell || modelCell.props['data-label'] !== 'Modèle · fournisseur') throw new Error('mobile model/provider field label missing');
  effect();
  await new Promise(resolve => setImmediate(resolve));
  const selected = flatten(render());
  if (!selected.includes('selected-model')) throw new Error('selected bucket response was not rendered: ' + selected);
  resolveStaleHistory();
  await new Promise(resolve => setImmediate(resolve));
  const afterStale = flatten(render());
  if (!afterStale.includes('selected-model') || afterStale.includes('stale-model')) {
    throw new Error('stale unfiltered response overwrote selected bucket: ' + afterStale);
  }
  if (!calls.some(path => path.includes('&bucket_start=1784851200'))) {
    throw new Error('chart selection did not request bucket-specific history: ' + calls.join(', '));
  }
  if (calls.length !== 8 || !calls.every(path => path.startsWith('/api/plugins/ai-usage-monitor/'))) {
    throw new Error('unexpected dashboard API destination');
  }
  console.log('dashboard bundle smoke: ok');
})().catch(error => { console.error(error); process.exit(1); });

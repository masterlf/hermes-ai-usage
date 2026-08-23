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
    profiles: [{ profile: 'security', sessions: 2, api_calls: 3, total_tokens: 170 }],
    partial: true,
    series: {
      bucket: 'day',
      bucket_seconds: 86400,
      points: [
        { bucket_start: 1784851200, sessions: 2, api_calls: 3, input_tokens: 12345, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, reasoning_tokens: 5, total_tokens: 12415 },
        { bucket_start: 1784937600, sessions: 1, api_calls: 1, input_tokens: 10, output_tokens: 5, cache_read_tokens: 99990, cache_write_tokens: 1, reasoning_tokens: 2, total_tokens: 100006 },
        { bucket_start: 1785024000, sessions: 0, api_calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0, total_tokens: 0 }
      ]
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
  navigator: { language: 'en-US' },
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
  const dashboardSource = fs.readFileSync('runtime/dashboard/dist/index.js', 'utf8');
  const instrumentedSource = dashboardSource.replace(
    'registry.register("ai-usage-monitor", AIUsagePage);',
    'window.__compositionOf = compositionOf; registry.register("ai-usage-monitor", AIUsagePage);'
  );
  vm.runInNewContext(instrumentedSource, sandbox);
  const dashboardStyles = fs.readFileSync('runtime/dashboard/dist/style.css', 'utf8');
  const compositionOf = sandbox.window.__compositionOf;
  if (typeof compositionOf !== 'function') throw new Error('dashboard composition helper missing');
  const normal = compositionOf({ input_tokens: 10, output_tokens: 20, reasoning_tokens: 8, cache_read_tokens: 60, cache_write_tokens: 10 });
  if (normal.additiveTotal !== 100 || normal.outputNonReasoning !== 12 || normal.reasoningOutputTenths !== 400) throw new Error('dashboard composition math is incorrect');
  if (normal.shareTenths.join(',') !== '100,200,600,100') throw new Error('dashboard top-level ratios are incorrect: ' + normal.shareTenths);
  const thirds = compositionOf({ input_tokens: 1, output_tokens: 1, cache_read_tokens: 1 });
  if (thirds.shareTenths.reduce((sum, value) => sum + value, 0) !== 1000) throw new Error('dashboard displayed ratios do not total 100.0%');
  const hostile = compositionOf({ input_tokens: -1, output_tokens: 2, reasoning_tokens: 99, cache_read_tokens: Infinity, cache_write_tokens: NaN });
  if (hostile.additiveTotal !== 2 || hostile.reasoning !== 2 || hostile.outputNonReasoning !== 0) throw new Error('dashboard hostile values were not normalized');
  const zero = compositionOf({});
  if (zero.additiveTotal !== 0 || zero.shareTenths.some(value => value !== 0) || zero.reasoningOutputTenths !== 0) throw new Error('dashboard zero composition is not finite');
  const tiny = compositionOf({ input_tokens: 100, output_tokens: 100, cache_read_tokens: 99000, cache_write_tokens: 1 });
  if (tiny.additiveTotal !== 99201 || tiny.cacheWrite !== 1) throw new Error('dashboard tiny/huge-cache composition lost exact values');
  const overflow = compositionOf({
    input_tokens: Number.MAX_VALUE,
    output_tokens: Number.MAX_VALUE,
    cache_read_tokens: Number.MAX_VALUE,
    cache_write_tokens: Number.MAX_VALUE,
    reasoning_tokens: Number.MAX_VALUE
  });
  if (!Number.isFinite(overflow.additiveTotal) || overflow.shareTenths.some(value => !Number.isFinite(value))) {
    throw new Error('dashboard aggregate overflow was not bounded');
  }
  if (overflow.shareTenths.reduce((sum, value) => sum + value, 0) !== 1000) {
    throw new Error('dashboard bounded overflow ratios do not total 100.0%');
  }
  if (/\.aum-table thead\s*\{[^}]*display:\s*none/.test(dashboardStyles)) {
    throw new Error('mobile tables must not remove column headers from the accessibility tree');
  }
  if (!dashboardSource.includes('ResizeObserver')) throw new Error('dashboard chart is not container-aware');
  for (const color of ['#5ad4ff', '#f2eee3', '#f6c85f', '#d99bff']) {
    if (contrastRatio(color, '#082522') < 3) throw new Error('series fallback contrast is below 3:1: ' + color);
  }
  if (!dashboardStyles.includes('repeating-linear-gradient') || !dashboardStyles.includes('grid-template-columns: repeat(2')) throw new Error('dashboard reasoning pattern/mobile composition layout missing');
  if (!/@media\s*\(forced-colors:\s*active\)/.test(dashboardStyles)) throw new Error('dashboard forced-colors support missing');
  if (!/\.aum-period\s*\{[^}]*min-height:\s*44px;[^}]*min-width:\s*44px;/.test(dashboardStyles.slice(dashboardStyles.indexOf('@media (max-width: 720px)')))) {
    throw new Error('dashboard narrow period targets are not durably 44x44');
  }
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
  if (!rendered.includes('Composition de la période') || !rendered.includes('Raisonnement (dans la sortie)')) throw new Error('French dashboard composition summary missing: ' + rendered);
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
  const tokenBandCell = findFirst(render(), node => node.type === 'td' && String(node.props?.className || '').includes('aum-band-'));
  if (!tokenBandCell?.props['aria-label']?.includes(new Intl.NumberFormat('fr').format(120000))) throw new Error('dashboard history exact value did not use active French locale');
  if (!rendered.includes('CLI · Sous-agent') || !rendered.includes('security')) throw new Error('profile-labelled workload was not rendered: ' + rendered);
  if (!rendered.includes('Consommation par profil') || !rendered.includes('Données partielles')) throw new Error('profile breakdown/partial warning missing: ' + rendered);
  const profileTable = findFirst(render(), node => node.type === 'table' && node.props && node.props['aria-label'] === 'Consommation par profil');
  if (!profileTable) throw new Error('profile breakdown table missing');
  const profileLabels = findAll(profileTable, node => node.type === 'td').map(node => node.props && node.props['data-label']);
  for (const label of ['Profil', 'Tokens bruts', 'Appels API', 'Sessions']) {
    if (!profileLabels.includes(label)) throw new Error('profile mobile field label missing: ' + label);
  }
  if (!rendered.includes('partagé au niveau du compte')) throw new Error('shared account quota wording missing: ' + rendered);
  if (!rendered.includes('2 min 05 s')) throw new Error('session duration was not rendered: ' + rendered);
  sandbox.document.documentElement.lang = 'en';
  const englishRendered = flatten(render());
  if (!englishRendered.includes('2m 05s')) throw new Error('English session duration was not localized: ' + englishRendered);
  if (!englishRendered.includes('Period composition') || !englishRendered.includes('Reasoning (within output)')) throw new Error('English dashboard composition copy missing: ' + englishRendered);
  sandbox.document.documentElement.lang = 'fr';
  if (rendered.includes('1970')) throw new Error('Unix seconds were rendered as milliseconds: ' + rendered);
  const chart = findFirst(render(), node => node.type === 'svg' && node.props && node.props.role === 'group');
  if (!chart) throw new Error('chart was not exposed as a labelled group');
  if (!chart.props['aria-label']) throw new Error('chart group is not labelled');
  let chartBars = findAll(chart, node => node.type === 'g' && node.props && node.props.role === 'button');
  let chartBar = chartBars[0];
  if (chartBars.length !== 3) throw new Error('multi-bucket dashboard fixture did not render three interactive bars');
  if (chartBar.props['aria-pressed'] !== false) throw new Error('unselected chart bar state was not exposed');
  if (chartBar.props.tabIndex !== 0 || !chartBar.props['aria-label'].includes('dans la sortie')) throw new Error('dashboard roving focus/accessibility label missing');
  if (!chartBar.props['aria-label'].includes(new Intl.NumberFormat('fr').format(12345))) throw new Error('dashboard exact values did not use active French locale');
  if (typeof chartBar.props.onFocus !== 'function' || typeof chartBar.props.onMouseEnter !== 'function') throw new Error('dashboard focus/hover breakdown handlers missing');
  const navigate = (bar, key) => {
    let focused = null;
    const targets = chartBars.map((_, index) => ({ focus: () => { focused = index; } }));
    bar.props.onKeyDown({
      key,
      preventDefault: () => {},
      currentTarget: { ownerSVGElement: { querySelectorAll: () => targets } }
    });
    const nextChart = findFirst(render(), node => node.type === 'svg' && node.props && node.props.role === 'group');
    chartBars = findAll(nextChart, node => node.type === 'g' && node.props && node.props.role === 'button');
    return focused;
  };
  if (navigate(chartBar, 'ArrowRight') !== 1 || chartBars.map(bar => bar.props.tabIndex).join(',') !== '-1,0,-1') throw new Error('dashboard ArrowRight did not transfer roving tab ownership');
  if (navigate(chartBars[1], 'End') !== 2 || chartBars.map(bar => bar.props.tabIndex).join(',') !== '-1,-1,0') throw new Error('dashboard End did not transfer roving tab ownership');
  if (navigate(chartBars[2], 'Home') !== 0 || chartBars.map(bar => bar.props.tabIndex).join(',') !== '0,-1,-1') throw new Error('dashboard Home did not transfer roving tab ownership');
  if (navigate(chartBars[0], 'ArrowLeft') !== 0 || chartBars.map(bar => bar.props.tabIndex).join(',') !== '0,-1,-1') throw new Error('dashboard ArrowLeft boundary ownership failed');
  chartBars[1].props.onFocus();
  const rerenderedChart = findFirst(render(), node => node.type === 'svg' && node.props && node.props.role === 'group');
  chartBars = findAll(rerenderedChart, node => node.type === 'g' && node.props && node.props.role === 'button');
  if (chartBars.map(bar => bar.props.tabIndex).join(',') !== '-1,0,-1') throw new Error('dashboard rerender/tab-return lost the last focused bucket');
  chartBar = chartBars[0];
  const webPeriodGroup = findFirst(render(), node => node.props && node.props.role === 'group' && node.props['aria-label'] === 'Période d’utilisation des tokens');
  if (!webPeriodGroup || findAll(webPeriodGroup, node => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean').length !== 4) throw new Error('dashboard period button semantics missing');
  const webLegend = findFirst(render(), node => node.props && node.props.className === 'aum-chart-legend');
  if (!webLegend || findAll(webLegend, node => node.type === 'i').length !== 5) throw new Error('dashboard five labelled legend swatches missing');
  chartBar.props.onFocus();
  const focusTooltip = findFirst(render(), node => node.props && node.props.role === 'tooltip');
  if (!focusTooltip || !flatten(focusTooltip).includes('Raisonnement (dans la sortie)')) throw new Error('dashboard focus tooltip missing exact breakdown');
  chartBar.props.onKeyDown({ key: 'Escape', preventDefault: () => {} });
  if (findFirst(render(), node => node.props && node.props.role === 'tooltip')) throw new Error('dashboard Escape did not dismiss tooltip');
  let spacePrevented = false;
  holdNextUnfiltered = true;
  effect();
  await new Promise(resolve => setImmediate(resolve));
  if (!resolveStaleHistory) throw new Error('stale history request was not held');
  chartBar.props.onKeyDown({ key: ' ', preventDefault: () => { spacePrevented = true; } });
  if (!spacePrevented) throw new Error('Space on a chart bar did not prevent page scrolling');
  const filtered = flatten(render());
  if (!filtered.includes('Sessions du créneau sélectionné')) throw new Error('chart selection did not filter history: ' + filtered);
  const selectedChartBar = findFirst(render(), node => node.type === 'g' && node.props && node.props.role === 'button' && node.props['aria-pressed'] === true);
  if (!selectedChartBar) throw new Error('selected chart bar state was not exposed');
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
  const scopeSelector = findFirst(render(), node => node.type === 'select' && node.props && node.props['aria-label']);
  if (!scopeSelector) throw new Error('profile scope selector missing');
  scopeSelector.props.onChange({ target: { value: 'all' } });
  render();
  effect();
  await new Promise(resolve => setImmediate(resolve));
  if (!calls.some(path => path.includes('/history?') && path.includes('scope=all'))) throw new Error('all-profile request missing: ' + calls.join(', '));
  if (!calls.every(path => path.startsWith('/api/plugins/ai-usage-monitor/'))) {
    throw new Error('unexpected dashboard API destination');
  }
  console.log('dashboard bundle smoke: ok');
})().catch(error => { console.error(error); process.exit(1); });

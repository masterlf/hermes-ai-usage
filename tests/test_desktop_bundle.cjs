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
  const locale = globalThis.__locale || 'en';
  const value = globalThis.__i18n && globalThis.__i18n[locale] && globalThis.__i18n[locale][key];
  return typeof value === 'function' ? value(...args) : value || key;
};
const useQuery = options => {
  const key = options.queryKey || [];
  if (key.includes('account')) return { data: { account: { available: true, provider: 'openai-codex', windows: [{ label: 'Session', used_percent: null, remaining_percent: 35 }] } }, refetch: () => {} };
  if (key.includes('session')) return { data: { input: 1, output: 2, total: 3 }, refetch: () => {} };
  if (key.includes('history')) {
    globalThis.__historyOptions = options;
    return { data: { history: {
    totals: { input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, total_tokens: 170, api_calls: 3 },
    profile_scope: 'current',
    profiles: [{ profile: 'security', sessions: 2, api_calls: 3, input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, total_tokens: 170 }],
    partial: true,
    series: { bucket: 'day', bucket_seconds: 86400, points: [{ bucket_start: 1784851200, input_tokens: 100, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, reasoning_tokens: 5, total_tokens: 170 }] },
    rows: [{ started_at: 1784900000, model: 'gpt-test', provider: 'openai-codex', surface: 'cli', source: 'cli', workload_type: 'subagent', profile: 'security', duration_seconds: 125, is_active: false, api_call_count: 3, input_tokens: 100, output_tokens: 20, cache_read_tokens: 119880, cache_write_tokens: 0, total_tokens: 120000, session_ref: 'abcd12345678' }]
  } }, refetch: () => {} };
  }
  return { data: null, refetch: () => {} };
};
const useValue = value => value;
let stateCall = 0;
let statefulMode = false;
let componentStates = [];
globalThis.__setHarnessStateful = value => { statefulMode = value; stateCall = 0; componentStates = []; };
globalThis.__resetHarnessCursor = () => { stateCall = 0; };
const useState = initial => {
  if (statefulMode) {
    const index = stateCall++;
    if (componentStates[index] === undefined) componentStates[index] = initial;
    return [componentStates[index], update => {
      componentStates[index] = typeof update === 'function' ? update(componentStates[index]) : update;
    }];
  }
  stateCall += 1;
  if (stateCall === 2) return [1784851200, () => {}];
  return [initial, () => {}];
};
const useRef = initial => ({ current: initial });
const useEffect = () => {};
const jsx = (type, props) => ({ type, props });
const jsxs = jsx;
` + source.slice(bodyStart + 2);
source = source.replace('export default {', 'globalThis.__compositionOf = compositionOf; globalThis.__quotaPercentages = quotaPercentages; globalThis.__Progress = Progress; globalThis.__AccountCard = AccountCard; globalThis.__ProfileBreakdown = ProfileBreakdown; globalThis.__UsageChart = UsageChart; globalThis.__plugin = {');
if (!source.includes('bucket_start=')) throw new Error('Desktop bucket-specific history request missing');
if (!source.includes("scope === 'all'") || !source.includes('&scope=all')) throw new Error('Desktop all-profile request missing');
if (!source.includes('ResizeObserver')) throw new Error('Desktop chart is not container-aware');
if (!source.includes("role: 'progressbar'")) throw new Error('Desktop quota progress semantics missing');
for (const threshold of ['10_000', '50_000', '100_000', '250_000']) {
  if (!source.includes(threshold)) throw new Error('Desktop token-band threshold missing: ' + threshold);
}
const sandbox = { globalThis: {}, document: { documentElement: { lang: 'fr' } }, navigator: { language: 'en-US' }, Intl, Number, Date, Math, Promise, console };
vm.runInNewContext(source, sandbox);
const compositionOf = sandbox.globalThis.__compositionOf;
const quotaPercentages = sandbox.globalThis.__quotaPercentages;
if (typeof compositionOf !== 'function') throw new Error('Desktop composition helper missing');
const normal = compositionOf({ input_tokens: 10, output_tokens: 20, reasoning_tokens: 8, cache_read_tokens: 60, cache_write_tokens: 10 });
if (normal.nonCacheRead !== 40 || normal.rawTotal !== 100 || normal.additiveTotal !== 100 || normal.outputNonReasoning !== 12 || normal.reasoningOutputTenths !== 400) throw new Error('Desktop composition math is incorrect');
if (normal.shareTenths.join(',') !== '100,200,600,100') throw new Error('Desktop top-level ratios are incorrect: ' + normal.shareTenths);
const thirds = compositionOf({ input_tokens: 1, output_tokens: 1, cache_read_tokens: 1 });
if (thirds.shareTenths.reduce((sum, value) => sum + value, 0) !== 1000) throw new Error('Desktop displayed ratios do not total 100.0%');
const hostile = compositionOf({ input_tokens: -1, output_tokens: 2, reasoning_tokens: 99, cache_read_tokens: Infinity, cache_write_tokens: NaN });
if (hostile.nonCacheRead !== 2 || hostile.rawTotal !== 2 || hostile.additiveTotal !== 2 || hostile.reasoning !== 2 || hostile.outputNonReasoning !== 0) throw new Error('Desktop hostile values were not normalized');
const zero = compositionOf({});
if (zero.additiveTotal !== 0 || zero.shareTenths.some(value => value !== 0) || zero.reasoningOutputTenths !== 0) throw new Error('Desktop zero composition is not finite');
const tiny = compositionOf({ input_tokens: 100, output_tokens: 100, cache_read_tokens: 99000, cache_write_tokens: 1 });
if (tiny.nonCacheRead !== 201 || tiny.rawTotal !== 99201 || tiny.additiveTotal !== 99201 || tiny.cacheWrite !== 1) throw new Error('Desktop tiny/huge-cache composition lost exact values');
const overflow = compositionOf({ input_tokens: Number.MAX_VALUE, output_tokens: Number.MAX_VALUE, cache_read_tokens: Number.MAX_VALUE, cache_write_tokens: Number.MAX_VALUE, reasoning_tokens: Number.MAX_VALUE });
if (!Number.isSafeInteger(overflow.nonCacheRead) || !Number.isSafeInteger(overflow.rawTotal) || !Number.isFinite(overflow.additiveTotal) || overflow.shareTenths.some(value => !Number.isFinite(value))) throw new Error('Desktop aggregate overflow was not bounded');
if (overflow.shareTenths.reduce((sum, value) => sum + value, 0) !== 1000) throw new Error('Desktop bounded overflow ratios do not total 100.0%');
for (const [fixture, expectedUsed, expectedRemaining] of [
  [{ remaining_percent: 97 }, 3, 97],
  [{ used_percent: 3 }, 3, 97],
  [{ remaining_percent: 0 }, 100, 0],
  [{ remaining_percent: 100 }, 0, 100],
  [{ remaining_percent: 140 }, 0, 100],
  [{ remaining_percent: -5 }, 100, 0],
  [{ remaining_percent: Infinity, used_percent: 3 }, 3, 97]
]) {
  const quota = quotaPercentages(fixture);
  if (quota.used !== expectedUsed || quota.remaining !== expectedRemaining) throw new Error('Desktop quota normalization failed: ' + JSON.stringify(fixture));
}
const unavailableQuota = quotaPercentages({ remaining_percent: null, used_percent: null });
if (unavailableQuota.used !== null || unavailableQuota.remaining !== null) throw new Error('Desktop unavailable quota was converted to a number');
const relativeLuminance = color => {
  const linear = color.slice(1).match(/.{2}/g).map(channel => parseInt(channel, 16) / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const focusContrast = (relativeLuminance('#5AD4FF') + 0.05) / (relativeLuminance('#082522') + 0.05);
if (focusContrast < 3 || !source.includes('var(--ui-accent, #5AD4FF)')) throw new Error('Desktop focus ring fallback is below 3:1 or missing');
const plugin = sandbox.globalThis.__plugin;
if (!plugin || plugin.id !== 'ai-usage-monitor') throw new Error('desktop plugin export missing');
let contributions;
let i18n;
const restCalls = [];
plugin.register({
  rest: path => { restCalls.push(path); return Promise.resolve({}); },
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
function findAll(node, predicate, matches = []) {
  if (node === null || node === undefined || node === false) return matches;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, matches);
    return matches;
  }
  if (typeof node !== 'object') return matches;
  if (typeof node.type === 'function') return findAll(node.type(node.props || {}), predicate, matches);
  if (predicate(node)) matches.push(node);
  findAll(node.props && node.props.children, predicate, matches);
  return matches;
}
function resolveTree(node) {
  if (node === null || node === undefined || node === false) return node;
  if (Array.isArray(node)) return node.map(resolveTree);
  if (typeof node !== 'object') return node;
  if (typeof node.type === 'function') return resolveTree(node.type(node.props || {}));
  return {
    ...node,
    props: { ...(node.props || {}), children: resolveTree(node.props && node.props.children) }
  };
}
const Progress = sandbox.globalThis.__Progress;
const healthyProgress = resolveTree(Progress({ quotaWindow: { label: 'Session', remaining_percent: 97, used_percent: 80 } }));
if (healthyProgress.props['aria-valuenow'] !== 97 || !healthyProgress.props['aria-label'].includes('remaining')) throw new Error('Desktop progress does not expose remaining quota');
if (healthyProgress.props.children.props.style.width !== '97%') throw new Error('Desktop 97% remaining does not fill 97%');
if (String(healthyProgress.props.children.props.className).includes('danger')) throw new Error('Desktop healthy remaining quota is marked dangerous');
const lowProgress = resolveTree(Progress({ quotaWindow: { label: 'Session', remaining_percent: 10 } }));
if (!String(lowProgress.props.children.props.className).includes('danger')) throw new Error('Desktop low remaining quota is not marked dangerous');
const AccountCard = sandbox.globalThis.__AccountCard;
const directRemainingCard = resolveTree(AccountCard({ account: { available: true, provider: 'test', windows: [{ label: 'Session', remaining_percent: 97, used_percent: 80, reset_at: '2026-07-29T01:07:13Z' }] } }));
if (!flatten(directRemainingCard).includes('3% used') || !flatten(directRemainingCard).includes('Resets')) throw new Error('Desktop quota footer did not retain used/reset details');
const ProfileBreakdown = sandbox.globalThis.__ProfileBreakdown;
const sixProfiles = Array.from({ length: 6 }, (_, index) => ({ profile: 'profile-' + index, sessions: index, api_calls: index, input_tokens: index + 1 }));
const profileFixture = resolveTree(ProfileBreakdown({ history: { profiles: sixProfiles } }));
const profileViewport = findAll(profileFixture, node => node.props && node.props['data-profile-viewport'] === 'five-rows')[0];
const fixtureTable = findAll(profileFixture, node => node.type === 'table')[0];
if (!profileViewport || profileViewport.props.tabIndex !== 0 || !profileViewport.props['aria-label']) throw new Error('Desktop profile viewport is not keyboard discoverable');
if (!String(profileViewport.props.className).includes('overflow-auto')) throw new Error('Desktop profile viewport is not internally scrollable');
if (profileViewport.props.style['--aum-profile-header-height'] !== '2.5rem' || profileViewport.props.style['--aum-profile-row-height'] !== '2.75rem' || profileViewport.props.style.maxHeight !== 'calc(var(--aum-profile-header-height) + 5 * var(--aum-profile-row-height))') throw new Error('Desktop profile viewport is not exactly five rows');
const fixtureBody = findAll(fixtureTable, node => node.type === 'tbody')[0];
if (findAll(fixtureBody, node => node.type === 'tr').length !== 6) throw new Error('Desktop profile viewport discarded rows');
if (!String(fixtureTable.props.className).includes('min-w-[680px]')) throw new Error('Desktop profile table lost six-column overflow floor');
const fixtureHeader = findAll(fixtureTable, node => node.type === 'thead')[0];
const fixtureHeaders = findAll(fixtureHeader, node => node.type === 'th');
if (fixtureHeaders.length !== 6 || fixtureHeaders.some(header => !String(header.props.className).includes('sticky'))) throw new Error('Desktop profile header is not sticky');
const chartHistory = { profile_scope: 'current', profiles: [{ profile: 'security', total_tokens: 170 }], series: { bucket: 'day', points: [
  { bucket_start: 1784851200, sessions: 2, api_calls: 3, input_tokens: 12345, output_tokens: 20, cache_read_tokens: 50, cache_write_tokens: 0, reasoning_tokens: 5 },
  { bucket_start: 1784937600, sessions: 1, api_calls: 1, input_tokens: 10, output_tokens: 5, cache_read_tokens: 99990, cache_write_tokens: 1, reasoning_tokens: 2 },
  { bucket_start: 1785024000, sessions: 0, api_calls: 0, input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, reasoning_tokens: 0 }
] } };
const UsageChart = sandbox.globalThis.__UsageChart;
if (typeof UsageChart !== 'function') throw new Error('Desktop UsageChart test export missing');
sandbox.globalThis.__setHarnessStateful(true);
function renderChart() {
  sandbox.globalThis.__resetHarnessCursor();
  return resolveTree(UsageChart({ history: chartHistory, days: 7, selectedBucket: null, onDays: () => {}, onSelect: () => {} }));
}
let interactionChart = findAll(renderChart(), node => node.type === 'svg')[0];
let interactionBars = findAll(interactionChart, node => node.type === 'g' && node.props.role === 'button');
if (interactionBars.length !== 3) throw new Error('Desktop multi-bucket fixture did not render three interactive bars');
if (!interactionBars[0].props['aria-label'].includes(new Intl.NumberFormat('fr').format(12345))) throw new Error('Desktop exact values did not use active French locale');
const navigate = (bar, key) => {
  let focused = null;
  const targets = interactionBars.map((_, index) => ({ focus: () => { focused = index; } }));
  bar.props.onKeyDown({ key, preventDefault: () => {}, currentTarget: { ownerSVGElement: { querySelectorAll: () => targets } } });
  interactionChart = findAll(renderChart(), node => node.type === 'svg')[0];
  interactionBars = findAll(interactionChart, node => node.type === 'g' && node.props.role === 'button');
  return focused;
};
if (navigate(interactionBars[0], 'ArrowRight') !== 1 || interactionBars.map(bar => bar.props.tabIndex).join(',') !== '-1,0,-1') throw new Error('Desktop ArrowRight did not transfer roving tab ownership');
if (navigate(interactionBars[1], 'End') !== 2 || interactionBars.map(bar => bar.props.tabIndex).join(',') !== '-1,-1,0') throw new Error('Desktop End did not transfer roving tab ownership');
if (navigate(interactionBars[2], 'Home') !== 0 || interactionBars.map(bar => bar.props.tabIndex).join(',') !== '0,-1,-1') throw new Error('Desktop Home did not transfer roving tab ownership');
if (navigate(interactionBars[0], 'ArrowLeft') !== 0 || interactionBars.map(bar => bar.props.tabIndex).join(',') !== '0,-1,-1') throw new Error('Desktop ArrowLeft boundary ownership failed');
interactionBars[1].props.onFocus();
interactionChart = findAll(renderChart(), node => node.type === 'svg')[0];
interactionBars = findAll(interactionChart, node => node.type === 'g' && node.props.role === 'button');
if (interactionBars.map(bar => bar.props.tabIndex).join(',') !== '-1,0,-1') throw new Error('Desktop rerender/tab-return lost the last focused bucket');
const focusOutline = findAll(interactionBars[1], node => node.type === 'rect' && node.props && node.props['data-focus-outline'])[0];
if (!focusOutline || focusOutline.props.stroke === 'transparent') throw new Error('Desktop focused unselected bucket lacks an independent visible ring');
if (!source.includes('max-[720px]:min-h-11') || !source.includes('max-[720px]:min-w-11')) throw new Error('Desktop narrow period targets are not durably 44x44');
if (!source.includes('min-w-[680px]')) throw new Error('Desktop six-column profile table lacks a narrow-layout overflow floor');
if (!source.includes("forcedColorAdjust: 'auto'")) throw new Error('Desktop forced-colors focus handling missing');
sandbox.globalThis.__setHarnessStateful(false);
const page = (contributions || []).find(item => item.id === 'page');
resolveTree(page.render());
if (!sandbox.globalThis.__historyOptions.queryKey.includes('all')) throw new Error('Desktop initial history scope is not all');
sandbox.globalThis.__historyOptions.queryFn();
if (!restCalls.some(path => path.includes('/history?') && path.includes('scope=all'))) throw new Error('Desktop initial all-profile request missing: ' + restCalls.join(', '));
sandbox.globalThis.__setHarnessStateful(true);
let scopeTree = resolveTree(page.render());
let scopeSelector = findAll(scopeTree, node => node.type === 'select' && node.props && node.props['aria-label'])[0];
if (!scopeSelector || scopeSelector.props.value !== 'all') throw new Error('Desktop all-profile selector state missing');
scopeSelector.props.onChange({ target: { value: 'current' } });
sandbox.globalThis.__resetHarnessCursor();
scopeTree = resolveTree(page.render());
scopeSelector = findAll(scopeTree, node => node.type === 'select' && node.props && node.props['aria-label'])[0];
if (!scopeSelector || scopeSelector.props.value !== 'current') throw new Error('Desktop selector did not switch back to current profile');
sandbox.globalThis.__historyOptions.queryFn();
if (restCalls[restCalls.length - 1].includes('scope=all')) throw new Error('Desktop current-profile request retained all scope');
sandbox.globalThis.__setHarnessStateful(false);
const tree = resolveTree(page.render());
const rendered = flatten(tree);
if (!rendered.includes('v0.7.1')) throw new Error('Desktop visible plugin version missing');
const renderedOrder = ['Token usage', 'Usage by profile', 'Recent usage'].map(label => rendered.indexOf(label));
if (!(renderedOrder[0] >= 0 && renderedOrder[0] < renderedOrder[1] && renderedOrder[1] < renderedOrder[2])) throw new Error('Desktop chart/profile/recent order is incorrect: ' + renderedOrder);
if (!rendered.includes('Token usage')) throw new Error('Desktop usage chart missing: ' + rendered);
if (!rendered.includes('Token usage · Profile: security')) throw new Error('Desktop current profile ownership missing from chart heading: ' + rendered);
if (!rendered.includes('Period composition') || !rendered.includes('Reasoning (within output)')) throw new Error('Desktop composition summary missing: ' + rendered);
if (!rendered.includes('Selected bucket sessions')) throw new Error('Desktop selected-bucket subtitle missing: ' + rendered);
if (!rendered.includes('Non-cache-read tokens') || !rendered.includes('Cache-read tokens') || !rendered.includes('Raw total')) throw new Error('Desktop split token summary missing: ' + rendered);
if (!rendered.includes('Log ref')) throw new Error('Desktop log reference label missing: ' + rendered);
if (!rendered.includes('abcd12345678')) throw new Error('Desktop log reference missing: ' + rendered);
if (!rendered.includes('65% used')) throw new Error('Desktop remaining-percent fallback missing: ' + rendered);
if (!rendered.includes('High')) throw new Error('Desktop visible token band missing: ' + rendered);
if (!rendered.includes('CLI · Subagent') || !rendered.includes('security')) throw new Error('Desktop profile-labelled workload missing: ' + rendered);
if (!rendered.includes('Usage by profile') || !rendered.includes('Partial data')) throw new Error('Desktop profile breakdown/partial warning missing: ' + rendered);
const profileTable = findAll(tree, node => node.type === 'table' && node.props && node.props['aria-label'] === 'Usage by profile')[0];
if (!profileTable) throw new Error('Desktop profile breakdown is not a native labelled table');
const profileHeaders = findAll(profileTable, node => node.type === 'th').map(flatten);
for (const header of ['Profile', 'Non-cache read', 'Cache read', 'Raw total', 'Calls', 'sessions']) {
  if (!profileHeaders.includes(header)) throw new Error('Desktop profile table header missing: ' + header);
}
if (!rendered.includes('account-level/shared')) throw new Error('Desktop shared quota wording missing: ' + rendered);
if (!rendered.includes('2m 05s')) throw new Error('Desktop duration missing: ' + rendered);
const chart = findAll(tree, node => node.type === 'svg')[0];
if (!chart || chart.props.role !== 'group' || !chart.props['aria-label']) throw new Error('Desktop chart is not a labelled accessible group');
const chartBar = findAll(chart, node => node.type === 'g' && node.props.role === 'button')[0];
if (!chartBar || chartBar.props['aria-pressed'] !== true) throw new Error('Desktop chart bar selected state missing');
if (chartBar.props.tabIndex !== 0 || !chartBar.props['aria-label'].includes('within output')) throw new Error('Desktop roving focus/accessibility label missing');
if (typeof chartBar.props.onFocus !== 'function' || typeof chartBar.props.onMouseEnter !== 'function') throw new Error('Desktop focus/hover breakdown handlers missing');
const desktopPeriodGroup = findAll(tree, node => node.props && node.props.role === 'group' && node.props['aria-label'] === 'Token usage period')[0];
if (!desktopPeriodGroup || findAll(desktopPeriodGroup, node => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean').length !== 4) throw new Error('Desktop period button semantics missing');
const desktopLegend = findAll(tree, node => node.type === 'div' && String(node.props.className || '').includes('flex flex-wrap'))[0];
if (!desktopLegend || findAll(desktopLegend, node => node.type === 'i').length !== 5) throw new Error('Desktop five labelled legend swatches missing');
let spacePrevented = false;
chartBar.props.onKeyDown({ key: ' ', preventDefault: () => { spacePrevented = true; } });
if (!spacePrevented) throw new Error('Desktop chart Space handler did not prevent page scrolling');
const mobileLabels = findAll(tree, node => node.type === 'span' && String(node.props.className || '').includes('md:hidden')).map(flatten);
for (const label of ['When', 'Profile', 'Workload', 'Model · provider', 'Calls', 'Token split', 'Log ref']) {
  if (!mobileLabels.includes(label)) throw new Error('Desktop mobile field label missing: ' + label);
}
const bandValues = findAll(tree, node => node.type === 'span' && node.props && node.props['data-token-band']);
if (!bandValues.length || bandValues[0].props.style.color !== 'var(--ui-text-primary)') throw new Error('Desktop token-band text is not theme-safe');
if (!bandValues[0].props['aria-label'].includes(new Intl.NumberFormat('fr').format(120000))) throw new Error('Desktop history exact value did not use active French locale');
const visibleEnglishSplit = findAll(bandValues[0], node => node.type === 'span' && node.props && node.props['data-token-kind']).map(flatten);
if (visibleEnglishSplit.join('|') !== 'Non-cache read 120|Cache read 119.9k') throw new Error('Desktop visible English row labels are not bound to their values: ' + visibleEnglishSplit.join('|'));
sandbox.globalThis.__locale = 'fr';
const frenchTree = resolveTree(page.render());
const frenchRendered = flatten(frenchTree);
if (!frenchRendered.includes('Utilisation des tokens · Profil : security')) throw new Error('French Desktop current profile ownership missing from chart heading: ' + frenchRendered);
if (!frenchRendered.includes('2 min 05 s')) throw new Error('French Desktop duration was not localized: ' + frenchRendered);
if (!frenchRendered.includes('Composition de la période') || !frenchRendered.includes('Raisonnement (dans la sortie)')) throw new Error('French Desktop composition copy missing: ' + frenchRendered);
if (!frenchRendered.includes('Tokens hors lecture cache') || !frenchRendered.includes('Tokens lus du cache') || !frenchRendered.includes('Total brut')) throw new Error('French Desktop split token copy missing: ' + frenchRendered);
const frenchBandValue = findAll(frenchTree, node => node.type === 'span' && node.props && node.props['data-token-band'])[0];
const visibleFrenchSplit = findAll(frenchBandValue, node => node.type === 'span' && node.props && node.props['data-token-kind']).map(flatten);
if (visibleFrenchSplit.join('|') !== 'Hors lecture cache 120|Lecture cache 119.9k') throw new Error('Desktop visible French row labels are not bound to their values: ' + visibleFrenchSplit.join('|'));
if (/\b(?:billable|cost|fresh)\b|uncached[- ]input/i.test(source)) throw new Error('Desktop copy implies spend/provider charging semantics');
const allProfilesChart = flatten(UsageChart({
  history: { ...chartHistory, profile_scope: 'all', profiles: [
    { profile: 'security', total_tokens: 170 },
    { profile: 'alpha', total_tokens: 50 },
    { profile: 'idle', total_tokens: 0 }
  ] },
  days: 7,
  selectedBucket: null,
  onDays: () => {},
  onSelect: () => {}
}));
if (!allProfilesChart.includes('Utilisation des tokens · Tous les profils · 2 profils consommateurs')) throw new Error('Desktop all-profile consuming count is not truthful: ' + allProfilesChart);
const zeroCurrentChart = flatten(UsageChart({
  history: { profile_scope: 'current', profiles: [{ profile: 'default', total_tokens: 0 }], series: { bucket: 'day', points: [] } },
  days: 7,
  selectedBucket: null,
  onDays: () => {},
  onSelect: () => {}
}));
if (!zeroCurrentChart.includes('Utilisation des tokens · Profil : default')) throw new Error('Desktop zero usage omitted selected profile: ' + zeroCurrentChart);
if (rendered.includes('1970')) throw new Error('Desktop Unix seconds were rendered as milliseconds: ' + rendered);
console.log('desktop bundle smoke: ok');

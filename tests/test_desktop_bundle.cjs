'use strict';

const fs = require('fs');
const vm = require('vm');
let source = fs.readFileSync('desktop/plugin.js', 'utf8');
const bodyStart = source.indexOf('\n\nconst ID');
if (bodyStart < 0) throw new Error('Desktop import boundary not found');
source = `
const haptic = () => {};
const host = { state: { profile: {}, activeSessionId: {} }, navigate: () => {}, request: () => Promise.resolve({}) };
const PALETTE_AREA = 'palette';
const ROUTES_AREA = 'routes';
const SIDEBAR_NAV_AREA = 'sidebar';
const STATUSBAR_AREAS = { right: 'status-right' };
const Tip = function Tip() {};
const usePluginI18n = () => key => key;
const useQuery = () => ({ data: null, refetch: () => {} });
const useValue = () => null;
const jsx = (type, props) => ({ type, props });
const jsxs = jsx;
` + source.slice(bodyStart + 2);
source = source.replace('export default {', 'globalThis.__plugin = {');
const sandbox = { globalThis: {}, Intl, Number, Date, Math, Promise, console };
vm.runInNewContext(source, sandbox);
const plugin = sandbox.globalThis.__plugin;
if (!plugin || plugin.id !== 'ai-usage-monitor') throw new Error('desktop plugin export missing');
let contributions;
let i18n;
plugin.register({
  rest: () => Promise.resolve({}),
  i18n: { register: value => { i18n = value; } },
  registerMany: value => { contributions = value; }
});
const ids = (contributions || []).map(item => item.id).sort().join(',');
if (ids !== 'chip,nav,open,page') throw new Error('unexpected Desktop contributions: ' + ids);
if (!i18n || !i18n.en || !i18n.fr) throw new Error('Desktop translations missing');
console.log('desktop bundle smoke: ok');

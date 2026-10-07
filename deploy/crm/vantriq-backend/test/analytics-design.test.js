const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function renderer(reducedMotion = false) {
  const mounted = [], destroyed = [];
  class Chart {
    static defaults = {font: {}};
    constructor(el, config) { mounted.push({id: el.id, ...config}); }
    destroy() { destroyed.push(true); }
  }
  const ctx = vm.createContext({window: {}, Chart,
    matchMedia: () => ({matches: reducedMotion}),
    getComputedStyle: () => ({fontFamily: 'system-ui'}),
    document: {body: {}, getElementById: id => ({id})}});
  vm.runInContext(fs.readFileSync(require.resolve('../public/analytics-view.js'), 'utf8'), ctx);
  return {api: ctx.window.VQA, mounted, destroyed};
}

const series = [
  {bucket: '2026-08-01', responses: 7, csat: 71.4, nps: -28.6, nps_responses: 7, conversations: 11, new_contacts: 8, returning_contacts: 3},
  {bucket: '2026-09-01', responses: 0, csat: null, nps: null, nps_responses: 0, conversations: 0, new_contacts: 0, returning_contacts: 0},
  {bucket: '2026-10-01', responses: 5, csat: 80, nps: 40, nps_responses: 5, conversations: 10, new_contacts: 6, returning_contacts: 4},
];
const d = {series, grain: 'month', window: {nps_responses: 12},
  nps_distribution: Array.from({length: 11}, (_, score) => ({score, n: score === 10 ? 5 : 0}))};
const {api, mounted, destroyed} = renderer();
api.drawEcho(d);
const response = mounted.find(c => c.id === 'vqeResp');
assert.deepEqual(Array.from(response.data.datasets[0].data), [7, 0, 5], 'redesign preserves recorded counts');
assert.notEqual(response.data.datasets[0].backgroundColor[0], response.data.datasets[0].backgroundColor[2], 'unfinished period remains distinguished');
for (const id of ['vqeCsat', 'vqeNps']) {
  const c = mounted.find(c => c.id === id);
  assert.equal(c.data.datasets[0].data[1], null, 'missing score stays unknown');
  assert.equal(c.data.datasets[0].spanGaps, false, 'unknown periods are visibly separated');
}
assert.equal(mounted.find(c => c.id === 'vqeCsat').options.scales.y.max, 100);
assert.equal(mounted.find(c => c.id === 'vqeNps').options.scales.y.min, -100, 'negative NPS is visible');
assert.equal(mounted.find(c => c.id === 'vqeNps').options.scales.y.max, 100);
api.drawConversations({series, grain: 'month'});
assert.equal(destroyed.length, 4, 'switching modules disposes previous charts');
const contacts = mounted.find(c => c.id === 'vqaContacts');
assert.deepEqual(Array.from(contacts.data.datasets[0].data), [8, 0, 6]);
assert.deepEqual(Array.from(contacts.data.datasets[1].data), [3, 0, 4]);
const reduced = renderer(true); reduced.api.drawEcho(d);
assert.ok(reduced.mounted.every(c => c.options.animation.duration === 0), 'reduced-motion preference covers every shared chart');
const metric = {current: 0, delta_pct: null};
const empty = {grain: 'month', time_zone: 'Asia/Karachi',
  period: {window_label: '<Monthly>', current_label: 'October', previous_label: 'September', elapsed_pct: 20},
  series: [], kpis: {conversations: metric, new_contacts: metric, returning_contacts: metric, messages: metric, messages_per_conversation: metric},
  window_totals: {conversations: 0}, channels: [], agents: [], insights: []};
const html = api.conversationsHTML(empty, {});
assert.match(html, /Conversation intelligence/);
assert.match(html, /&lt;Monthly&gt;/, 'header context is escaped');
assert.match(html, /No conversations/, 'empty workspaces retain honest empty states');
console.log('PASS: Pulse/Echo chart values, missing scores, NPS scales, partial periods, chart lifecycle, reduced motion and empty states.');

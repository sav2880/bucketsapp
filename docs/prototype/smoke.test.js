/* SPDX-License-Identifier: Apache-2.0 */
/**
 * @file Smoke test: loads the built page in jsdom and clicks through the main
 * flows. jsdom has no layout or Web Animations, so this checks behaviour and
 * wiring, not visuals. Run after `node build.js`.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'dist', 'buckets-prototype.html'), 'utf8');

async function boot() {
  const errors = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/' });
  dom.virtualConsole.on('jsdomError', (e) => errors.push(e));
  await new Promise((r) => setTimeout(r, 20));
  const { window } = dom;
  const $ = (sel) => window.document.querySelector(sel);
  const click = async (el) => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
  };
  const nav = (name) => [...window.document.querySelectorAll('[data-bucket]')].find((b) => b.textContent.includes(name));
  return { window, $, click, nav, errors, api: window.__bucketsPrototype };
}

test('page boots with five demo buckets and no errors', async () => {
  const { $, window, errors } = await boot();
  assert.equal(window.document.querySelectorAll('[data-bucket]').length, 5);
  assert.equal($('#bucketTitle').textContent, 'Game Backlog');
  assert.equal($('#presetChip').textContent, 'Grab & Go');
  assert.equal(errors.length, 0, errors.join('\n'));
});

test('Grab & Go: draw, lock, deliberate toss-back, draw again, done', async () => {
  const { $, click, window } = await boot();
  await click($('#drawBtn'));
  assert.equal(window.document.querySelectorAll('#handCards .card').length, 1);
  assert.equal($('#drawBtn').getAttribute('aria-disabled'), 'true');
  assert.match($('#drawHint').textContent, /^Finish or toss back/);
  assert.ok($('#lid').classList.contains('on'));

  // A second draw is refused.
  await click($('#drawBtn'));
  assert.equal(window.document.querySelectorAll('#handCards .card').length, 1);

  // Toss back asks twice.
  await click($('#handCards [data-action="toss"]'));
  assert.ok($('#sheet').open || $('#sheet').hasAttribute('open'));
  $('#tossReason').value = 'Too long tonight';
  await click($('#sheetConfirm'));
  assert.equal($('#sheetConfirm').textContent, 'Yes, toss it back');
  assert.equal(window.document.querySelectorAll('#handCards .card').length, 1, 'first press only arms');
  await click($('#sheetConfirm'));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(window.document.querySelectorAll('#handCards .card').length, 0);
  assert.equal($('#drawBtn').getAttribute('aria-disabled'), 'false');

  await click($('#drawBtn'));
  const before = $('.group-done .count').textContent;
  await click($('#handCards [data-action="done"]'));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(Number($('.group-done .count').textContent), Number(before) + 1);
  assert.match($('#donePile').textContent, /Done pile/);
});

test('Rotation Pool: only 4 of 10 waiting, all 10 back after 30 days', async () => {
  const { $, click, nav } = await boot();
  await click(nav('Server Maintenance'));
  assert.match($('#drawHint').textContent, /^4 of 10 are waiting/);
  await click($('[data-advance="2592000000"]'));
  assert.match($('#drawHint').textContent, /^10 of 10 are waiting/);
  await click($('#drawBtn'));
  // Steps show on the card.
  assert.equal($('#handCards .card').querySelectorAll('.steps input').length, 3);
});

test('Mystery Bag hides names and reveals on draw; finished items rest a day', async () => {
  const { $, click, nav, window } = await boot();
  await click(nav('Chores'));
  assert.ok(window.document.querySelectorAll('.group-in .folded').length >= 8);
  await click($('#drawBtn'));
  const card = $('#handCards .card');
  assert.ok(!card.classList.contains('concealed'));
  assert.ok(card.querySelector('.card-title').textContent.length > 0);
  await click($('#handCards [data-action="done"]'));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(window.document.querySelectorAll('.group-cooling .row').length, 1);
  await click($('[data-advance="86400000"]'));
  assert.equal(window.document.querySelector('.group-cooling'), null);
});

test('adding items, rule edits, and the inspector item tab', async () => {
  const { $, click, nav, window } = await boot();
  await click(nav('Dinner Ideas'));
  const input = $('#newItem');
  input.value = 'Dumplings';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.ok([...window.document.querySelectorAll('.group-in .cell.name')].some((c) => c.textContent.includes('Dumplings')));

  const maxInHand = $('[data-rule="maxInHand"]');
  maxInHand.value = '3';
  maxInHand.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal($('#presetChip').textContent, 'Custom');

  await click($('.group-in [data-row]'));
  assert.equal($('[data-tab="item"]').getAttribute('aria-pressed'), 'true');
  assert.ok($('#iWeight'));
});

test('New bucket sheet creates an empty bucket of the chosen type', async () => {
  const { $, click, window } = await boot();
  await click($('#newBucketBtn'));
  $('#nbName').value = 'Weekend ideas';
  window.document.querySelector('input[name="newPreset"][value="simmer"]').checked = true;
  await click($('#sheetConfirm'));
  assert.equal($('#bucketTitle').textContent, 'Weekend ideas');
  assert.equal($('#presetChip').textContent, 'Simmer Bucket');
  assert.match($('#drawHint').textContent, /empty/);
});

/* SPDX-License-Identifier: Apache-2.0 */
/**
 * @file Buckets clickable prototype: UI layer.
 *
 * Connects the pure draw engine (engine.js, `window.BucketsEngine`) to the
 * page. This is a prototype for trying the feel of drawing from a bucket:
 * there is no sync, no files, and time is simulated (the sidebar's
 * "Pretend it's" clock) so cooldowns and 30-day rules can be tried in seconds.
 *
 * State lives in one plain object, saved to localStorage as a convenience so
 * a reload doesn't lose the demo. Rendering is simple string templating with
 * every user-supplied string passed through `esc()`.
 */
(function () {
  'use strict';

  const E = window.BucketsEngine;
  const { HOUR, DAY } = E;

  const STORAGE_KEY = 'buckets-prototype-v1';
  const STATE_VERSION = 1;
  /** Demo "today": Wednesday 30 September 2026, 9:00 AM local time. */
  const START = new Date(2026, 8, 30, 9, 0, 0).getTime();

  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  const KEYS = IS_MAC
    ? { draw: '⌘D', done: '⌘↩', toss: '⌘⌫' }
    : { draw: 'Ctrl+D', done: 'Ctrl+Enter', toss: 'Ctrl+Backspace' };

  /** Enamel colors. `text` is a darker shade for text on white; `on` is text on the color. */
  const COLORS = {
    purple: { fill: '#8b5cf6', text: '#7442e8', on: '#ffffff' },
    blue: { fill: '#3b82d6', text: '#2a6cbd', on: '#ffffff' },
    teal: { fill: '#1f9ba0', text: '#137f84', on: '#ffffff' },
    green: { fill: '#2fa36b', text: '#1d8653', on: '#ffffff' },
    yellow: { fill: '#e8ac2e', text: '#9a6a05', on: '#2c2100' },
    pink: { fill: '#e0517a', text: '#c73862', on: '#ffffff' },
  };
  const ICONS = ['🎮', '🖥️', '🧹', '🍜', '📚', '🎬', '🌱', '🏃', '🎨', '✈️', '🎲', '🛠️'];

  /** Where paper slips sit inside the bucket mouth: [x, depth, rotation]. Index 0 is front and center. */
  const SLIP_SPOTS = [
    [130, 0, -3], [106, 4, 7], [154, 3, -9], [90, 7, 12], [170, 6, -13], [118, 9, 4],
    [142, 8, -6], [98, 11, 15], [162, 10, -11], [124, 13, 2], [148, 12, -4], [134, 15, 9],
  ];

  const LAYOUT_DEFAULTS = { sidebar: 232, inspector: 304, status: 150, drawn: 140 };
  const LIMITS = { sidebar: [180, 360], inspector: [260, 460], status: [90, 320], drawn: [90, 320] };
  const EVENT_LABEL = { drawn: 'Drawn', done: 'Done', 'tossed-back': 'Tossed back' };

  const PILE_ICON =
    '<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><rect x="2" y="7" width="14" height="5" rx="1.5" fill="currentColor" opacity=".35"/><rect x="3" y="4" width="12" height="4" rx="1.5" fill="currentColor" opacity=".55"/><rect x="4" y="1" width="10" height="4" rx="1.5" fill="currentColor"/></svg>';

  // ---------- Small helpers ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const mq = (q) => (typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false);
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escapes text for safe use inside HTML and attribute values. */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
  /** Escapes an id for use in a CSS attribute selector. */
  const cssId = (s) => (window.CSS && typeof CSS.escape === 'function' ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const fmtClock = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const fmtDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

  /** Human length of a time span, e.g. "5 h", "3 days". */
  function span(ms) {
    const abs = Math.abs(ms);
    if (abs < HOUR) return `${Math.max(1, Math.round(abs / 60000))} min`;
    if (abs < DAY) return `${Math.round(abs / HOUR)} h`;
    return plural(Math.round(abs / DAY), 'day', 'days');
  }

  let idCounter = 0;
  /** Unique ids for buckets, items and steps. */
  function newId(prefix) {
    const c = window.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    idCounter += 1;
    return `${prefix}-${idCounter}-${(c && c.getRandomValues ? c.getRandomValues(new Uint32Array(1))[0] : idCounter).toString(36)}`;
  }

  // ---------- Demo data ----------
  /**
   * Creates an item.
   * @param {{title: string, weight?: number, steps?: string[], notes?: string, createdAt?: number}} spec
   */
  function makeItem(spec) {
    return {
      id: newId('i'),
      title: spec.title,
      notes: spec.notes || '',
      weight: spec.weight || 1,
      steps: (spec.steps || []).map((t) => ({ id: newId('s'), title: t, done: false })),
      createdAt: spec.createdAt ?? START,
    };
  }

  /** Creates a bucket from a preset. Entries can be titles or item specs. */
  function makeBucket(name, icon, color, presetId, entries, createdAt = START - 30 * DAY) {
    return {
      id: newId('b'),
      name,
      icon,
      color,
      rules: { ...E.PRESETS[presetId].rules },
      items: entries.map((e, i) => makeItem({ createdAt: createdAt + i * HOUR, ...(typeof e === 'string' ? { title: e } : e) })),
      events: [],
    };
  }

  /** Adds a past draw-and-finish to a bucket's history (demo seeding only). */
  function finishInPast(bucket, itemId, at) {
    bucket.events.push(E.recordDraw(itemId, at - 2 * HOUR));
    const res = E.resolve(bucket, itemId, 'done', at);
    if (res.ok) bucket.events.push(res.event);
  }

  /** Builds the demo library. */
  function seed() {
    const games = makeBucket('Game Backlog', '🎮', 'purple', 'grab-and-go', [
      'Hades II', 'Outer Wilds', 'Celeste', 'Disco Elysium', 'Hollow Knight', 'Tunic',
      'Pentiment', 'Return of the Obra Dinn', 'Stardew Valley', "Baldur's Gate 3", 'Inscryption', 'Animal Well',
    ]);
    finishInPast(games, games.items[2].id, START - 14 * DAY);

    const systems = makeBucket(
      'Server Maintenance', '🖥️', 'blue', 'rotation-pool',
      ['web-01', 'web-02', 'db-primary', 'db-replica', 'cache-01', 'mail-01', 'backup-nas', 'vpn-gw', 'build-runner', 'monitor-01']
        .map((title) => ({ title, steps: ['Apply updates', 'Reboot', 'Check the logs'] })),
    );
    // Six of the ten were finished 10 to 20 days ago: the example in plan.md §6.2.
    systems.items.slice(0, 6).forEach((item, i) => finishInPast(systems, item.id, START - (20 - i * 2) * DAY));

    const chores = makeBucket('Chores', '🧹', 'teal', 'mystery-bag', [
      'Vacuum the living room', 'Clean the bathroom mirror', 'Water the plants', 'Wipe the kitchen counters',
      'Take out the recycling', 'Dust the bookshelves', 'Wash the car', 'Change the bed sheets',
    ]);

    const dinner = makeBucket('Dinner Ideas', '🍜', 'yellow', 'weighted', [
      { title: 'Ramen', weight: 5 }, { title: 'Tacos', weight: 3 }, { title: 'Green curry', weight: 2 },
      { title: 'Homemade pizza', weight: 2 }, { title: 'Stir-fry', weight: 1 }, { title: 'Lentil soup', weight: 1 },
    ]);

    const reading = makeBucket('Reading Pile', '📚', 'green', 'simmer', [
      'The Left Hand of Darkness', 'Piranesi', 'Project Hail Mary', 'Braiding Sweetgrass', 'The Overstory', 'A Psalm for the Wild-Built',
    ].map((title, i) => ({ title, createdAt: START - (i * 14 + 2) * DAY })));

    return {
      version: STATE_VERSION,
      now: START,
      theme: 'auto',
      reduceMotion: false,
      selectedBucketId: games.id,
      buckets: [games, systems, chores, dinner, reading],
      layout: { ...LAYOUT_DEFAULTS },
    };
  }

  // ---------- State ----------
  /** Loads saved state, or null if missing, unreadable or from another version. */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.version !== STATE_VERSION || !Array.isArray(s.buckets) || s.buckets.length === 0) return null;
      s.layout = { ...LAYOUT_DEFAULTS, ...s.layout };
      return s;
    } catch {
      return null;
    }
  }

  /** Saves state. Failure (private mode, quota) is fine: the demo keeps working in memory. */
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* Storage unavailable; nothing to do. */
    }
  }

  let state = load() || seed();

  /** View-only state that isn't saved. */
  const ui = {
    selectedItemId: null,
    tab: 'bucket',
    peek: false,
    arriving: null,
    busy: false,
    sidebarOpen: !mq('(max-width: 639px)'),
    inspectorOpen: !mq('(max-width: 899px)'),
    mood: null,
    baseMood: 'idle',
    moodTimer: 0,
    resetArmed: false,
  };

  const current = () => state.buckets.find((b) => b.id === state.selectedBucketId) || state.buckets[0];
  const colorOf = (b) => COLORS[b.color] || COLORS.blue;
  const findItem = (b, id) => b.items.find((i) => i.id === id);
  const derive = (b = current()) => E.deriveItems(b, state.now);
  const motionReduced = () => Boolean(state.reduceMotion) || mq('(prefers-reduced-motion: reduce)');
  const canAnimate = (el) => !motionReduced() && Boolean(el) && typeof el.animate === 'function';
  const handCard = (id) => $('handCards').querySelector(`[data-item="${cssId(id)}"]`);

  /** Sets the bucket color variables on an element. */
  function paintVars(el, b) {
    const c = colorOf(b);
    el.style.setProperty('--enamel', c.fill);
    el.style.setProperty('--enamel-text', c.text);
    el.style.setProperty('--on-enamel', c.on);
  }

  /** Mystery Bag hides titles of items sitting in the bucket. Returns null when hidden. */
  function visibleTitle(b, s) {
    if (!b.rules.hideTitlesUntilDrawn || ui.peek) return s.item.title;
    const arriving = Boolean(ui.arriving && ui.arriving.has(s.item.id));
    return s.status === 'in' || arriving ? null : s.item.title;
  }

  /** Reads text to screen readers through the live region. */
  function announce(msg) {
    const live = $('live');
    live.textContent = '';
    window.setTimeout(() => {
      live.textContent = msg;
    }, 30);
  }

  // ---------- Text ----------
  /** Explains why a draw isn't possible right now. */
  function reasonText(check, b) {
    switch (check.reason) {
      case 'locked': {
        const names = check.holding.map((i) => `“${i.title}”`).join(' and ');
        return `Finish or toss back ${names} first.`;
      }
      case 'hand-full':
        return `Your hand is full (${b.rules.maxInHand}). Finish or toss something back first.`;
      case 'all-cooling-down':
        return `Everything is resting. The next item is back in ${span(check.opensAt - state.now)}.`;
      case 'empty':
        return check.doneCount ? 'All done. Add more items below to keep going.' : 'This bucket is empty. Add an item below to get started.';
      default:
        return '';
    }
  }

  /** Short line under the Draw button when a draw is possible. */
  function readyHint(b, check, states) {
    const avail = states.filter((s) => s.status === 'in').length;
    if (b.rules.noRepeat) {
      if (check.needsCycleReset) return 'Everything has had a turn. The next draw starts a new round.';
      return `${check.candidates.length} of ${b.items.length} are waiting for a turn this round.`;
    }
    if (b.rules.hideTitlesUntilDrawn) return `${plural(avail, 'folded slip', 'folded slips')} inside. No peeking.`;
    return `${plural(avail, 'item', 'items')} inside.`;
  }

  /** Status column text and dot style for one item. */
  function statusInfo(s, b) {
    const r = b.rules;
    const now = state.now;
    switch (s.status) {
      case 'hand': {
        const held = now - s.heldSince;
        return { key: 'hand', text: held < 60000 ? 'In hand, just drawn' : `In hand for ${span(held)}` };
      }
      case 'done':
        return { key: 'done', text: `Done ${fmtDay.format(s.lastDoneAt)}` };
      case 'cooling':
        return { key: 'cooling', text: `Resting, back in ${span(s.cooldownUntil - now)}` };
      default:
        if (r.noRepeat && s.drawnThisCycle) {
          if (E.isStale(s, r, now)) return { key: 'ready', text: 'Back in the pool' };
          if (r.cycleResetDays > 0 && s.lastDoneAt !== null) {
            return { key: 'turned', text: `Rejoins in ${span(s.lastDoneAt + r.cycleResetDays * DAY - now)}` };
          }
          return { key: 'turned', text: 'Had a turn' };
        }
        return { key: 'ready', text: 'Ready' };
    }
  }

  // ---------- Rendering ----------
  /** Re-renders everything. Pass `{keepInspector: true}` while the user types in it. */
  function renderAll(opts = {}) {
    paintVars(document.documentElement, current());
    renderSidebar();
    renderHeader();
    renderArt();
    renderHand();
    renderContents();
    if (!opts.keepInspector) renderInspector();
    $('clockText').textContent = fmtClock.format(state.now);
    applyLayout();
  }

  function renderSidebar() {
    $('bucketNav').innerHTML = state.buckets
      .map((b) => {
        const st = derive(b);
        const inside = st.filter((s) => s.status === 'in' || s.status === 'cooling').length;
        const hand = st.filter((s) => s.status === 'hand').length;
        const c = colorOf(b);
        const selected = b.id === state.selectedBucketId;
        return `<li><button type="button" class="nav-item" data-bucket="${b.id}" aria-current="${selected}" style="--enamel:${c.fill};--on-enamel:${c.on}">
          <span class="nav-icon" aria-hidden="true">${esc(b.icon)}</span>
          <span class="nav-name">${esc(b.name || 'Untitled bucket')}</span>
          ${hand ? `<span class="nav-hand" title="${plural(hand, 'item', 'items')} in hand">${hand}<span class="sr-only"> in hand,</span></span>` : ''}
          <span class="nav-count">${inside}<span class="sr-only"> inside</span></span>
        </button></li>`;
      })
      .join('');
  }

  function renderHeader() {
    const b = current();
    $('bucketTitle').textContent = b.name || 'Untitled bucket';
    const pid = E.matchPreset(b.rules);
    $('presetChip').textContent = pid === 'custom' ? 'Custom' : E.PRESETS[pid].name;
    document.title = `${b.name || 'Untitled bucket'} – Buckets prototype`;
  }

  const slipMarkup = (x, y, rot, resting) =>
    `<g transform="translate(${x} ${y.toFixed(1)}) rotate(${rot})"><rect class="slip${resting ? ' resting' : ''}" x="-11" y="0" width="22" height="64" rx="2"/>${resting ? '' : '<rect class="slip-band" x="-11" y="0" width="22" height="5" rx="1.5"/>'}</g>`;

  /** Paper slips peeking out of the bucket. More items, fuller bucket. */
  function slipsMarkup(avail, resting) {
    const shown = Math.min(avail, SLIP_SPOTS.length);
    const fill = 6 + shown * 1.7;
    let out = '';
    for (let i = 0; i < Math.min(resting, 3); i += 1) {
      const [x, , rot] = SLIP_SPOTS[SLIP_SPOTS.length - 1 - i];
      out += slipMarkup(x, 62, rot, true);
    }
    for (let i = shown - 1; i >= 0; i -= 1) {
      const [x, depth, rot] = SLIP_SPOTS[i];
      out += slipMarkup(x, 70 - Math.max(6, fill + 8 - depth), rot, false);
    }
    return out;
  }

  function showFace(name) {
    document.querySelectorAll('[data-face]').forEach((g) => g.classList.toggle('shown', g.dataset.face === name));
  }

  /** Shows a short-lived expression, then returns to the resting one. */
  function mood(name, ms) {
    ui.mood = name;
    showFace(name);
    window.clearTimeout(ui.moodTimer);
    ui.moodTimer = window.setTimeout(() => {
      ui.mood = null;
      showFace(ui.baseMood);
    }, ms);
  }

  function renderArt() {
    const b = current();
    const st = derive(b);
    const check = E.checkDraw(b, state.now);
    const avail = st.filter((s) => s.status === 'in').length;
    const resting = st.filter((s) => s.status === 'cooling').length;

    $('slips').innerHTML = slipsMarkup(avail, resting);
    // While a slip is still flying out, keep the lid up and the result unannounced.
    const drawing = Boolean(ui.arriving);
    const lidOn = !drawing && !check.ok && check.reason !== 'empty';
    $('lid').classList.toggle('on', lidOn);
    $('bucketArt').classList.toggle('lid-on', lidOn);

    if (check.ok || check.reason === 'empty') ui.baseMood = 'idle';
    else ui.baseMood = check.reason === 'all-cooling-down' ? 'sleep' : 'wait';
    showFace(ui.mood || ui.baseMood);

    $('drawBtn').setAttribute('aria-disabled', String(!check.ok));
    const n = check.ok ? check.count : b.rules.drawCount;
    $('drawLabel').textContent = n > 1 ? `Draw ${n}` : 'Draw';
    $('drawKbd').textContent = KEYS.draw;
    if (drawing) $('drawHint').textContent = 'Drawing…';
    else $('drawHint').textContent = check.ok ? readyHint(b, check, st) : reasonText(check, b);
    $('bucketArtTitle').textContent = `${b.name || 'Bucket'}, ${plural(avail, 'item', 'items')} ready to draw`;
  }

  function cardMarkup(b, s) {
    const item = s.item;
    const pending = Boolean(ui.arriving && ui.arriving.has(item.id));
    const concealed = pending && b.rules.hideTitlesUntilDrawn;
    const held = state.now - s.heldSince;
    const heldText = held < 60000 ? 'Just drawn' : `In hand for ${span(held)}`;
    const doneSteps = item.steps.filter((st) => st.done).length;
    const steps = item.steps.length
      ? `<ul class="steps">${item.steps
          .map(
            (st) =>
              `<li class="${st.done ? 'is-done' : ''}"><label><input type="checkbox" data-step="${st.id}" data-item="${item.id}" ${st.done ? 'checked' : ''}><span>${esc(st.title)}</span></label></li>`,
          )
          .join('')}</ul><p class="card-meta">${doneSteps} of ${item.steps.length} steps</p>`
      : '';
    const notes = item.notes ? `<p class="card-notes">${esc(item.notes)}</p>` : '';
    return `<article class="card${pending ? ' pending' : ''}${concealed ? ' concealed' : ''}" data-item="${item.id}" aria-label="${esc(item.title)}">
      <h3 class="card-title">${esc(item.title)}</h3>
      <p class="card-meta">${heldText}</p>${notes}${steps}
      <div class="card-actions">
        <button type="button" class="btn-done" data-action="done" data-item="${item.id}" title="Done (${KEYS.done})">Done</button>
        <button type="button" class="btn-toss" data-action="toss" data-item="${item.id}" title="Toss back (${KEYS.toss})">Toss back</button>
      </div>
    </article>`;
  }

  function renderHand() {
    const b = current();
    const st = derive(b);
    const inHand = st.filter((s) => s.status === 'hand').sort((x, y) => x.heldSince - y.heldSince);
    $('handCards').innerHTML = inHand.length
      ? inHand.map((s) => cardMarkup(b, s)).join('')
      : '<div class="hand-empty"><p><strong>Nothing in hand.</strong></p><p>Press Draw to pull something out of the bucket.</p></div>';

    const doneCount = st.filter((s) => s.status === 'done').length;
    const pile = $('donePile');
    pile.hidden = b.rules.onDone !== 'remove' && doneCount === 0;
    pile.innerHTML = `${PILE_ICON}<span>Done pile</span><span class="pile-count">${doneCount}</span>`;
    pile.setAttribute('aria-label', `Done pile, ${plural(doneCount, 'item', 'items')}. Show in the bucket contents.`);
  }

  function rowMarkup(b, s) {
    const info = statusInfo(s, b);
    const title = visibleTitle(b, s);
    const name = title === null ? '<span class="folded">Folded slip</span>' : esc(title);
    const weight = b.rules.selection === 'weighted' ? `<span class="weight-pill" title="Weight">×${s.item.weight}</span>` : '';
    const stepsDone = s.item.steps.filter((st) => st.done).length;
    const steps = s.item.steps.length ? `<span class="steps-pill" title="Steps done">${stepsDone}/${s.item.steps.length}</span>` : '';
    const drawn = s.timesDrawn ? `${s.timesDrawn}×, last ${fmtDay.format(s.lastDrawnAt)}` : 'Never';
    const selected = ui.selectedItemId === s.item.id;
    return `<div class="row" role="option" tabindex="0" aria-selected="${selected}" data-row="${s.item.id}">
      <span class="dot ${info.key}" aria-hidden="true"></span>
      <span class="cell name">${name}${weight}${steps}</span>
      <span class="cell status">${esc(info.text)}</span>
      <span class="cell drawn">${drawn}</span>
    </div>`;
  }

  function renderContents() {
    const b = current();
    const st = derive(b);
    const groups = [
      { key: 'hand', title: 'In hand', rows: st.filter((s) => s.status === 'hand') },
      { key: 'in', title: 'In the bucket', rows: st.filter((s) => s.status === 'in'), add: true },
      { key: 'cooling', title: 'Resting', rows: st.filter((s) => s.status === 'cooling') },
      { key: 'done', title: 'Done pile', rows: st.filter((s) => s.status === 'done') },
    ];
    let html = `<div class="list-head">
      <span></span><span>Name</span>
      <span class="col-head col-status">Status<span class="col-resizer" data-col="status" role="separator" aria-orientation="vertical" aria-label="Resize status column" tabindex="0"></span></span>
      <span class="col-head col-drawn">Drawn<span class="col-resizer" data-col="drawn" role="separator" aria-orientation="vertical" aria-label="Resize drawn column" tabindex="0"></span></span>
    </div>`;
    for (const g of groups) {
      if (!g.rows.length && !g.add) continue;
      const peek =
        g.key === 'in' && b.rules.hideTitlesUntilDrawn
          ? `<button type="button" class="link-btn group-tools" id="peekBtn" aria-pressed="${ui.peek}">${ui.peek ? 'Hide names' : 'Peek at names'}</button>`
          : '';
      html += `<section class="group group-${g.key}" id="group-${g.key}">
        <h2 class="group-title">${g.title}<span class="count">${g.rows.length}</span>${peek}</h2>
        <div class="rows" role="listbox" aria-label="${g.title}">${g.rows.map((s) => rowMarkup(b, s)).join('')}</div>
        ${g.add ? '<div class="row add-row"><span class="dot add" aria-hidden="true"></span><input id="newItem" type="text" placeholder="New item" aria-label="Add an item. Paste several lines to add several." autocomplete="off"></div>' : ''}
      </section>`;
    }
    $('contents').innerHTML = html;
  }

  const num = (label, rule, val, min, max, step = 1) =>
    `<label class="f-row"><span>${label}</span><input type="number" data-rule="${rule}" data-fk="${rule}" value="${val}" min="${min}" max="${max}" step="${step}"></label>`;
  const sw = (label, rule, on) =>
    `<label class="f-row"><span>${label}</span><input type="checkbox" role="switch" class="switch" data-rule="${rule}" data-fk="${rule}" ${on ? 'checked' : ''}></label>`;
  const opt = (v, label, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
  const seg = (rule, value, label, cur) =>
    `<button type="button" role="radio" aria-checked="${value === cur}" data-rule-set="${rule}" data-value="${value}">${label}</button>`;

  function bucketPanel(b) {
    const r = b.rules;
    const pid = E.matchPreset(r);
    const presetOptions =
      Object.entries(E.PRESETS).map(([id, p]) => opt(id, p.name, pid)).join('') +
      (pid === 'custom' ? '<option value="custom" selected disabled>Custom</option>' : '');
    const summary =
      pid === 'custom'
        ? 'You changed some rules, so this bucket no longer matches a type. Pick a type to start again from its rules.'
        : E.PRESETS[pid].summary;
    return `
      <div class="group-box">
        <label class="f-stack"><span class="f-label">Name</span><input type="text" id="fName" data-fk="name" value="${esc(b.name)}"></label>
        <div class="f-stack"><span class="f-label" id="colorLbl">Color</span><div class="swatches" role="group" aria-labelledby="colorLbl">${Object.entries(COLORS)
          .map(([k, c]) => `<button type="button" class="swatch" data-color="${k}" style="--c:${c.fill}" aria-pressed="${b.color === k}" aria-label="${k}"></button>`)
          .join('')}</div></div>
        <div class="f-stack"><span class="f-label" id="iconLbl">Icon</span><div class="icons" role="group" aria-labelledby="iconLbl">${ICONS.map(
          (ic) => `<button type="button" class="icon-choice" data-icon="${ic}" aria-pressed="${b.icon === ic}">${ic}</button>`,
        ).join('')}</div></div>
      </div>
      <h3 class="insp-h">Bucket type</h3>
      <div class="group-box">
        <label class="f-row"><span class="sr-only">Bucket type</span><select id="fPreset" data-fk="preset" class="wide">${presetOptions}</select></label>
        <p class="help">${summary}</p>
      </div>
      <h3 class="insp-h">Drawing</h3>
      <div class="group-box">
        ${num('Items per draw', 'drawCount', r.drawCount, 1, 5)}
        ${num('Most in hand at once', 'maxInHand', r.maxInHand, 1, 10)}
        ${sw('Finish before drawing again', 'lockUntilResolved', r.lockUntilResolved)}
      </div>
      <h3 class="insp-h">When an item is done</h3>
      <div class="group-box">
        <div class="f-row"><div class="segmented" role="radiogroup" aria-label="When an item is done">${seg('onDone', 'remove', 'Take it out', r.onDone)}${seg('onDone', 'return', 'Put it back', r.onDone)}</div></div>
        ${r.onDone === 'return' ? num('Rest before it can come up again (hours)', 'cooldownHours', r.cooldownHours, 0, 720) : ''}
      </div>
      <h3 class="insp-h">Taking turns</h3>
      <div class="group-box">
        ${sw('Everything gets a turn before repeats', 'noRepeat', r.noRepeat)}
        ${
          r.noRepeat
            ? `${num('Finished items rejoin after (days)', 'cycleResetDays', r.cycleResetDays, 0, 365)}
               <p class="help">0 means they wait until the whole round is finished.</p>
               ${sw('Prefer items still waiting for a turn', 'favorUndrawn', r.favorUndrawn)}
               ${sw('Tossing back uses up a turn', 'tossBackCountsAsDrawn', r.tossBackCountsAsDrawn)}`
            : ''
        }
      </div>
      <h3 class="insp-h">Choosing</h3>
      <div class="group-box">
        <label class="f-row"><span>Pick by</span><select data-rule="selection" data-fk="selection">${opt('uniform', 'Pure chance', r.selection)}${opt('weighted', 'Item weight', r.selection)}${opt('aging', 'Time spent waiting', r.selection)}</select></label>
        ${r.selection === 'aging' ? num('Extra chance per day waiting', 'agingRatePerDay', r.agingRatePerDay, 0, 5, 0.1) : ''}
        ${sw('Hide names until drawn', 'hideTitlesUntilDrawn', r.hideTitlesUntilDrawn)}
      </div>
      <h3 class="insp-h">Tossing back</h3>
      <div class="group-box">
        <label class="f-row"><span>Before tossing back</span><select data-rule="tossBackConfirm" data-fk="toss">${opt('none', "Don't ask", r.tossBackConfirm)}${opt('simple', 'Ask once', r.tossBackConfirm)}${opt('deliberate', 'Ask twice, invite a reason', r.tossBackConfirm)}</select></label>
      </div>`;
  }

  function itemPanel(b, item) {
    const s = derive(b).find((x) => x.item.id === item.id);
    const hidden = visibleTitle(b, s) === null;
    const info = statusInfo(s, b);
    const history =
      b.events
        .filter((e) => e.itemId === item.id && EVENT_LABEL[e.kind])
        .slice(-12)
        .reverse()
        .map((e) => `<li><span>${EVENT_LABEL[e.kind]}${e.note ? `: ${esc(e.note)}` : ''}</span><time>${fmtClock.format(e.at)}</time></li>`)
        .join('') || '<li>Not drawn yet.</li>';
    const titleField = hidden
      ? '<div class="f-stack"><span class="f-label">Title</span><span class="folded">Hidden until drawn.</span><button type="button" class="link-btn" id="peekItem">Peek anyway</button></div>'
      : `<label class="f-stack"><span class="f-label">Title</span><input type="text" id="iTitle" data-fk="iTitle" value="${esc(item.title)}"></label>`;
    return `
      <div class="group-box">
        ${titleField}
        <label class="f-stack"><span class="f-label">Notes</span><textarea id="iNotes" data-fk="iNotes" rows="3">${esc(item.notes || '')}</textarea></label>
        <label class="f-stack"><span class="f-label"><span>Weight</span><output id="iWeightOut">${item.weight}</output></span><input type="range" id="iWeight" data-fk="iWeight" min="1" max="10" step="1" value="${item.weight}"></label>
        ${b.rules.selection !== 'weighted' ? '<p class="help">Weight only matters when Pick by is set to Item weight.</p>' : ''}
      </div>
      <h3 class="insp-h">Steps</h3>
      <div class="group-box">
        <ul class="insp-steps">${item.steps
          .map(
            (st) =>
              `<li><label><input type="checkbox" data-istep="${st.id}" ${st.done ? 'checked' : ''}><span>${esc(st.title)}</span></label><button type="button" class="icon-btn small" data-rmstep="${st.id}" aria-label="Remove step: ${esc(st.title)}">×</button></li>`,
          )
          .join('')}</ul>
        <input type="text" id="iNewStep" data-fk="iNewStep" class="step-input" placeholder="Add a step" aria-label="Add a step">
      </div>
      <h3 class="insp-h">Details</h3>
      <div class="group-box"><dl class="stats">
        <div><dt>Status</dt><dd>${esc(info.text)}</dd></div>
        <div><dt>Times drawn</dt><dd>${s.timesDrawn}</dd></div>
        <div><dt>Times done</dt><dd>${s.timesDone}</dd></div>
        <div><dt>Last done</dt><dd>${s.lastDoneAt !== null ? fmtDay.format(s.lastDoneAt) : 'Never'}</dd></div>
      </dl></div>
      <h3 class="insp-h">History</h3>
      <div class="group-box"><ol class="history">${history}</ol></div>
      <button type="button" class="danger-btn" id="iRemove">Remove from bucket</button>`;
  }

  function renderInspector() {
    const el = $('inspector');
    const b = current();
    const item = ui.selectedItemId ? findItem(b, ui.selectedItemId) : null;
    if (!item) {
      ui.selectedItemId = null;
      ui.tab = 'bucket';
    }
    // Remember focus so re-rendering doesn't throw the user out of a control.
    const active = document.activeElement;
    const focusKey = active && el.contains(active) ? active.dataset.fk : null;
    const scroll = el.scrollTop;
    el.innerHTML = `<div class="insp-inner">
      <div class="segmented" role="group" aria-label="Inspector view">
        <button type="button" data-tab="bucket" aria-pressed="${ui.tab === 'bucket'}">Bucket</button>
        <button type="button" data-tab="item" aria-pressed="${ui.tab === 'item'}" ${item ? '' : 'disabled'}>Item</button>
      </div>
      ${ui.tab === 'item' && item ? itemPanel(b, item) : bucketPanel(b)}
    </div>`;
    el.scrollTop = scroll;
    if (focusKey) {
      const target = el.querySelector(`[data-fk="${focusKey}"]`);
      if (target) target.focus();
    }
  }

  // ---------- Animation ----------
  /** Screen point at the middle of the bucket's mouth. */
  function mouthPoint() {
    const r = $('bucketArt').getBoundingClientRect();
    return { x: r.left + r.width * (130 / 260), y: r.top + r.height * (66 / 250) };
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Runs a Web Animation and resolves when it ends (or immediately when motion is reduced). */
  async function play(el, keyframes, options) {
    if (!canAnimate(el)) return null;
    const anim = el.animate(keyframes, options);
    try {
      await anim.finished;
    } catch {
      /* Cancelled; carry on. */
    }
    return anim;
  }

  const wobble = () =>
    play($('bucketBody'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(0)' }], {
      duration: 420,
      easing: 'ease-in-out',
    });

  const plop = () =>
    play($('bucketBody'), [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.04, 0.94)' }, { transform: 'scale(0.98, 1.03)' }, { transform: 'scale(1, 1)' }], {
      duration: 360,
      easing: 'ease-out',
    });

  /** Side-to-side "no" when a draw isn't allowed. */
  function shakeNo() {
    mood('no', 900);
    play($('bucketBody'), [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], {
      duration: 360,
    });
  }

  /** Flips a concealed card to reveal its title (Mystery Bag). */
  async function reveal(card) {
    if (!canAnimate(card)) {
      card.classList.remove('concealed');
      return;
    }
    const closing = card.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
    try {
      await closing.finished;
    } catch {
      /* Cancelled. */
    }
    card.classList.remove('concealed');
    const opening = card.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }], { duration: 220, easing: 'ease-out' });
    closing.cancel(); // Drop the held 90° frame now that the opening half has taken over.
    try {
      await opening.finished;
    } catch {
      /* Cancelled. */
    }
  }

  /** A paper slip rises out of the bucket and unfolds into the item's card. */
  async function flySlipToCard(id) {
    const card = handCard(id);
    if (!card) return;
    if (!canAnimate(card)) {
      card.classList.remove('pending', 'concealed');
      return;
    }
    const mouth = mouthPoint();
    const to = card.getBoundingClientRect();
    const w = 34;
    const h = 50;
    const left = mouth.x - w / 2;
    const top = mouth.y - h / 2;
    const slip = document.createElement('div');
    slip.className = 'flying-slip';
    slip.setAttribute('aria-hidden', 'true');
    slip.style.left = `${left}px`;
    slip.style.top = `${top}px`;
    document.body.appendChild(slip);
    await play(
      slip,
      [
        { transform: 'translate(0px, 26px) rotate(-8deg) scale(0.8)', opacity: 0 },
        { transform: 'translate(0px, -64px) rotate(6deg) scale(1)', opacity: 1, offset: 0.42 },
        { transform: `translate(${to.left - left}px, ${to.top - top}px) rotate(0deg) scale(${to.width / w}, ${to.height / h})`, opacity: 1 },
      ],
      { duration: 780, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' },
    );
    card.classList.remove('pending');
    slip.remove();
    if (card.classList.contains('concealed')) await reveal(card);
    else play(card, [{ transform: 'scale(0.97)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' });
  }

  /** Flies a copy of a card that has just left the hand into the bucket or onto the done pile. */
  async function flyGhost(snapshot, target) {
    if (!snapshot || motionReduced() || typeof document.body.animate !== 'function') {
      if (target === 'bucket') await plop();
      return;
    }
    const { html, rect } = snapshot;
    const ghost = document.createElement('div');
    ghost.className = 'ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.innerHTML = html;
    ghost.querySelectorAll('button, input').forEach((el) => el.setAttribute('tabindex', '-1'));
    document.body.appendChild(ghost);
    const pile = $('donePile');
    const dest = target === 'pile' && !pile.hidden ? centerOf(pile) : mouthPoint();
    const dx = dest.x - (rect.left + rect.width / 2);
    const dy = dest.y - (rect.top + rect.height / 2);
    await play(
      ghost,
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 50}px) scale(0.5) rotate(-6deg)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.1) rotate(8deg)`, opacity: 0.2 },
      ],
      { duration: 600, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
    );
    ghost.remove();
    if (target === 'bucket' || pile.hidden) await plop();
    else play(pile, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 260 });
  }

  /** Captures a hand card's look and position before it is re-rendered away. */
  function snapshotCard(id) {
    const card = handCard(id);
    return card ? { html: card.outerHTML, rect: card.getBoundingClientRect() } : null;
  }

  // ---------- Actions ----------
  async function doDraw() {
    if (ui.busy) return;
    const b = current();
    const res = E.draw(b, state.now, E.cryptoRng);
    if (!res.ok) {
      shakeNo();
      announce(reasonText(res, b));
      return;
    }
    ui.busy = true;
    b.events.push(...res.events);
    save();
    ui.arriving = new Set(res.itemIds);
    renderAll({ keepInspector: true });
    mood('wow', 1000);
    await wobble();
    for (const id of res.itemIds) await flySlipToCard(id);
    ui.arriving = null;
    renderArt();
    renderHand();
    renderContents();
    renderInspector();
    ui.busy = false;
    const names = res.itemIds.map((id) => `“${findItem(b, id).title}”`).join(' and ');
    announce(`${res.cycleReset ? 'New round. ' : ''}You drew ${names}.`);
  }

  async function doDone(id) {
    if (ui.busy) return;
    const b = current();
    const res = E.resolve(b, id, 'done', state.now);
    if (!res.ok) return;
    const snap = snapshotCard(id);
    b.events.push(res.event);
    const item = findItem(b, id);
    if (b.rules.onDone === 'return') item.steps.forEach((st) => (st.done = false));
    save();
    ui.busy = true;
    renderAll();
    await flyGhost(snap, b.rules.onDone === 'remove' ? 'pile' : 'bucket');
    mood('happy', 1400);
    ui.busy = false;
    announce(`Done: “${item.title}”. ${b.rules.onDone === 'remove' ? 'It went to the done pile.' : 'It went back in the bucket.'}`);
  }

  function requestToss(id) {
    if (ui.busy) return;
    const mode = current().rules.tossBackConfirm;
    if (mode === 'none') doToss(id, '');
    else openTossSheet(id, mode);
  }

  async function doToss(id, note) {
    const b = current();
    const res = E.resolve(b, id, 'tossed-back', state.now, { note });
    if (!res.ok) return;
    const snap = snapshotCard(id);
    b.events.push(res.event);
    save();
    ui.busy = true;
    renderAll();
    await flyGhost(snap, 'bucket');
    ui.busy = false;
    announce(`Tossed “${findItem(b, id).title}” back in.`);
  }

  function addItems(titles) {
    const b = current();
    for (const title of titles) b.items.push(makeItem({ title, createdAt: state.now }));
    save();
    renderAll({ keepInspector: true });
    const input = $('newItem');
    if (input) input.focus();
    plop();
    announce(titles.length === 1 ? `Added “${titles[0]}”.` : `Added ${titles.length} items.`);
  }

  function toggleStep(itemId, stepId, done) {
    const item = findItem(current(), itemId);
    const step = item && item.steps.find((st) => st.id === stepId);
    if (!step) return;
    step.done = done;
    save();
    const fromHand = $('handCards').contains(document.activeElement);
    renderHand();
    renderContents();
    renderInspector();
    if (fromHand) {
      const cb = $('handCards').querySelector(`[data-step="${cssId(stepId)}"]`);
      if (cb) cb.focus();
    }
  }

  function removeItem(id) {
    const b = current();
    const item = findItem(b, id);
    if (!item) return;
    b.items = b.items.filter((i) => i.id !== id);
    ui.selectedItemId = null;
    ui.tab = 'bucket';
    save();
    renderAll();
    announce(`Removed “${item.title}”.`);
  }

  function selectBucket(id) {
    state.selectedBucketId = id;
    ui.selectedItemId = null;
    ui.tab = 'bucket';
    ui.peek = false;
    if (isOverlay('sidebar')) ui.sidebarOpen = false;
    save();
    renderAll();
  }

  function selectItem(id, openInspector) {
    const hadRowFocus = Boolean(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.row);
    ui.selectedItemId = id;
    ui.tab = 'item';
    if (openInspector && isOverlay('inspector')) ui.inspectorOpen = true;
    renderContents();
    renderInspector();
    applyLayout();
    if (hadRowFocus || !openInspector) {
      const row = $('contents').querySelector(`[data-row="${cssId(id)}"]`);
      if (row) row.focus();
    }
  }

  function setRule(rule, value) {
    const b = current();
    b.rules = { ...b.rules, [rule]: value };
    if (rule === 'hideTitlesUntilDrawn') ui.peek = false;
    save();
    renderAll();
  }

  function advance(ms, label) {
    state.now += ms;
    save();
    renderAll();
    announce(`Moved time forward ${label.replace('+', '')}. It's now ${fmtClock.format(state.now)}.`);
  }

  // ---------- Sheets ----------
  function openSheet(html, labelledBy) {
    const d = $('sheet');
    d.innerHTML = html;
    d.setAttribute('aria-labelledby', labelledBy);
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal();
    } else {
      d.setAttribute('open', '');
    }
    return d;
  }

  function closeSheet() {
    const d = $('sheet');
    if (typeof d.close === 'function' && d.open) d.close();
    else d.removeAttribute('open');
  }

  function openTossSheet(id, mode) {
    const item = findItem(current(), id);
    if (!item) return;
    const deliberate = mode === 'deliberate';
    openSheet(
      `<div class="sheet-body">
        <h2 id="sheetTitle">Toss “${esc(item.title)}” back?</h2>
        <p>${deliberate ? 'This bucket asks you to finish what you draw. Tossing it back returns it unfinished so you can draw again.' : 'It goes back in the bucket unfinished.'}</p>
        ${deliberate ? '<label class="f-stack" style="padding:0"><span class="f-label">What got in the way? (optional)</span><textarea id="tossReason" rows="2"></textarea></label>' : ''}
        <p class="sheet-note" id="sheetNote" aria-live="polite"></p>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn" id="sheetCancel">Keep it</button>
        <button type="button" class="btn ${deliberate ? '' : 'primary'}" id="sheetConfirm">Toss back</button>
      </div>`,
      'sheetTitle',
    );
    let armed = !deliberate;
    $('sheetCancel').addEventListener('click', closeSheet);
    $('sheetConfirm').addEventListener('click', () => {
      if (!armed) {
        // "Deliberate" friction: the first press only arms the button.
        armed = true;
        const btn = $('sheetConfirm');
        btn.textContent = 'Yes, toss it back';
        btn.classList.add('destructive');
        $('sheetNote').textContent = 'Press again to confirm.';
        return;
      }
      const reason = $('tossReason');
      const note = reason ? reason.value.trim() : '';
      closeSheet();
      doToss(id, note);
    });
    $('sheetCancel').focus();
  }

  function openNewBucketSheet() {
    const presets = Object.entries(E.PRESETS)
      .map(
        ([id, p], i) =>
          `<label class="preset-card"><input type="radio" name="newPreset" value="${id}" ${i === 0 ? 'checked' : ''}><span><strong>${p.name}</strong><small>${p.summary}</small></span></label>`,
      )
      .join('');
    openSheet(
      `<div class="sheet-body">
        <h2 id="sheetTitle">New bucket</h2>
        <label class="f-stack" style="padding:0"><span class="f-label">Name</span><input type="text" id="nbName" placeholder="Weekend ideas" autocomplete="off"></label>
        <fieldset class="preset-cards"><legend class="f-label">Type</legend>${presets}</fieldset>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn" id="sheetCancel">Cancel</button>
        <button type="button" class="btn primary" id="sheetConfirm">Create bucket</button>
      </div>`,
      'sheetTitle',
    );
    const create = () => {
      const name = $('nbName').value.trim() || 'New bucket';
      const picked = document.querySelector('input[name="newPreset"]:checked');
      const colorKeys = Object.keys(COLORS);
      const bucket = makeBucket(name, '🎲', colorKeys[state.buckets.length % colorKeys.length], picked ? picked.value : 'grab-and-go', [], state.now);
      state.buckets.push(bucket);
      closeSheet();
      selectBucket(bucket.id);
      const input = $('newItem');
      if (input) input.focus();
      announce(`Created ${name}. Add items to fill it.`);
    };
    $('sheetCancel').addEventListener('click', closeSheet);
    $('sheetConfirm').addEventListener('click', create);
    $('nbName').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        create();
      }
    });
    $('nbName').focus();
  }

  // ---------- Layout and resizing ----------
  function isOverlay(pane) {
    return pane === 'sidebar' ? mq('(max-width: 639px)') : mq('(max-width: 899px)');
  }

  function applyLayout() {
    const app = $('app');
    const L = state.layout;
    app.style.setProperty('--sidebar-w', ui.sidebarOpen ? `${L.sidebar}px` : '0px');
    app.style.setProperty('--inspector-w', ui.inspectorOpen ? `${L.inspector}px` : '0px');
    app.classList.toggle('sidebar-closed', !ui.sidebarOpen);
    app.classList.toggle('inspector-closed', !ui.inspectorOpen);
    $('contents').style.setProperty('--col-status', `${L.status}px`);
    $('contents').style.setProperty('--col-drawn', `${L.drawn}px`);
    $('sidebarToggle').setAttribute('aria-expanded', String(ui.sidebarOpen));
    $('inspectorToggle').setAttribute('aria-expanded', String(ui.inspectorOpen));
    $('sidebar').inert = !ui.sidebarOpen;
    $('inspector').inert = !ui.inspectorOpen;
    $('scrim').hidden = !((isOverlay('sidebar') && ui.sidebarOpen) || (isOverlay('inspector') && ui.inspectorOpen));
  }

  /**
   * Makes a pane divider draggable. Dragging well past the minimum width
   * snaps the pane closed; dragging back reopens it. Double-click resets it.
   */
  function setupDivider(div) {
    const pane = div.dataset.pane;
    const openKey = pane === 'sidebar' ? 'sidebarOpen' : 'inspectorOpen';
    const [min, max] = LIMITS[pane];
    const sign = pane === 'sidebar' ? 1 : -1;

    div.addEventListener('pointerdown', (e) => {
      if (isOverlay(pane)) return;
      e.preventDefault();
      if (div.setPointerCapture) div.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = ui[openKey] ? state.layout[pane] : 0;
      document.body.classList.add('resizing');
      const move = (ev) => {
        const w = startW + sign * (ev.clientX - startX);
        if (w < min - 48) {
          if (ui[openKey]) {
            ui[openKey] = false;
            applyLayout();
          }
          return;
        }
        ui[openKey] = true;
        state.layout[pane] = clamp(w, min, max);
        applyLayout();
      };
      const up = () => {
        div.removeEventListener('pointermove', move);
        div.removeEventListener('pointerup', up);
        div.removeEventListener('pointercancel', up);
        document.body.classList.remove('resizing');
        save();
      };
      div.addEventListener('pointermove', move);
      div.addEventListener('pointerup', up);
      div.addEventListener('pointercancel', up);
    });

    div.addEventListener('dblclick', () => {
      state.layout[pane] = LAYOUT_DEFAULTS[pane];
      ui[openKey] = true;
      applyLayout();
      save();
    });

    div.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        ui[openKey] = true;
        state.layout[pane] = clamp(state.layout[pane] + (e.key === 'ArrowRight' ? 16 : -16) * sign, min, max);
        applyLayout();
        save();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        ui[openKey] = !ui[openKey];
        applyLayout();
      }
    });
  }

  function onColResizeStart(e) {
    const handle = e.target.closest('.col-resizer');
    if (!handle) return;
    e.preventDefault();
    const col = handle.dataset.col;
    const startX = e.clientX;
    const startW = state.layout[col];
    if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    // The handle sits on the column's left edge, so dragging left widens it.
    const move = (ev) => {
      state.layout[col] = clamp(startW - (ev.clientX - startX), ...LIMITS[col]);
      applyLayout();
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing');
      save();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  /** Double-clicking a column edge sizes the column to fit its widest cell. */
  function onColAutoFit(e) {
    const handle = e.target.closest('.col-resizer');
    if (!handle) return;
    const col = handle.dataset.col;
    const contents = $('contents');
    contents.style.setProperty(`--col-${col}`, 'max-content');
    let widest = 0;
    contents.querySelectorAll(`.cell.${col}, .col-${col}`).forEach((c) => {
      widest = Math.max(widest, c.getBoundingClientRect().width);
    });
    state.layout[col] = clamp(Math.ceil(widest) + 12, ...LIMITS[col]);
    applyLayout();
    save();
  }

  // ---------- Events ----------
  function onContentsKey(e) {
    const t = e.target;
    if (t.id === 'newItem') {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = t.value.trim();
        if (v) addItems([v]);
      } else if (e.key === 'Escape') {
        t.blur();
      }
      return;
    }
    const row = t.closest('[data-row]');
    if (row) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const rows = [...$('contents').querySelectorAll('[data-row]')];
        const next = rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next) selectItem(next.dataset.row, false);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectItem(row.dataset.row, true);
      }
      return;
    }
    const handle = t.closest('.col-resizer');
    if (handle && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const col = handle.dataset.col;
      state.layout[col] = clamp(state.layout[col] + (e.key === 'ArrowLeft' ? 12 : -12), ...LIMITS[col]);
      applyLayout();
      save();
    }
  }

  function onPaste(e) {
    if (e.target.id !== 'newItem' || !e.clipboardData) return;
    const lines = e.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
      .filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      addItems(lines);
    }
  }

  function ruleValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
      const n = Number(el.value);
      return clamp(Number.isFinite(n) ? n : Number(el.min) || 0, Number(el.min), Number(el.max));
    }
    return el.value;
  }

  function onInspectorClick(e) {
    const b = current();
    const t = e.target;
    const tab = t.closest('[data-tab]');
    if (tab && !tab.disabled) {
      ui.tab = tab.dataset.tab;
      renderInspector();
      return;
    }
    const swatch = t.closest('[data-color]');
    if (swatch) {
      b.color = swatch.dataset.color;
      save();
      renderAll();
      return;
    }
    const icon = t.closest('[data-icon]');
    if (icon) {
      b.icon = icon.dataset.icon;
      save();
      renderAll();
      return;
    }
    const segBtn = t.closest('[data-rule-set]');
    if (segBtn) {
      setRule(segBtn.dataset.ruleSet, segBtn.dataset.value);
      return;
    }
    if (t.closest('#iRemove')) {
      removeItem(ui.selectedItemId);
      return;
    }
    if (t.closest('#peekItem')) {
      ui.peek = true;
      renderContents();
      renderInspector();
      return;
    }
    const rm = t.closest('[data-rmstep]');
    if (rm) {
      const item = findItem(b, ui.selectedItemId);
      if (item) item.steps = item.steps.filter((st) => st.id !== rm.dataset.rmstep);
      save();
      renderHand();
      renderContents();
      renderInspector();
    }
  }

  function onInspectorInput(e) {
    const b = current();
    const t = e.target;
    const item = ui.selectedItemId ? findItem(b, ui.selectedItemId) : null;
    if (t.id === 'fName') {
      b.name = t.value;
      save();
      renderSidebar();
      renderHeader();
    } else if (t.id === 'iTitle' && item) {
      item.title = t.value;
      save();
      renderContents();
      renderHand();
    } else if (t.id === 'iNotes' && item) {
      item.notes = t.value;
      save();
      renderHand();
    } else if (t.id === 'iWeight' && item) {
      item.weight = Number(t.value);
      $('iWeightOut').textContent = t.value;
      save();
      renderContents();
    }
  }

  function onInspectorChange(e) {
    const t = e.target;
    if (t.dataset.rule) {
      setRule(t.dataset.rule, ruleValue(t));
    } else if (t.id === 'fPreset' && E.PRESETS[t.value]) {
      current().rules = { ...E.PRESETS[t.value].rules };
      ui.peek = false;
      save();
      renderAll();
    } else if (t.dataset.istep) {
      toggleStep(ui.selectedItemId, t.dataset.istep, t.checked);
    }
  }

  function onInspectorKey(e) {
    if (e.target.id === 'iNewStep' && e.key === 'Enter') {
      e.preventDefault();
      const title = e.target.value.trim();
      const item = findItem(current(), ui.selectedItemId);
      if (!title || !item) return;
      item.steps.push({ id: newId('s'), title, done: false });
      save();
      renderHand();
      renderContents();
      renderInspector();
    }
  }

  function onGlobalKey(e) {
    if ($('sheet').open) return;
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    const t = e.target;
    const typing = Boolean(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable));
    const firstInHand = () => {
      const c = $('handCards').querySelector('[data-item]');
      return c ? c.dataset.item : null;
    };
    const key = (e.key || '').toLowerCase();
    if (mod && key === 'd') {
      e.preventDefault();
      doDraw();
      return;
    }
    if (typing && t.type !== 'checkbox') return;
    if (mod && key === 'enter') {
      const id = firstInHand();
      if (id) {
        e.preventDefault();
        doDone(id);
      }
    } else if (mod && key === 'backspace') {
      const id = firstInHand();
      if (id) {
        e.preventDefault();
        requestToss(id);
      }
    } else if (!mod && !e.altKey && key === 'n') {
      const input = $('newItem');
      if (input) {
        e.preventDefault();
        input.focus();
      }
    }
  }

  /** Overlay mode of each pane at the last resize, so crossing a breakpoint closes overlays. */
  const wasOverlay = { sidebar: isOverlay('sidebar'), inspector: isOverlay('inspector') };

  function onResize() {
    for (const pane of ['sidebar', 'inspector']) {
      const now = isOverlay(pane);
      if (now !== wasOverlay[pane]) ui[pane === 'sidebar' ? 'sidebarOpen' : 'inspectorOpen'] = !now;
      wasOverlay[pane] = now;
    }
    applyLayout();
  }

  function onReset() {
    const btn = $('resetBtn');
    if (!ui.resetArmed) {
      ui.resetArmed = true;
      btn.textContent = 'Press again to reset';
      window.setTimeout(() => {
        ui.resetArmed = false;
        btn.textContent = 'Reset demo';
      }, 3000);
      return;
    }
    ui.resetArmed = false;
    btn.textContent = 'Reset demo';
    const keepLayout = state.layout;
    state = seed();
    state.layout = keepLayout;
    Object.assign(ui, { selectedItemId: null, tab: 'bucket', peek: false, arriving: null, busy: false });
    save();
    applyTheme();
    renderAll();
    announce('Demo reset.');
  }

  function applyTheme() {
    const root = document.documentElement;
    if (state.theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = state.theme;
    root.classList.toggle('reduce-motion', Boolean(state.reduceMotion));
    $('themeSel').value = state.theme;
    $('motionChk').checked = Boolean(state.reduceMotion);
  }

  function wire() {
    $('bucketNav').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bucket]');
      if (btn) selectBucket(btn.dataset.bucket);
    });
    $('drawBtn').addEventListener('click', doDraw);
    $('handCards').addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      if (a.dataset.action === 'done') doDone(a.dataset.item);
      else requestToss(a.dataset.item);
    });
    $('handCards').addEventListener('change', (e) => {
      const cb = e.target.closest('[data-step]');
      if (cb) toggleStep(cb.dataset.item, cb.dataset.step, cb.checked);
    });
    $('donePile').addEventListener('click', () => {
      const g = $('group-done');
      if (g) g.scrollIntoView({ behavior: motionReduced() ? 'auto' : 'smooth', block: 'start' });
    });

    const contents = $('contents');
    contents.addEventListener('click', (e) => {
      if (e.target.closest('#peekBtn')) {
        ui.peek = !ui.peek;
        renderContents();
        renderInspector();
        return;
      }
      const row = e.target.closest('[data-row]');
      if (row) selectItem(row.dataset.row, true);
    });
    contents.addEventListener('keydown', onContentsKey);
    contents.addEventListener('paste', onPaste);
    contents.addEventListener('pointerdown', onColResizeStart);
    contents.addEventListener('dblclick', onColAutoFit);

    const insp = $('inspector');
    insp.addEventListener('click', onInspectorClick);
    insp.addEventListener('input', onInspectorInput);
    insp.addEventListener('change', onInspectorChange);
    insp.addEventListener('keydown', onInspectorKey);

    document.querySelectorAll('[data-advance]').forEach((btn) => {
      btn.addEventListener('click', () => advance(Number(btn.dataset.advance), btn.textContent));
    });
    $('themeSel').addEventListener('change', (e) => {
      state.theme = e.target.value;
      applyTheme();
      save();
    });
    $('motionChk').addEventListener('change', (e) => {
      state.reduceMotion = e.target.checked;
      applyTheme();
      save();
    });
    $('resetBtn').addEventListener('click', onReset);
    $('newBucketBtn').addEventListener('click', openNewBucketSheet);
    $('sidebarToggle').addEventListener('click', () => {
      ui.sidebarOpen = !ui.sidebarOpen;
      applyLayout();
    });
    $('inspectorToggle').addEventListener('click', () => {
      ui.inspectorOpen = !ui.inspectorOpen;
      applyLayout();
    });
    $('scrim').addEventListener('click', () => {
      if (isOverlay('sidebar')) ui.sidebarOpen = false;
      if (isOverlay('inspector')) ui.inspectorOpen = false;
      applyLayout();
    });
    document.querySelectorAll('.divider').forEach(setupDivider);
    document.addEventListener('keydown', onGlobalKey);
    window.addEventListener('resize', onResize);
  }

  function init() {
    applyTheme();
    wire();
    renderAll();
  }

  /** Test hook for the automated smoke test. Not part of the product. */
  window.__bucketsPrototype = {
    get state() {
      return state;
    },
    doDraw,
    doDone,
    doToss,
    requestToss,
    advance,
    selectBucket,
    addItems,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

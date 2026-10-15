'use strict';
/* TUTRELLO — tableros kanban locales con la identidad de Tuimagen Studio. */

const STORE_KEY = 'tutrello:v1';
const BACKGROUNDS = [
  { id: 'space', name: 'Deep Space' }, { id: 'navy', name: 'Dark Navy' },
  { id: 'cyan', name: 'Neon Cyan' }, { id: 'violet', name: 'Electric Violet' },
  { id: 'green', name: 'Neon Green' }, { id: 'aurora', name: 'Aurora' },
  { id: 'grid', name: 'Retícula HUD' }, { id: 'ember', name: 'Brasa' }
];
const COLORS = {
  cyan: '#00e0ff', green: '#00ff88', violet: '#a855f7', amber: '#ffb547', rose: '#ff5c8a',
  sky: '#7cc4ff', mint: '#7dffc4', lilac: '#d3a8ff', muted: '#8ba3cc', white: '#e8f4ff'
};
const DEFAULT_LABELS = [
  { color: 'cyan', name: 'Estrategia' }, { color: 'green', name: 'Listo' },
  { color: 'violet', name: 'Creativo' }, { color: 'amber', name: 'Prioridad' },
  { color: 'rose', name: 'Urgente' }, { color: 'muted', name: '' }
];

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const now = () => new Date().toISOString();

/* ---------- Estado ---------- */
const Cloud = window.TutrelloCloud;
let user = null;
let state = { boards: [], recent: [] };
let ready = false;
let route = { view: 'home', boardId: null, filter: 'all' };
let labelFilter = null;
let openCardId = null;

function ownerFields() {
  return { ownerId: user.uid, ownerEmail: user.email, memberEmails: [user.email], names: { [user.email]: user.name } };
}
function initials(name) { return String(name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''); }
function nameFor(b, email) { return b?.names?.[email] || email.split('@')[0]; }
function avatarColor(email) {
  const palette = [COLORS.violet, COLORS.cyan, COLORS.green, COLORS.amber, COLORS.rose, COLORS.lilac, COLORS.sky, COLORS.mint];
  let h = 0; for (const ch of String(email)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function seed() {
  const labels = DEFAULT_LABELS.map(l => ({ id: uid(), ...l }));
  const card = (title, extra = {}) => ({ id: uid(), title, desc: '', labels: [], due: null, dueDone: false, checklist: [], comments: [], cover: null, archived: false, createdAt: now(), ...extra });
  const board = {
    id: uid(), title: 'Bienvenida a TUTRELLO', bg: 'space', starred: false, createdAt: now(), labels, archivedLists: [],
    lists: [
      { id: uid(), title: 'Ideas', cards: [
        card('Arrastra esta tarjeta a otra lista', { labels: [labels[2].id] }),
        card('Haz clic en una tarjeta para ver detalles, checklist y comentarios', { labels: [labels[0].id], desc: 'Las tarjetas guardan descripción, etiquetas, fecha límite, checklist, portada y comentarios.\n\nUsa «Compartir» para invitar a tu equipo o tu familia.' })
      ] },
      { id: uid(), title: 'Por hacer', cards: [
        card('Planificar contenido de la semana', { labels: [labels[3].id], due: addDays(2), checklist: [
          { id: uid(), text: 'Definir pilares', done: true }, { id: uid(), text: 'Escribir guiones', done: false }, { id: uid(), text: 'Diseñar piezas', done: false }
        ] }),
        card('Crear un tablero nuevo para cada proyecto', { cover: 'violet' })
      ] },
      { id: uid(), title: 'En proceso', cards: [card('Revisar el Brand Kit', { labels: [labels[2].id, labels[0].id] })] },
      { id: uid(), title: 'Hecho', cards: [card('Instalar TUTRELLO', { labels: [labels[1].id], due: addDays(0), dueDone: true })] }
    ]
  };
  Object.assign(board, ownerFields());
  return board;
}
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

/* Tableros guardados por la versión 1.0 (solo local), para ofrecer subirlos a la nube. */
function localLegacy() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return data && Array.isArray(data.boards) && data.boards.length ? normalize(data) : null;
  } catch { return null; }
}
/* Prepara tableros importados (copia local o JSON) como tableros nuevos de este usuario. */
function adoptBoards(boards) {
  return boards.map(b => {
    const copy = JSON.parse(JSON.stringify(b));
    copy.id = uid(); copy.starred = false; copy.createdAt = copy.createdAt || now();
    Object.assign(copy, ownerFields());
    for (const l of [...copy.lists, ...copy.archivedLists]) { l.id = uid(); for (const c of l.cards) c.id = uid(); }
    return copy;
  });
}
function normalize(data) {
  data.recent = Array.isArray(data.recent) ? data.recent : [];
  for (const b of data.boards) {
    b.labels = Array.isArray(b.labels) ? b.labels : DEFAULT_LABELS.map(l => ({ id: uid(), ...l }));
    b.archivedLists = Array.isArray(b.archivedLists) ? b.archivedLists : [];
    b.lists = Array.isArray(b.lists) ? b.lists : [];
    for (const l of [...b.lists, ...b.archivedLists]) {
      l.cards = Array.isArray(l.cards) ? l.cards : [];
      for (const c of l.cards) {
        c.labels ||= []; c.checklist ||= []; c.comments ||= []; c.desc ||= '';
      }
    }
  }
  return data;
}
function save() {
  if (user) localStorage.setItem(`tutrello:recent:${user.uid}`, JSON.stringify(state.recent));
  Cloud.sync(state.boards).catch(err => {
    console.error(err);
    toast(err?.code === 'permission-denied' ? 'No tienes permiso para ese cambio en este tablero.' : 'No se pudo guardar. Revisa tu conexión.');
  });
}
function commit() { save(); render(); }

const STATUS_TEXT = { synced: 'SINCRONIZADO', saving: 'GUARDANDO', offline: 'SIN CONEXIÓN', error: 'ERROR' };
function setStatus(kind) {
  const el = $('#save-status');
  el.dataset.state = kind;
  el.lastChild.textContent = STATUS_TEXT[kind] || kind;
}

/* Cambios que llegan de la nube (de otros miembros o el eco de los propios). */
let pendingRemote = null;
function isEditing() {
  const a = document.activeElement;
  return a && a !== document.body && a.id !== 'search' && a.matches('input,textarea,select') && !!a.closest('#view,#modal-root,#popover-root');
}
const stableJSON = v => JSON.stringify(v, (_k, val) => (val && typeof val === 'object' && !Array.isArray(val))
  ? Object.keys(val).sort().reduce((o, k) => { o[k] = val[k]; return o; }, {}) : val);
// Mientras hay un menú o un diálogo corto abierto, sus acciones apuntan a los objetos actuales: no reemplazarlos.
const isBusy = () => isEditing() || !!drag || !!$('#popover-root').innerHTML || (!!$('#modal-root').innerHTML && !openCardId);
function flushRemote() { setTimeout(() => { if (pendingRemote && ready && !isBusy()) applyRemote(Cloud.latest()); }, 0); }
function applyRemote(boards) {
  if (ready && isBusy()) { pendingRemote = boards; return; }
  pendingRemote = null;
  const firstLoad = !ready;
  ready = true;
  Cloud.acknowledge(boards);
  if (!firstLoad && stableJSON(boards) === stableJSON(state.boards)) return;
  state.boards = JSON.parse(JSON.stringify(boards));
  if (route.view === 'board' && !board()) { route = { view: 'home', boardId: null, filter: 'all' }; closeModal(); toast('Ese tablero ya no está disponible.'); }
  if (openCardId && !findCard(openCardId)) closeModal();
  if (firstLoad) onFirstLoad();
  render();
}
document.addEventListener('focusout', flushRemote);

function onFirstLoad() {
  const seededKey = `tutrello:seeded:${user.uid}`;
  const legacy = localLegacy();
  if (legacy && !localStorage.getItem('tutrello:migrated')) {
    setTimeout(() => migrateModal(legacy), 50);
  } else if (!state.boards.length && !localStorage.getItem(seededKey)) {
    localStorage.setItem(seededKey, '1');
    state.boards.push(seed()); save();
  }
}

const board = () => state.boards.find(b => b.id === route.boardId);
function findCard(cardId, b = board()) {
  if (!b) return null;
  for (const list of b.lists) {
    const idx = list.cards.findIndex(c => c.id === cardId);
    if (idx > -1) return { list, card: list.cards[idx], idx };
  }
  return null;
}

/* ---------- Navegación ---------- */
function openBoard(id) {
  route = { view: 'board', boardId: id, filter: route.filter };
  labelFilter = null;
  state.recent = [id, ...state.recent.filter(x => x !== id)].slice(0, 6);
  const b = board();
  if (b && b.names?.[user.email] !== user.name) b.names = { ...(b.names || {}), [user.email]: user.name };
  save(); render();
}
function goHome(filter = 'all') { route = { view: 'home', boardId: null, filter }; closeModal(); render(); }

function render() {
  closePopover();
  const view = $('#view');
  document.body.classList.toggle('signed-out', !user || !user.verified || !access?.allowed);
  if (!user) return renderAuth(view);
  if (!user.verified) return renderVerify(view);
  if (access && !access.allowed) return renderNoAccess(view);
  if (!ready) { view.innerHTML = `<div class="center-screen"><span class="hud"><b>TUTRELLO</b> // CONECTANDO…</span></div>`; return; }
  renderUserButton();
  $('#nav-boards').classList.toggle('active', route.view === 'home' && route.filter === 'all');
  $('#nav-starred').classList.toggle('active', route.view === 'home' && route.filter === 'starred');
  if (route.view === 'board' && board()) renderBoard(view); else renderHome(view);
  if (openCardId) renderCardModal();
  document.title = route.view === 'board' && board() ? `${board().title} · TUTRELLO` : 'TUTRELLO';
}

/* ---------- Inicio ---------- */
function tile(b) {
  const count = b.lists.reduce((n, l) => n + l.cards.filter(c => !c.archived).length, 0);
  return `<div class="board-tile bg-${esc(b.bg)}" role="button" tabindex="0" data-open-board="${b.id}">
    <span class="t">${esc(b.title)}</span>
    <span class="hud meta"><b>${b.lists.length}</b> LISTAS // ${count} TARJETAS${b.memberEmails.length > 1 ? ` · <b>${b.memberEmails.length}</b> MIEMBROS` : ''}</span>
    <button class="star ${b.starred ? 'on' : ''}" data-star="${b.id}" title="${b.starred ? 'Quitar de destacados' : 'Destacar'}">${b.starred ? '★' : '☆'}</button>
  </div>`;
}
function renderHome(view) {
  const starred = state.boards.filter(b => b.starred);
  const recent = state.recent.map(id => state.boards.find(b => b.id === id)).filter(Boolean);
  const shared = state.boards.filter(b => b.ownerId !== user.uid);
  const onlyStarred = route.filter === 'starred';
  view.innerHTML = `<div class="home">
    <aside class="sidebar">
      <span class="hud">ESPACIO // ${esc(user.name)}</span>
      <button class="side-link ${!onlyStarred ? 'active' : ''}" data-nav="all">▦ Tableros</button>
      <button class="side-link ${onlyStarred ? 'active' : ''}" data-nav="starred">★ Destacados</button>
      <span class="hud">TUS TABLEROS</span>
      ${state.boards.map(b => `<button class="side-link" data-open-board="${b.id}"><span class="sw bg-${esc(b.bg)}"></span>${esc(b.title)}${b.memberEmails.length > 1 ? ' <span class="hud" style="margin-left:auto">⚇</span>' : ''}</button>`).join('')}
      <div class="side-note"><span class="hud"><b>TUIMAGEN</b> // EQUIPO</span><p>Ideas claras,<br>proyectos <span>compartidos</span>.</p></div>
    </aside>
    <section class="home-main">
      <div class="home-hero">
        <span class="hud"><b>TUTRELLO</b> // ${state.boards.length} TABLEROS · EN LA NUBE</span>
        <h1>Hola, ${esc(user.name.split(' ')[0])}<span>.</span></h1>
        <p>Tableros para mover tus proyectos de la idea al resultado, con tu equipo y tu familia, en tiempo real.</p>
      </div>
      ${!onlyStarred && recent.length ? `<div class="section-title"><h2>Vistos recientemente</h2><span class="hud">RECIENTES</span></div>
        <div class="board-grid">${recent.map(tile).join('')}</div>` : ''}
      ${starred.length ? `<div class="section-title"><h2>Tableros destacados</h2><span class="hud" style="color:var(--amber)">★ DESTACADOS</span></div>
        <div class="board-grid">${starred.map(tile).join('')}</div>` : (onlyStarred ? `<div class="empty-state">Aún no destacas tableros. Usa ☆ en un tablero para tenerlo siempre a mano.</div>` : '')}
      ${!onlyStarred ? `<div class="section-title"><h2>Tus tableros</h2><span class="hud">ESPACIO DE TRABAJO</span></div>
        <div class="board-grid">${state.boards.filter(b => b.ownerId === user.uid).map(tile).join('')}<button class="board-tile new" data-create-board>+ Crear tablero nuevo</button></div>
        ${shared.length ? `<div class="section-title"><h2>Compartidos contigo</h2><span class="hud" style="color:var(--violet)">⚇ INVITACIONES</span></div>
        <div class="board-grid">${shared.map(tile).join('')}</div>` : ''}` : ''}
    </section>
  </div>`;
}

/* ---------- Tablero ---------- */
function cardMatches(c) {
  if (c.archived) return false;
  if (labelFilter && !c.labels.includes(labelFilter)) return false;
  return true;
}
function dueInfo(c) {
  if (!c.due) return null;
  const d = new Date(c.due + 'T23:59:59');
  const diff = d - new Date();
  const label = new Date(c.due + 'T12:00:00').toLocaleDateString('es', { day: 'numeric', month: 'short' });
  if (c.dueDone) return { cls: 'done', label, state: 'Completado' };
  if (diff < 0) return { cls: 'late', label, state: 'Vencida' };
  if (diff < 864e5 * 1.5) return { cls: 'soon', label, state: 'Vence pronto' };
  return { cls: '', label, state: '' };
}
function cardHTML(c, b) {
  const labels = c.labels.map(id => b.labels.find(l => l.id === id)).filter(Boolean);
  const done = c.checklist.filter(i => i.done).length;
  const due = dueInfo(c);
  const expanded = localStorage.getItem('tutrello:labels-expanded') === '1';
  return `<div class="card" draggable="true" data-card="${c.id}" tabindex="0">
    ${c.cover ? `<div class="card-cover" style="background:${COLORS[c.cover] || c.cover}"></div>` : ''}
    ${labels.length ? `<div class="card-labels ${expanded ? 'expanded' : ''}" data-toggle-labels>${labels.map(l => `<span class="card-label" style="background:${COLORS[l.color]}" title="${esc(l.name)}">${expanded ? esc(l.name) : ''}</span>`).join('')}</div>` : ''}
    <div class="card-title">${esc(c.title)}</div>
    ${(due || c.desc || c.checklist.length || c.comments.length) ? `<div class="card-badges">
      ${due ? `<span class="badge-due ${due.cls}" title="${esc(due.state)}">◷ ${esc(due.label)}</span>` : ''}
      ${c.desc ? `<span title="Tiene descripción">≡</span>` : ''}
      ${c.comments.length ? `<span title="Comentarios">✎ ${c.comments.length}</span>` : ''}
      ${c.checklist.length ? `<span class="badge-check ${done === c.checklist.length ? 'done' : ''}" title="Checklist">☑ ${done}/${c.checklist.length}</span>` : ''}
    </div>` : ''}
  </div>`;
}
function renderBoard(view) {
  const b = board();
  const filterLabel = labelFilter && b.labels.find(l => l.id === labelFilter);
  view.innerHTML = `<div class="board bg-${esc(b.bg)}">
    <div class="board-header">
      <button class="board-title" id="board-title" title="Renombrar tablero">${esc(b.title)}</button>
      <button class="ghost icon star ${b.starred ? 'on' : ''}" data-star="${b.id}" title="Destacar">${b.starred ? '★' : '☆'}</button>
      <span class="hud"><b>TABLERO</b> // ${b.lists.length} LISTAS</span>
      <div class="spacer"></div>
      <div class="members">${b.memberEmails.slice(0, 6).map(e => `<span class="avatar sm" title="${esc(nameFor(b, e))} · ${esc(e)}" style="background:${avatarColor(e)}">${esc(initials(nameFor(b, e)))}</span>`).join('')}${b.memberEmails.length > 6 ? `<span class="avatar sm more">+${b.memberEmails.length - 6}</span>` : ''}</div>
      <button class="primary" id="share-btn">⚇ Compartir</button>
      ${filterLabel ? `<span class="filter-chip" style="color:${COLORS[filterLabel.color]}">FILTRO: ${esc(filterLabel.name || filterLabel.color)} <button data-clear-filter title="Quitar filtro">✕</button></span>` : ''}
      <button class="ghost" id="filter-btn">⧩ Filtrar</button>
      <button class="ghost" id="board-menu-btn">··· Menú</button>
    </div>
    <div class="lists" id="lists">
      ${b.lists.map(list => {
        const cards = list.cards.filter(cardMatches);
        return `<section class="list" data-list="${list.id}">
          <div class="list-header" draggable="true" data-list-handle="${list.id}">
            <h3 class="list-title" data-list-title="${list.id}" style="margin:0">${esc(list.title)}</h3>
            <span class="list-count">${cards.length}</span>
            <button class="list-menu-btn" data-list-menu="${list.id}" title="Acciones de la lista">···</button>
          </div>
          <div class="cards" data-drop="${list.id}">${cards.map(c => cardHTML(c, b)).join('')}</div>
          <div class="list-footer"><button class="add-card-btn" data-add-card="${list.id}">+ Añade una tarjeta</button></div>
        </section>`;
      }).join('')}
      <div class="add-list" id="add-list"><button id="add-list-btn">+ Añade otra lista</button></div>
    </div>
  </div>`;
}

/* ---------- Composers ---------- */
function openCardComposer(listId) {
  const footer = document.querySelector(`[data-list="${listId}"] .list-footer`);
  footer.innerHTML = `<div class="composer"><textarea placeholder="Introduce un título para esta tarjeta…" maxlength="500"></textarea>
    <div class="composer-actions"><button class="primary" data-ok>Añadir tarjeta</button><button class="ghost icon" data-cancel title="Cancelar">✕</button></div></div>`;
  const ta = $('textarea', footer);
  ta.focus();
  const submit = () => {
    const title = ta.value.trim();
    if (!title) return;
    const list = board().lists.find(l => l.id === listId);
    list.cards.push({ id: uid(), title, desc: '', labels: labelFilter ? [labelFilter] : [], due: null, dueDone: false, checklist: [], comments: [], cover: null, archived: false, createdAt: now() });
    save(); render(); openCardComposer(listId);
    const cards = document.querySelector(`[data-drop="${listId}"]`); cards.scrollTop = cards.scrollHeight;
  };
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') render();
  });
  $('[data-ok]', footer).onclick = submit;
  $('[data-cancel]', footer).onclick = () => render();
}
function openListComposer() {
  const box = $('#add-list');
  box.classList.add('open');
  box.innerHTML = `<input type="text" placeholder="Introduce el título de la lista…" maxlength="120">
    <div class="composer-actions"><button class="primary" data-ok>Añadir lista</button><button class="ghost icon" data-cancel title="Cancelar">✕</button></div>`;
  const input = $('input', box);
  input.focus();
  const submit = () => {
    const title = input.value.trim();
    if (!title) return;
    board().lists.push({ id: uid(), title, cards: [] });
    save(); render(); openListComposer();
    $('#lists').scrollLeft = $('#lists').scrollWidth;
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') render(); });
  $('[data-ok]', box).onclick = submit;
  $('[data-cancel]', box).onclick = () => render();
}
function inlineEdit(el, value, cls, onSave, multiline = false) {
  const input = document.createElement(multiline ? 'textarea' : 'input');
  if (!multiline) input.type = 'text';
  input.className = cls; input.value = value; input.maxLength = 200;
  el.replaceWith(input); input.focus(); input.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = input.value.trim();
    if (ok && v && v !== value) onSave(v);
    render();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

/* ---------- Arrastrar y soltar ---------- */
let drag = null; // { type: 'card'|'list', id, el }
let placeholder = null;

function makePlaceholder(type, height) {
  const el = document.createElement('div');
  el.className = type === 'card' ? 'placeholder' : 'list-placeholder';
  if (type === 'card') el.style.height = height + 'px';
  return el;
}
document.addEventListener('dragstart', e => {
  const cardEl = e.target.closest?.('[data-card]');
  const handle = e.target.closest?.('[data-list-handle]');
  if (cardEl) {
    drag = { type: 'card', id: cardEl.dataset.card, el: cardEl };
    placeholder = makePlaceholder('card', cardEl.offsetHeight);
  } else if (handle) {
    const listEl = handle.closest('[data-list]');
    drag = { type: 'list', id: listEl.dataset.list, el: listEl };
    placeholder = makePlaceholder('list');
  } else return;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', drag.id);
  requestAnimationFrame(() => drag && drag.el.classList.add('dragging'));
});
document.addEventListener('dragover', e => {
  if (!drag) return;
  if (drag.type === 'card') {
    const zone = e.target.closest?.('[data-list]');
    if (!zone) return;
    e.preventDefault();
    const cards = $('.cards', zone);
    const siblings = [...cards.querySelectorAll('[data-card]:not(.dragging)')];
    const after = siblings.find(s => { const r = s.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (after) cards.insertBefore(placeholder, after); else cards.appendChild(placeholder);
  } else {
    const lists = $('#lists');
    if (!lists || !lists.contains(e.target)) return;
    e.preventDefault();
    const siblings = [...lists.querySelectorAll('[data-list]:not(.dragging)')];
    const after = siblings.find(s => { const r = s.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
    lists.insertBefore(placeholder, after || $('#add-list'));
  }
});
document.addEventListener('drop', e => {
  if (!drag || !placeholder?.parentNode) return;
  e.preventDefault();
  const b = board();
  if (drag.type === 'card') {
    const targetListId = placeholder.parentNode.dataset.drop;
    const visibleBefore = [...placeholder.parentNode.children].slice(0, [...placeholder.parentNode.children].indexOf(placeholder))
      .filter(n => n.dataset?.card && n.dataset.card !== drag.id).map(n => n.dataset.card);
    const from = findCard(drag.id);
    const [moved] = from.list.cards.splice(from.idx, 1);
    const target = b.lists.find(l => l.id === targetListId);
    // Insertar después de la última tarjeta visible que la precede (respeta tarjetas ocultas por filtro/archivo).
    let index = 0;
    if (visibleBefore.length) index = target.cards.findIndex(c => c.id === visibleBefore[visibleBefore.length - 1]) + 1;
    target.cards.splice(index, 0, moved);
    if (from.list.id !== target.id) logActivity(moved, `movió esta tarjeta de «${from.list.title}» a «${target.title}»`);
  } else {
    const ids = [];
    for (const n of $('#lists').children) {
      if (n === placeholder) ids.push(drag.id);
      else if (n.dataset?.list && n.dataset.list !== drag.id) ids.push(n.dataset.list);
    }
    b.lists = ids.map(id => b.lists.find(l => l.id === id));
  }
  endDrag(); commit();
});
document.addEventListener('dragend', () => { if (drag) { endDrag(); render(); } });
function endDrag() {
  placeholder?.remove(); placeholder = null; drag = null;
  flushRemote();
}

function logActivity(card, text) {
  card.activity = card.activity || [];
  card.activity.unshift({ text, at: now(), by: user.email, byName: user.name });
  card.activity = card.activity.slice(0, 30);
}

/* ---------- Modal de tarjeta ---------- */
function openCard(id) { openCardId = id; renderCardModal(); }
function closeModal() { openCardId = null; $('#modal-root').innerHTML = ''; flushRemote(); }
function fmtDate(iso) { return new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }

function renderCardModal() {
  const b = board();
  const found = findCard(openCardId, b);
  if (!found) { closeModal(); return; }
  const { card: c, list } = found;
  const labels = c.labels.map(id => b.labels.find(l => l.id === id)).filter(Boolean);
  const done = c.checklist.filter(i => i.done).length;
  const pct = c.checklist.length ? Math.round(done / c.checklist.length * 100) : 0;
  const due = dueInfo(c);
  const root = $('#modal-root');
  const descFocused = document.activeElement?.id === 'desc-input';
  if (descFocused) return; // no interrumpir la escritura
  root.innerHTML = `<div class="modal-backdrop" data-backdrop>
    <div class="modal" role="dialog" aria-modal="true" aria-label="Detalle de tarjeta">
      ${c.cover ? `<div class="modal-cover" style="background:${COLORS[c.cover]}"></div>` : ''}
      <button class="modal-close" data-close title="Cerrar (Esc)">✕</button>
      <div class="modal-head">
        <textarea id="card-title" rows="1" maxlength="500">${esc(c.title)}</textarea>
        <div class="hud">EN LA LISTA <b>${esc(list.title)}</b>${c.archived ? ' // <span style="color:var(--amber)">ARCHIVADA</span>' : ''}</div>
      </div>
      <div class="modal-body">
        <div>
          ${labels.length || due ? `<div class="modal-section" style="display:flex;gap:28px;flex-wrap:wrap">
            ${labels.length ? `<div><div class="hud" style="margin-bottom:6px">ETIQUETAS</div><div class="chips">
              ${labels.map(l => `<span class="chip" style="background:${COLORS[l.color]}">${esc(l.name) || '&nbsp;'}</span>`).join('')}
              <button class="chip add" data-pop="labels" title="Editar etiquetas">+</button></div></div>` : ''}
            ${due ? `<div><div class="hud" style="margin-bottom:6px">FECHA LÍMITE</div><div class="due-row">
              <input type="checkbox" id="due-done" ${c.dueDone ? 'checked' : ''} title="Marcar como completada">
              <input type="date" id="due-input" value="${esc(c.due)}">
              ${due.state ? `<span class="due-state badge-due ${due.cls}">${esc(due.state)}</span>` : ''}</div></div>` : ''}
          </div>` : ''}
          <div class="modal-section">
            <h3>≡ Descripción</h3>
            <div id="desc-wrap">${c.desc ? `<div class="desc-view" id="desc-view">${esc(c.desc)}</div>` : `<div class="desc-view empty" id="desc-view">Añade una descripción más detallada…</div>`}</div>
          </div>
          ${c.checklist.length ? `<div class="modal-section">
            <h3>☑ Checklist <span class="grow"></span><button class="secondary" data-hide-done style="height:28px">${c.hideDone ? 'Mostrar marcados' : 'Ocultar marcados'}</button></h3>
            <div class="progress"><span class="pct">${pct}%</span><div class="bar"><i class="${pct === 100 ? 'full' : ''}" style="width:${pct}%"></i></div></div>
            ${c.checklist.filter(i => !(c.hideDone && i.done)).map(i => `<div class="check-item ${i.done ? 'done' : ''}">
              <input type="checkbox" data-check="${i.id}" ${i.done ? 'checked' : ''}><span data-edit-check="${i.id}">${esc(i.text)}</span><button class="x" data-del-check="${i.id}" title="Eliminar">✕</button></div>`).join('')}
            <form class="inline-form" id="check-form"><input type="text" id="check-input" placeholder="Añadir un elemento" maxlength="300"><button class="secondary">Añadir</button></form>
          </div>` : ''}
          <div class="modal-section">
            <h3>✎ Comentarios y actividad</h3>
            <form class="inline-form" id="comment-form" style="margin-top:0"><input type="text" id="comment-input" placeholder="Escribe un comentario…" maxlength="2000"><button class="primary">Guardar</button></form>
            ${c.comments.map(m => { const by = m.by || user.email; const who = m.byName || nameFor(b, by); return `<div class="comment"><span class="avatar" style="background:${avatarColor(by)}">${esc(initials(who))}</span><div class="bubble">
              <span class="hud"><b>${esc(who)}</b> // ${esc(fmtDate(m.at))}</span><div class="text">${esc(m.text)}</div>
              ${by === user.email ? `<button class="del" data-del-comment="${m.id}">Eliminar</button>` : ''}</div></div>`; }).join('')}
            ${(c.activity || []).slice(0, 8).map(a => `<div class="activity">· ${esc(a.by === user.email || !a.by ? 'Tú' : (a.byName || nameFor(b, a.by)))} ${esc(a.text)} — ${esc(fmtDate(a.at))}</div>`).join('')}
            <div class="activity">· Tarjeta creada — ${esc(fmtDate(c.createdAt || now()))}</div>
          </div>
        </div>
        <div class="side-actions">
          <span class="hud">AÑADIR A LA TARJETA</span>
          <button data-pop="labels">◆ Etiquetas</button>
          <button data-add-checklist>☑ Checklist</button>
          <button data-pop="due">◷ Fechas</button>
          <button data-pop="cover">▬ Portada</button>
          <span class="hud">ACCIONES</span>
          <button data-pop="move">→ Mover</button>
          <button data-copy-card>⧉ Copiar</button>
          ${c.archived
            ? `<button data-unarchive>↺ Restaurar</button><button class="warn" data-delete-card>✕ Eliminar</button>`
            : `<button data-archive>▤ Archivar</button>`}
        </div>
      </div>
    </div>
  </div>`;
  const title = $('#card-title');
  const autosize = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
  autosize();
  title.addEventListener('input', autosize);
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  title.addEventListener('blur', () => {
    const cur = findCard(c.id)?.card; const v = title.value.trim();
    if (cur && v && v !== cur.title) { cur.title = v; commit(); }
  });
}

function editDescription() {
  const { card: c } = findCard(openCardId);
  const wrap = $('#desc-wrap');
  wrap.innerHTML = `<textarea id="desc-input" rows="6" maxlength="10000" placeholder="Añade una descripción más detallada…">${esc(c.desc)}</textarea>
    <div class="composer-actions"><button class="primary" data-save-desc>Guardar</button><button class="ghost" data-cancel-desc>Cancelar</button></div>`;
  const ta = $('#desc-input'); ta.focus();
  ta.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); ta.blur(); renderCardModal(); } if (e.key === 'Enter' && e.ctrlKey) saveDesc(); });
}
function saveDesc() {
  const { card: c } = findCard(openCardId);
  c.desc = $('#desc-input').value.trim();
  document.activeElement?.blur();
  commit();
}

/* ---------- Popovers ---------- */
function closePopover() { if (!$('#popover-root').innerHTML) return; $('#popover-root').innerHTML = ''; flushRemote(); }
function popover(anchor, title, html, onMount) {
  closePopover();
  const root = $('#popover-root');
  root.innerHTML = `<div class="popover" role="dialog" aria-label="${esc(title)}"><div class="popover-head"><span class="hud">${esc(title)}</span><button data-close-pop title="Cerrar">✕</button></div>${html}</div>`;
  const pop = $('.popover', root);
  const r = anchor.getBoundingClientRect();
  let left = Math.min(r.left, innerWidth - 312);
  let top = r.bottom + 6;
  pop.style.left = Math.max(8, left) + 'px'; pop.style.top = top + 'px';
  requestAnimationFrame(() => { const h = pop.offsetHeight; if (top + h > innerHeight - 8) pop.style.top = Math.max(8, innerHeight - h - 8) + 'px'; });
  onMount?.(pop);
  return pop;
}

function labelsPopover(anchor, mode = 'card') {
  const b = board();
  const card = mode === 'card' ? findCard(openCardId).card : null;
  const html = `${b.labels.map(l => `<div class="label-row">
      ${mode === 'card' ? `<input type="checkbox" data-toggle-label="${l.id}" ${card.labels.includes(l.id) ? 'checked' : ''}>` : ''}
      <button class="sw" style="background:${COLORS[l.color]}" data-pick-label="${l.id}">${esc(l.name) || '&nbsp;'}</button>
      <button class="edit" data-edit-label="${l.id}" title="Editar etiqueta">✎</button></div>`).join('')}
    ${mode === 'filter' && labelFilter ? `<div class="pop-sep"></div><button class="pop-item" data-clear-filter>Quitar filtro</button>` : ''}
    <div class="pop-sep"></div><button class="secondary full" data-new-label>+ Crear una etiqueta nueva</button>`;
  popover(anchor, mode === 'card' ? 'Etiquetas' : 'Filtrar por etiqueta', html, pop => {
    pop.addEventListener('click', e => {
      const t = e.target.closest('button,input');
      if (!t) return;
      if (t.dataset.toggleLabel || (t.dataset.pickLabel && mode === 'card')) {
        const id = t.dataset.toggleLabel || t.dataset.pickLabel;
        card.labels = card.labels.includes(id) ? card.labels.filter(x => x !== id) : [...card.labels, id];
        save(); render(); renderCardModal(); labelsPopover(document.querySelector('[data-pop="labels"]') || anchor, mode);
      } else if (t.dataset.pickLabel && mode === 'filter') {
        labelFilter = labelFilter === t.dataset.pickLabel ? null : t.dataset.pickLabel; render();
      } else if (t.dataset.editLabel) editLabelPopover(anchor, b.labels.find(l => l.id === t.dataset.editLabel), mode);
      else if ('newLabel' in t.dataset) editLabelPopover(anchor, null, mode);
      else if ('clearFilter' in t.dataset) { labelFilter = null; render(); }
    });
  });
}
function editLabelPopover(anchor, label, mode) {
  let color = label?.color || 'cyan';
  const html = `<label class="hud">TÍTULO</label><input type="text" id="label-name" maxlength="40" value="${esc(label?.name || '')}">
    <label class="hud">COLOR</label><div class="color-grid">${Object.entries(COLORS).map(([k, v]) => `<button style="background:${v}" data-color="${k}" class="${k === color ? 'sel' : ''}" title="${k}"></button>`).join('')}</div>
    <div class="row"><button class="primary" data-save-label>${label ? 'Guardar' : 'Crear'}</button>${label ? `<span class="spacer"></span><button class="danger" data-del-label>Eliminar</button>` : ''}</div>`;
  popover(anchor, label ? 'Editar etiqueta' : 'Crear etiqueta', html, pop => {
    $('#label-name', pop).focus();
    pop.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const b = board();
      if (t.dataset.color) { color = t.dataset.color; pop.querySelectorAll('[data-color]').forEach(x => x.classList.toggle('sel', x === t)); }
      if ('saveLabel' in t.dataset) {
        const name = $('#label-name', pop).value.trim();
        if (label) Object.assign(label, { name, color }); else b.labels.push({ id: uid(), name, color });
        save(); render(); labelsPopover(document.querySelector('[data-pop="labels"]') || $('#filter-btn') || anchor, mode);
      }
      if ('delLabel' in t.dataset) {
        b.labels = b.labels.filter(l => l !== label);
        for (const l of b.lists) for (const c of l.cards) c.labels = c.labels.filter(id => id !== label.id);
        if (labelFilter === label.id) labelFilter = null;
        save(); render(); labelsPopover(document.querySelector('[data-pop="labels"]') || $('#filter-btn') || anchor, mode);
      }
    });
  });
}
function duePopover(anchor) {
  const { card: c } = findCard(openCardId);
  const html = `<label class="hud">FECHA LÍMITE</label><input type="date" id="pop-due" value="${esc(c.due || addDays(1))}">
    <div class="row"><button class="primary" data-save-due>Guardar</button>${c.due ? '<button class="secondary" data-remove-due>Quitar</button>' : ''}</div>`;
  popover(anchor, 'Fechas', html, pop => {
    pop.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      if ('saveDue' in t.dataset) { c.due = $('#pop-due', pop).value || null; c.dueDone = false; commit(); }
      if ('removeDue' in t.dataset) { c.due = null; c.dueDone = false; commit(); }
    });
  });
}
function coverPopover(anchor) {
  const { card: c } = findCard(openCardId);
  const html = `<div class="color-grid">${Object.entries(COLORS).map(([k, v]) => `<button style="background:${v}" data-cover="${k}" class="${c.cover === k ? 'sel' : ''}" title="${k}"></button>`).join('')}</div>
    ${c.cover ? '<button class="secondary full" data-cover="">Quitar portada</button>' : ''}`;
  popover(anchor, 'Portada', html, pop => pop.addEventListener('click', e => {
    const t = e.target.closest('[data-cover]'); if (!t) return;
    c.cover = t.dataset.cover || null; commit();
  }));
}
function movePopover(anchor, cardId = openCardId) {
  const current = findCard(cardId);
  const html = `<label class="hud">TABLERO</label><select id="mv-board">${state.boards.map(b => `<option value="${b.id}" ${b.id === route.boardId ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select>
    <label class="hud">LISTA</label><select id="mv-list"></select>
    <label class="hud">POSICIÓN</label><select id="mv-pos"></select>
    <div class="row"><button class="primary" data-do-move>Mover</button></div>`;
  popover(anchor, 'Mover tarjeta', html, pop => {
    const bSel = $('#mv-board', pop), lSel = $('#mv-list', pop), pSel = $('#mv-pos', pop);
    const fillLists = () => {
      const b = state.boards.find(x => x.id === bSel.value);
      lSel.innerHTML = b.lists.map(l => `<option value="${l.id}" ${l.id === current.list.id ? 'selected' : ''}>${esc(l.title)}</option>`).join('');
      fillPos();
    };
    const fillPos = () => {
      const b = state.boards.find(x => x.id === bSel.value);
      const l = b.lists.find(x => x.id === lSel.value);
      const n = l ? l.cards.filter(c => c.id !== cardId).length + 1 : 1;
      const cur = l && l.id === current.list.id ? current.idx : n - 1;
      pSel.innerHTML = Array.from({ length: n }, (_, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${i + 1}</option>`).join('');
    };
    bSel.onchange = fillLists; lSel.onchange = fillPos; fillLists();
    $('[data-do-move]', pop).onclick = () => {
      const b = state.boards.find(x => x.id === bSel.value);
      const target = b.lists.find(x => x.id === lSel.value);
      if (!target) return;
      const [moved] = current.list.cards.splice(current.idx, 1);
      if (b.id !== route.boardId) moved.labels = []; // las etiquetas pertenecen a cada tablero
      target.cards.splice(Number(pSel.value), 0, moved);
      if (target.id !== current.list.id) logActivity(moved, `movió esta tarjeta a «${target.title}»`);
      if (b.id !== route.boardId) { closeModal(); toast(`Tarjeta movida a «${b.title}»`); }
      commit();
    };
  });
}
function listMenu(anchor, listId) {
  const b = board();
  const list = b.lists.find(l => l.id === listId);
  const html = `<button class="pop-item" data-a="add">Añadir tarjeta</button>
    <button class="pop-item" data-a="copy">Copiar lista</button>
    <button class="pop-item" data-a="sort-title">Ordenar por nombre</button>
    <button class="pop-item" data-a="sort-due">Ordenar por fecha límite</button>
    <div class="pop-sep"></div>
    <button class="pop-item" data-a="archive-cards">Archivar todas las tarjetas</button>
    <button class="pop-item" data-a="archive">Archivar esta lista</button>
    <button class="pop-item warn" data-a="delete">Eliminar lista</button>`;
  popover(anchor, 'Acciones de la lista', html, pop => pop.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'add') { closePopover(); openCardComposer(listId); return; }
    if (a === 'copy') { const copy = JSON.parse(JSON.stringify(list)); copy.id = uid(); copy.title += ' (copia)'; copy.cards.forEach(c => c.id = uid()); b.lists.splice(b.lists.indexOf(list) + 1, 0, copy); }
    if (a === 'sort-title') list.cards.sort((x, y) => x.title.localeCompare(y.title, 'es'));
    if (a === 'sort-due') list.cards.sort((x, y) => (x.due || '9999').localeCompare(y.due || '9999'));
    if (a === 'archive-cards') list.cards.forEach(c => c.archived = true);
    if (a === 'archive') { b.lists = b.lists.filter(l => l !== list); b.archivedLists.push(list); const lid = list.id; toast('Lista archivada', () => { const cb = board(); const l = cb?.archivedLists.find(x => x.id === lid); if (l) { cb.archivedLists = cb.archivedLists.filter(x => x !== l); cb.lists.push(l); commit(); } }); }
    if (a === 'delete') { if (!confirm(`¿Eliminar la lista «${list.title}» y sus ${list.cards.length} tarjetas? No se puede deshacer.`)) return; b.lists = b.lists.filter(l => l !== list); }
    commit();
  }));
}
function boardMenu(anchor) {
  const b = board();
  const html = `<label class="hud">FONDO</label><div class="color-grid" style="grid-template-columns:repeat(4,1fr)">${BACKGROUNDS.map(bg => `<button class="bg-${bg.id} ${b.bg === bg.id ? 'sel' : ''}" data-bg="${bg.id}" title="${bg.name}" style="height:40px"></button>`).join('')}</div>
    <button class="pop-item" data-a="labels">Etiquetas del tablero</button>
    <button class="pop-item" data-a="archived">Elementos archivados</button>
    <button class="pop-item" data-a="expand">${localStorage.getItem('tutrello:labels-expanded') === '1' ? 'Etiquetas compactas' : 'Mostrar nombres de etiquetas'}</button>
    <button class="pop-item" data-a="copy">Copiar tablero</button>
    <div class="pop-sep"></div>
    ${b.ownerId === user.uid
      ? '<button class="pop-item warn" data-a="delete">Eliminar tablero</button>'
      : '<button class="pop-item warn" data-a="leave">Salir del tablero</button>'}`;
  popover(anchor, 'Menú del tablero', html, pop => pop.addEventListener('click', e => {
    const bg = e.target.closest('[data-bg]')?.dataset.bg;
    if (bg) { b.bg = bg; commit(); boardMenu($('#board-menu-btn')); return; }
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
    if (a === 'labels') return labelsPopover(anchor, 'filter');
    if (a === 'archived') return archivedModal();
    if (a === 'expand') { localStorage.setItem('tutrello:labels-expanded', localStorage.getItem('tutrello:labels-expanded') === '1' ? '0' : '1'); return render(); }
    if (a === 'copy') {
      const [copy] = adoptBoards([b]); copy.title += ' (copia)';
      state.boards.push(copy); save(); openBoard(copy.id); toast('Tablero copiado (solo tú eres miembro de la copia)'); return;
    }
    if (a === 'leave') {
      if (!confirm(`¿Salir de «${b.title}»? Dejarás de verlo hasta que alguien vuelva a invitarte.`)) return;
      Cloud.leaveBoard(b.id).then(() => toast('Saliste del tablero')).catch(() => toast('No se pudo salir del tablero.'));
      goHome(); return;
    }
    if (a === 'delete') {
      if (!confirm(`¿Eliminar el tablero «${b.title}»? Se perderán todas sus listas y tarjetas.`)) return;
      state.boards = state.boards.filter(x => x !== b); state.recent = state.recent.filter(id => id !== b.id);
      save(); goHome();
    }
  }));
}

/* ---------- Modales simples ---------- */
function simpleModal(html, onMount) {
  closeModal();
  $('#modal-root').innerHTML = `<div class="modal-backdrop" data-backdrop><div class="modal small" role="dialog" aria-modal="true"><button class="modal-close" data-close title="Cerrar">✕</button><div class="modal-pad">${html}</div></div></div>`;
  onMount?.($('#modal-root .modal'));
}
function createBoardModal() {
  let bg = 'space';
  simpleModal(`<span class="hud"><b>NUEVO</b> // TABLERO</span><h2>Crear tablero</h2>
    <div class="preview bg-space" id="bg-preview"><i></i><i></i><i></i></div>
    <div class="field"><label class="hud">FONDO</label><div class="bg-picker">${BACKGROUNDS.map(b => `<button class="bg-${b.id} ${b.id === bg ? 'sel' : ''}" data-bg="${b.id}" title="${b.name}"></button>`).join('')}</div></div>
    <div class="field"><label class="hud" for="nb-title">TÍTULO DEL TABLERO *</label><input type="text" id="nb-title" maxlength="120" placeholder="Ej.: Lanzamiento de marca"></div>
    <div class="field"><label class="hud" for="nb-template">PLANTILLA</label><select id="nb-template">
      <option value="kanban">Kanban — Por hacer · En proceso · Hecho</option>
      <option value="content">Contenido — Ideas · Guion · Diseño · Programado · Publicado</option>
      <option value="client">Cliente — Brief · Propuesta · Producción · Revisión · Entregado</option>
      <option value="empty">Vacío</option></select></div>
    <button class="primary" id="nb-create" style="width:100%;justify-content:center">Crear</button>`, m => {
    $('#nb-title', m).focus();
    m.addEventListener('click', e => {
      const t = e.target.closest('[data-bg]'); if (!t) return;
      bg = t.dataset.bg; m.querySelectorAll('[data-bg]').forEach(x => x.classList.toggle('sel', x === t));
      $('#bg-preview', m).className = `preview bg-${bg}`;
    });
    const create = () => {
      const title = $('#nb-title', m).value.trim();
      if (!title) { $('#nb-title', m).focus(); return; }
      const templates = {
        kanban: ['Por hacer', 'En proceso', 'Hecho'],
        content: ['Ideas', 'Guion', 'Diseño', 'Programado', 'Publicado'],
        client: ['Brief', 'Propuesta', 'Producción', 'Revisión', 'Entregado'], empty: []
      };
      const b = { id: uid(), title, bg, starred: false, createdAt: now(), labels: DEFAULT_LABELS.map(l => ({ id: uid(), ...l })), archivedLists: [],
        lists: templates[$('#nb-template', m).value].map(t => ({ id: uid(), title: t, cards: [] })), ...ownerFields() };
      state.boards.push(b); closeModal(); openBoard(b.id);
    };
    $('#nb-create', m).onclick = create;
    $('#nb-title', m).addEventListener('keydown', e => { if (e.key === 'Enter') create(); });
  });
}
function archivedModal() {
  const b = board();
  const cards = b.lists.flatMap(l => l.cards.filter(c => c.archived).map(c => ({ c, l })));
  simpleModal(`<span class="hud"><b>ARCHIVO</b> // ${esc(b.title)}</span><h2>Elementos archivados</h2>
    <div class="hud" style="margin-bottom:8px">TARJETAS (${cards.length})</div>
    ${cards.length ? cards.map(({ c, l }) => `<div class="archived-row"><span>${esc(c.title)} <span class="hud">// ${esc(l.title)}</span></span>
      <button class="secondary" data-restore-card="${c.id}">Restaurar</button><button class="danger" data-purge-card="${c.id}">Eliminar</button></div>`).join('') : '<div class="activity">No hay tarjetas archivadas.</div>'}
    <div class="hud" style="margin:16px 0 8px">LISTAS (${b.archivedLists.length})</div>
    ${b.archivedLists.length ? b.archivedLists.map(l => `<div class="archived-row"><span>${esc(l.title)} <span class="hud">// ${l.cards.length} TARJETAS</span></span>
      <button class="secondary" data-restore-list="${l.id}">Restaurar</button><button class="danger" data-purge-list="${l.id}">Eliminar</button></div>`).join('') : '<div class="activity">No hay listas archivadas.</div>'}`, m => {
    m.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.restoreCard) findCard(d.restoreCard).card.archived = false;
      else if (d.purgeCard) { const f = findCard(d.purgeCard); f.list.cards.splice(f.idx, 1); }
      else if (d.restoreList) { const l = b.archivedLists.find(x => x.id === d.restoreList); b.archivedLists = b.archivedLists.filter(x => x !== l); b.lists.push(l); }
      else if (d.purgeList) { if (!confirm('¿Eliminar esta lista para siempre?')) return; b.archivedLists = b.archivedLists.filter(x => x.id !== d.purgeList); }
      else return;
      save(); render(); archivedModal();
    });
  });
}
function dataModal() {
  const legacy = localLegacy();
  simpleModal(`<span class="hud"><b>DATOS</b> // COPIA DE SEGURIDAD</span><h2>Tus datos</h2>
    <p class="activity" style="font-size:14px;margin:0 0 16px">Tus tableros se guardan en la nube y se sincronizan en todos tus dispositivos. Puedes descargar una copia JSON como respaldo extra.</p>
    <div class="side-actions">
      <button id="export-json">⇩ Descargar copia (JSON)</button>
      <button id="import-json">⇧ Importar tableros desde una copia</button>
      ${legacy ? `<button id="migrate-local">☁ Subir tableros de la versión local (${legacy.boards.length})</button>` : ''}
    </div>`, m => {
    if (legacy) $('#migrate-local', m).onclick = () => migrateModal(legacy);
    $('#export-json', m).onclick = () => {
      const blob = new Blob([JSON.stringify({ version: 2, exportedAt: now(), boards: state.boards }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `tutrello-copia-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    $('#import-json', m).onclick = () => $('#import-file').click();
  });
}
function migrateModal(legacy) {
  simpleModal(`<span class="hud"><b>NUBE</b> // MIGRACIÓN</span><h2>Sube tus tableros locales</h2>
    <p class="activity" style="font-size:14px;margin:0 0 16px">Encontramos ${legacy.boards.length} tablero(s) de la versión anterior guardados solo en este PC: ${legacy.boards.map(b => `<b style="color:var(--soft-white)">${esc(b.title)}</b>`).join(', ')}. ¿Los subimos a tu cuenta para poder compartirlos?</p>
    <div class="composer-actions"><button class="primary" id="mg-yes">☁ Subir a la nube</button><button class="ghost" id="mg-no">Ahora no</button></div>`, m => {
    $('#mg-yes', m).onclick = () => {
      state.boards.push(...adoptBoards(legacy.boards));
      localStorage.setItem('tutrello:migrated', '1');
      localStorage.setItem(`tutrello:seeded:${user.uid}`, '1');
      closeModal(); commit(); toast('Tableros subidos a la nube');
    };
    $('#mg-no', m).onclick = () => {
      localStorage.setItem('tutrello:migrated', '1');
      closeModal();
      if (!state.boards.length) { localStorage.setItem(`tutrello:seeded:${user.uid}`, '1'); state.boards.push(seed()); commit(); }
      toast('Puedes subirlos cuando quieras desde ⇅ Datos');
    };
  });
}

/* ---------- Compartir ---------- */
function shareModal() {
  const b = board();
  const isOwner = b.ownerId === user.uid;
  const inviteText = `Te invité al tablero «${b.title}» en TUTRELLO.\n\n1. Abre la app (web o Windows).\n2. Crea tu cuenta con este mismo email y verifícalo.\n3. El tablero aparecerá en «Compartidos contigo».`;
  simpleModal(`<span class="hud"><b>COMPARTIR</b> // ${esc(b.title)}</span><h2>Miembros del tablero</h2>
    <form class="inline-form" id="invite-form" style="margin:0 0 6px"><input type="text" id="invite-email" placeholder="email@ejemplo.com" autocomplete="off" inputmode="email"><button class="primary">Invitar</button></form>
    <p class="activity" style="margin:0 0 18px">La persona verá el tablero en cuanto entre a TUTRELLO con ese email.</p>
    <div class="hud" style="margin-bottom:8px">MIEMBROS (${b.memberEmails.length})</div>
    ${b.memberEmails.map(e => `<div class="archived-row">
      <span class="avatar sm" style="background:${avatarColor(e)}">${esc(initials(nameFor(b, e)))}</span>
      <span>${esc(nameFor(b, e))}${e === user.email ? ' (tú)' : ''}<br><span class="hud" style="text-transform:none;letter-spacing:0">${esc(e)}</span></span>
      ${e === b.ownerEmail ? '<span class="hud"><b>DUEÑO</b></span>' : (isOwner ? `<button class="danger" data-remove-member="${esc(e)}">Quitar</button>` : '')}
    </div>`).join('')}
    <button class="secondary" id="copy-invite" style="margin-top:12px">⧉ Copiar mensaje de invitación</button>`, m => {
    $('#invite-email', m).focus();
    $('#invite-form', m).addEventListener('submit', e => {
      e.preventDefault(); e.stopPropagation();
      const email = $('#invite-email', m).value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Escribe un email válido.'); return; }
      if (b.memberEmails.includes(email)) { toast('Esa persona ya es miembro.'); return; }
      if (b.memberEmails.length >= 50) { toast('Máximo 50 miembros por tablero.'); return; }
      b.memberEmails = [...b.memberEmails, email];
      commit(); shareModal();
      // La administradora da acceso a la app al invitar; otros miembros reciben un aviso si falta.
      if (access?.admin) Cloud.allowEmail(email).then(() => toast(`Invitaste a ${email} y le diste acceso a TUTRELLO`)).catch(() => toast(`Invitaste a ${email}, pero no se pudo darle acceso.`));
      else Cloud.getAllowed().then(list => toast(list.includes(email) ? `Invitaste a ${email}` : `Invitaste a ${email}. Pide a la administradora que le dé acceso a TUTRELLO.`)).catch(() => toast(`Invitaste a ${email}`));
    });
    m.addEventListener('click', e => {
      const r = e.target.closest('[data-remove-member]');
      if (r) {
        if (!confirm(`¿Quitar a ${r.dataset.removeMember} de este tablero?`)) return;
        b.memberEmails = b.memberEmails.filter(x => x !== r.dataset.removeMember);
        commit(); shareModal();
      }
    });
    $('#copy-invite', m).onclick = async () => {
      try { await navigator.clipboard.writeText(inviteText); toast('Mensaje copiado. Pégalo en WhatsApp o email.'); }
      catch { prompt('Copia este mensaje:', inviteText); }
    };
  });
}

/* ---------- Lista de personas permitidas (solo administradora) ---------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function accessModal() {
  let list = [];
  try { list = await Cloud.getAllowed(); } catch { toast('No se pudo leer la lista de acceso.'); return; }
  simpleModal(`<span class="hud"><b>ACCESO</b> // SOLO POR INVITACIÓN</span><h2>Personas con acceso</h2>
    <p class="activity" style="margin:0 0 14px">Solo estos emails pueden entrar a TUTRELLO. Luego, cada tablero se comparte por separado con «Compartir».</p>
    <form class="inline-form" id="allow-form" style="margin:0 0 16px"><input type="text" id="allow-email" placeholder="email@ejemplo.com" autocomplete="off" inputmode="email"><button class="primary">Permitir</button></form>
    <div class="hud" style="margin-bottom:8px">PERMITIDOS (${list.length})</div>
    ${list.map(e => `<div class="archived-row"><span class="avatar sm" style="background:${avatarColor(e)}">${esc(initials(e))}</span><span>${esc(e)}${e === user.email ? ' (tú · administradora)' : ''}</span>
      ${e === user.email ? '' : `<button class="danger" data-disallow="${esc(e)}">Quitar</button>`}</div>`).join('')}`, m => {
    $('#allow-email', m).focus();
    $('#allow-form', m).addEventListener('submit', async e => {
      e.preventDefault(); e.stopPropagation();
      const email = $('#allow-email', m).value.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return toast('Escribe un email válido.');
      try { await Cloud.allowEmail(email); toast(`${email} ya puede entrar`); accessModal(); }
      catch { toast('No se pudo actualizar la lista.'); }
    });
    m.addEventListener('click', async e => {
      const d = e.target.closest('[data-disallow]'); if (!d) return;
      if (!confirm(`¿Quitar el acceso a ${d.dataset.disallow}? Dejará de ver todos los tableros, aunque siga invitada en ellos.`)) return;
      try { await Cloud.disallowEmail(d.dataset.disallow); accessModal(); }
      catch { toast('No se pudo actualizar la lista.'); }
    });
  });
}

/* ---------- Cuenta ---------- */
function renderUserButton() {
  const btn = $('#user-btn');
  btn.hidden = false;
  btn.textContent = initials(user.name);
  btn.style.background = avatarColor(user.email);
  btn.title = `${user.name} · ${user.email}`;
}
function userMenu(anchor) {
  popover(anchor, 'Cuenta', `<div style="display:flex;gap:10px;align-items:center;margin-bottom:10px">
      <span class="avatar" style="background:${avatarColor(user.email)}">${esc(initials(user.name))}</span>
      <div><div style="font-weight:600">${esc(user.name)}</div><div class="hud" style="text-transform:none;letter-spacing:0">${esc(user.email)}</div></div></div>
    <div class="pop-sep"></div>
    ${access?.admin ? '<button class="pop-item" data-a="access">⚿ Personas con acceso</button>' : ''}
    <button class="pop-item" data-a="data">⇅ Datos y copia de seguridad</button>
    <button class="pop-item warn" data-a="logout">Cerrar sesión</button>`, pop => pop.addEventListener('click', e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'data') { closePopover(); dataModal(); }
    if (a === 'access') { closePopover(); accessModal(); }
    if (a === 'logout') { closePopover(); Cloud.logout(); }
  }));
}
const AUTH_ERRORS = {
  'auth/invalid-credential': 'Email o contraseña incorrectos.',
  'auth/wrong-password': 'Email o contraseña incorrectos.',
  'auth/user-not-found': 'No existe una cuenta con ese email.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email. Inicia sesión.',
  'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
  'auth/invalid-email': 'Ese email no es válido.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Sin conexión a internet.'
};
let authMode = 'login';
function renderAuth(view) {
  const signup = authMode === 'signup';
  view.innerHTML = `<div class="auth-screen bg-space">
    <form class="auth-card" id="auth-form" novalidate>
      <div class="brand-symbol big"><img src="assets/tuimagen-studios.png" alt=""></div>
      <span class="hud"><b>TUTRELLO</b> // ${signup ? 'CREAR CUENTA' : 'INICIAR SESIÓN'}</span>
      <h1>${signup ? 'Únete a tus tableros' : 'Bienvenida de vuelta'}<span>.</span></h1>
      <p class="activity" style="margin:0 0 18px">${signup ? 'Usa el email con el que te invitaron para ver los tableros compartidos.' : 'Tus tableros, sincronizados con tu equipo y tu familia.'}</p>
      ${signup ? `<div class="field"><label class="hud" for="au-name">NOMBRE</label><input type="text" id="au-name" autocomplete="name" maxlength="60" required></div>` : ''}
      <div class="field"><label class="hud" for="au-email">EMAIL</label><input type="text" inputmode="email" id="au-email" autocomplete="email" required></div>
      <div class="field"><label class="hud" for="au-pass">CONTRASEÑA</label><input type="password" id="au-pass" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></div>
      <p class="auth-error" id="au-error" role="alert"></p>
      <button class="primary" id="au-submit" style="width:100%;justify-content:center">${signup ? 'Crear cuenta' : 'Entrar'}</button>
      <div class="auth-links">
        <button type="button" class="ghost" id="au-switch">${signup ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Créala'}</button>
        ${signup ? '' : '<button type="button" class="ghost" id="au-reset">Olvidé mi contraseña</button>'}
      </div>
    </form></div>`;
  const err = msg => { $('#au-error').textContent = msg; };
  $('#au-switch').onclick = () => { authMode = signup ? 'login' : 'signup'; render(); };
  $('#au-reset')?.addEventListener('click', async () => {
    const email = $('#au-email').value.trim();
    if (!email) return err('Escribe tu email y vuelve a pulsar «Olvidé mi contraseña».');
    try { await Cloud.resetPassword(email); err(''); toast('Te enviamos un email para cambiar la contraseña.'); }
    catch (e) { err(AUTH_ERRORS[e.code] || 'No se pudo enviar el email.'); }
  });
  $('#auth-form').addEventListener('submit', async e => {
    e.preventDefault(); e.stopPropagation();
    const email = $('#au-email').value.trim(), pass = $('#au-pass').value;
    const name = signup ? $('#au-name').value.trim() : '';
    if (signup && !name) return err('Escribe tu nombre.');
    if (!email || !pass) return err('Completa email y contraseña.');
    const btn = $('#au-submit'); btn.disabled = true; btn.textContent = 'Un momento…';
    try {
      if (signup) { user = await Cloud.signUp(name, email, pass); render(); }
      else await Cloud.signIn(email, pass);
    } catch (e2) {
      err(AUTH_ERRORS[e2.code] || `No se pudo continuar (${e2.code || e2.message}).`);
      btn.disabled = false; btn.textContent = signup ? 'Crear cuenta' : 'Entrar';
    }
  });
}
function renderVerify(view) {
  view.innerHTML = `<div class="auth-screen bg-space"><div class="auth-card">
    <span class="hud"><b>VERIFICA</b> // TU EMAIL</span>
    <h1>Revisa tu correo<span>.</span></h1>
    <p class="activity" style="margin:0 0 18px">Enviamos un enlace a <b style="color:var(--soft-white)">${esc(user.email)}</b>. Ábrelo para confirmar que el email es tuyo (mira también en spam) y luego pulsa «Ya lo verifiqué».</p>
    <button class="primary" id="vf-check" style="width:100%;justify-content:center">Ya lo verifiqué</button>
    <div class="auth-links"><button class="ghost" id="vf-resend">Reenviar email</button><button class="ghost" id="vf-out">Usar otra cuenta</button></div>
  </div></div>`;
  $('#vf-check').onclick = async () => {
    user = await Cloud.reloadUser();
    if (user.verified) startSession(); else toast('Aún no aparece verificado. Abre el enlace del email.');
  };
  $('#vf-resend').onclick = () => Cloud.resendVerification().then(() => toast('Email reenviado.')).catch(() => toast('Espera un poco antes de reenviar.'));
  $('#vf-out').onclick = () => Cloud.logout();
}
let access = null; // { allowed, admin }
function renderNoAccess(view) {
  view.innerHTML = `<div class="auth-screen bg-space"><div class="auth-card">
    <span class="hud"><b>ACCESO</b> // SOLO POR INVITACIÓN</span>
    <h1>Aún no tienes acceso<span>.</span></h1>
    <p class="activity" style="margin:0 0 18px">TUTRELLO es privado. Pide a la administradora que agregue <b style="color:var(--soft-white)">${esc(user.email)}</b> a la lista de personas permitidas y luego pulsa «Reintentar».</p>
    <button class="primary" id="na-retry" style="width:100%;justify-content:center">Reintentar</button>
    <div class="auth-links"><button class="ghost" id="na-out">Usar otra cuenta</button></div>
  </div></div>`;
  $('#na-retry').onclick = () => startSession();
  $('#na-out').onclick = () => Cloud.logout();
}
async function startSession() {
  ready = false; access = null;
  $('#view').innerHTML = `<div class="center-screen"><span class="hud"><b>TUTRELLO</b> // COMPROBANDO ACCESO…</span></div>`;
  try { access = await Cloud.checkAccess(); }
  catch (err) { console.error(err); access = { allowed: false, admin: false, error: true }; }
  if (!access.allowed) {
    document.body.classList.add('signed-out');
    renderNoAccess($('#view'));
    if (access.error) toast('No se pudo comprobar el acceso. Revisa tu conexión.');
    return;
  }
  try { state.recent = JSON.parse(localStorage.getItem(`tutrello:recent:${user.uid}`) || '[]'); } catch { state.recent = []; }
  render();
  Cloud.watch(applyRemote, (kind, err) => {
    setStatus(kind);
    if (kind === 'error') console.error(err);
  });
}
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.boards)) throw new Error('formato');
    if (!confirm(`¿Importar ${data.boards.length} tablero(s) desde «${file.name}»? Se añadirán como tableros nuevos tuyos.`)) return;
    state.boards.push(...adoptBoards(normalize(data).boards)); closeModal(); goHome(); save(); toast('Tableros importados');
  } catch { alert('Ese archivo no es una copia válida de TUTRELLO.'); }
});

let toastTimer;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button>Deshacer</button>' : ''}`;
  el.hidden = false;
  if (undo) $('button', el).onclick = () => { el.hidden = true; undo(); };
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 5000);
}

/* ---------- Búsqueda ---------- */
const searchInput = $('#search'), searchResults = $('#search-results');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { searchResults.hidden = true; return; }
  const hits = [];
  for (const b of state.boards) {
    if (b.title.toLowerCase().includes(q)) hits.push({ type: 'board', b });
    for (const l of b.lists) for (const c of l.cards)
      if (!c.archived && (c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))) hits.push({ type: 'card', b, l, c });
  }
  searchResults.innerHTML = hits.length ? hits.slice(0, 30).map(h => h.type === 'board'
    ? `<button data-go-board="${h.b.id}">▦ ${esc(h.b.title)}<span class="hud meta">TABLERO</span></button>`
    : `<button data-go-card="${h.c.id}" data-board="${h.b.id}">${esc(h.c.title)}<span class="hud meta">${esc(h.b.title)} // ${esc(h.l.title)}</span></button>`).join('')
    : '<div class="empty">Sin resultados.</div>';
  searchResults.hidden = false;
});
searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { searchInput.value = ''; searchResults.hidden = true; searchInput.blur(); } });
searchResults.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  searchResults.hidden = true; searchInput.value = '';
  if (t.dataset.goBoard) openBoard(t.dataset.goBoard);
  else { openBoard(t.dataset.board); openCard(t.dataset.goCard); }
});
document.addEventListener('mousedown', e => { if (!e.target.closest('.search-wrap')) searchResults.hidden = true; });

/* ---------- Eventos globales ---------- */
$('#go-home').onclick = () => goHome();
$('#nav-boards').onclick = () => goHome('all');
$('#nav-starred').onclick = () => goHome('starred');
$('#create-board-top').onclick = createBoardModal;
$('#menu-data').onclick = dataModal;

document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('[data-close-pop]')) return closePopover();
  if (t.closest('.popover')) return;
  if (!t.closest('[data-pop],#filter-btn,#board-menu-btn,[data-list-menu]')) closePopover();

  const star = t.closest('[data-star]');
  if (star) { e.stopPropagation(); const b = state.boards.find(x => x.id === star.dataset.star); b.starred = !b.starred; commit(); return; }
  const nav = t.closest('[data-nav]'); if (nav) return goHome(nav.dataset.nav);
  const ob = t.closest('[data-open-board]'); if (ob) return openBoard(ob.dataset.openBoard);
  if (t.closest('[data-create-board]')) return createBoardModal();

  // Tablero
  if (t.closest('#board-title')) return inlineEdit($('#board-title'), board().title, 'board-title-input', v => { board().title = v; save(); });
  if (t.closest('#filter-btn')) return labelsPopover($('#filter-btn'), 'filter');
  if (t.closest('#share-btn')) return shareModal();
  if (t.closest('#user-btn')) return userMenu($('#user-btn'));
  if (t.closest('[data-clear-filter]')) { labelFilter = null; return render(); }
  if (t.closest('#board-menu-btn')) return boardMenu($('#board-menu-btn'));
  if (t.closest('#add-list-btn')) return openListComposer();
  const addCard = t.closest('[data-add-card]'); if (addCard) return openCardComposer(addCard.dataset.addCard);
  const lm = t.closest('[data-list-menu]'); if (lm) return listMenu(lm, lm.dataset.listMenu);
  const lt = t.closest('[data-list-title]');
  if (lt) { const list = board().lists.find(l => l.id === lt.dataset.listTitle); return inlineEdit(lt, list.title, 'list-title-input', v => { list.title = v; save(); }); }
  if (t.closest('[data-toggle-labels]') && !t.closest('.modal')) {
    e.stopPropagation(); localStorage.setItem('tutrello:labels-expanded', localStorage.getItem('tutrello:labels-expanded') === '1' ? '0' : '1'); return render();
  }
  const cardEl = t.closest('[data-card]'); if (cardEl && !t.closest('.modal')) return openCard(cardEl.dataset.card);

  // Modal
  if (t.matches('[data-backdrop]') || t.closest('[data-close]')) { if (openCardId || $('#modal-root').innerHTML) { closeModal(); render(); } return; }
  if (!openCardId) return;
  const f = findCard(openCardId); if (!f) return;
  const c = f.card;
  const pop = t.closest('[data-pop]');
  if (pop) { const k = pop.dataset.pop; return ({ labels: labelsPopover, due: duePopover, cover: coverPopover, move: movePopover })[k](pop); }
  if (t.closest('#desc-view')) return editDescription();
  if (t.closest('[data-save-desc]')) return saveDesc();
  if (t.closest('[data-cancel-desc]')) { document.activeElement?.blur(); return renderCardModal(); }
  if (t.closest('[data-add-checklist]')) {
    if (!c.checklist.length) { c.checklist.push({ id: uid(), text: 'Primer paso', done: false }); commit(); }
    $('#check-input')?.focus(); return;
  }
  if (t.closest('[data-hide-done]')) { c.hideDone = !c.hideDone; return commit(); }
  const ck = t.closest('[data-check]');
  if (ck) { const i = c.checklist.find(x => x.id === ck.dataset.check); i.done = ck.checked; return commit(); }
  const dc = t.closest('[data-del-check]');
  if (dc) { c.checklist = c.checklist.filter(x => x.id !== dc.dataset.delCheck); return commit(); }
  const ec = t.closest('[data-edit-check]');
  if (ec) { const i = c.checklist.find(x => x.id === ec.dataset.editCheck); return inlineEdit(ec, i.text, '', v => { i.text = v; save(); }); }
  const dm = t.closest('[data-del-comment]');
  if (dm) { c.comments = c.comments.filter(x => x.id !== dm.dataset.delComment); return commit(); }
  if (t.closest('[data-archive]')) { c.archived = true; closeModal(); commit(); const cid = c.id; return toast('Tarjeta archivada', () => { const cur = findCard(cid)?.card; if (cur) { cur.archived = false; commit(); } }); }
  if (t.closest('[data-unarchive]')) { c.archived = false; return commit(); }
  if (t.closest('[data-delete-card]')) { if (!confirm('¿Eliminar esta tarjeta para siempre?')) return; f.list.cards.splice(f.idx, 1); closeModal(); return commit(); }
  if (t.closest('[data-copy-card]')) {
    const copy = JSON.parse(JSON.stringify(c)); copy.id = uid(); copy.title += ' (copia)'; copy.createdAt = now(); copy.activity = [];
    f.list.cards.splice(f.idx + 1, 0, copy); commit(); toast('Tarjeta copiada'); return;
  }
});
document.addEventListener('change', e => {
  if (!openCardId) return;
  const f = findCard(openCardId); if (!f) return;
  if (e.target.id === 'due-done') { f.card.dueDone = e.target.checked; commit(); }
  if (e.target.id === 'due-input') { f.card.due = e.target.value || null; commit(); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = openCardId && findCard(openCardId); if (!f) return;
  if (e.target.id === 'check-form') {
    const v = $('#check-input').value.trim(); if (!v) return;
    f.card.checklist.push({ id: uid(), text: v, done: false }); commit(); $('#check-input').focus();
  }
  if (e.target.id === 'comment-form') {
    const v = $('#comment-input').value.trim(); if (!v) return;
    f.card.comments.unshift({ id: uid(), text: v, at: now(), by: user.email, byName: user.name }); commit();
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if ($('#popover-root').innerHTML) return closePopover();
    if ($('#modal-root').innerHTML) { closeModal(); return render(); }
  }
  if (e.key === 'Enter' && e.target.matches?.('[data-card]')) openCard(e.target.dataset.card);
  if (e.key === 'Enter' && e.target.matches?.('[data-open-board]')) openBoard(e.target.dataset.openBoard);
  const typing = e.target.matches?.('input,textarea,select');
  if (!typing && e.key === '/') { e.preventDefault(); searchInput.focus(); }
});

/* ---------- Arranque ---------- */
(function boot() {
  const config = window.TUTRELLO_FIREBASE;
  const emulator = new URLSearchParams(location.search).has('emulator');
  if (!Cloud || (!config?.apiKey && !emulator)) {
    $('#view').innerHTML = `<div class="center-screen"><div class="auth-card"><span class="hud"><b>CONFIGURACIÓN</b> // PENDIENTE</span><h1>Falta conectar Firebase<span>.</span></h1><p class="activity">Completa <code>app/firebase-config.js</code> con los datos de tu proyecto.</p></div></div>`;
    return;
  }
  Cloud.init(emulator ? { apiKey: 'demo-key', projectId: 'demo-tutrello', authDomain: 'demo-tutrello.firebaseapp.com' } : config, { emulator });
  Cloud.setAdmin(emulator ? new URLSearchParams(location.search).get('admin') : window.TUTRELLO_ADMIN);
  addEventListener('online', () => setStatus('saving'));
  addEventListener('offline', () => setStatus('offline'));
  Cloud.onAuth(u => {
    const changed = (u?.uid || null) !== (user?.uid || null);
    user = u;
    if (!u) { state = { boards: [], recent: [] }; ready = false; access = null; route = { view: 'home', boardId: null, filter: 'all' }; closeModal(); $('#user-btn').hidden = true; authMode = 'login'; return render(); }
    if (!u.verified) return render();
    if (changed || !ready) startSession();
  });
})();

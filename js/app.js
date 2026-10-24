import { Store, CATEGORIES, categoryById, monthKey, shiftMonth, toISODate } from './store.js';

const store = new Store();
const $ = (s) => document.querySelector(s);

const state = {
  month: monthKey(toISODate(new Date())),
  filter: 'all',
  query: '',
  formType: 'expense',
  formCategory: CATEGORIES.expense[0].id,
};

const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const monthName = (key, opts = { month: 'long', year: 'numeric' }) => {
  const [y, m] = key.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', opts).replace(' г.', '');
  return s[0].toUpperCase() + s.slice(1);
};
const dayLabel = (iso) => {
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 864e5));
  if (iso === today) return 'Сегодня';
  if (iso === yesterday) return 'Вчера';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
};
const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Тема ----------
const THEME_KEY = 'fintrack_theme';
function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}
try { applyTheme(localStorage.getItem(THEME_KEY)); } catch { /* ignore */ }
$('#themeBtn').addEventListener('click', () => {
  const dark = isDark();
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  render();
});
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render());

// ---------- Графики ----------
let donut = null;
let bars = null;
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function renderCharts(list) {
  if (!window.Chart) return; // CDN недоступен — остальное работает
  const text = cssVar('--text-muted');
  const grid = cssVar('--border');
  Chart.defaults.font.family = 'Manrope, system-ui, sans-serif';
  Chart.defaults.color = text;

  const cats = store.byCategory(list);
  $('#donutEmpty').hidden = cats.length > 0;
  $('#donut').hidden = cats.length === 0;
  const total = cats.reduce((s, [, v]) => s + v, 0);
  $('#legend').innerHTML = cats.map(([id, v]) => {
    const c = categoryById(id);
    return `<li><span class="dot" style="background:${c.color}"></span>${c.icon} ${c.name}
      <span class="legend__val">${money.format(v)} · ${Math.round((v / total) * 100)}%</span></li>`;
  }).join('');

  const donutData = {
    labels: cats.map(([id]) => categoryById(id).name),
    datasets: [{
      data: cats.map(([, v]) => v),
      backgroundColor: cats.map(([id]) => categoryById(id).color),
      borderColor: cssVar('--surface'),
      borderWidth: 3,
      hoverOffset: 6,
    }],
  };
  const tooltip = { callbacks: { label: (ctx) => ` ${money.format(ctx.parsed.y ?? ctx.parsed)}` } };
  if (donut) { donut.data = donutData; donut.options.plugins.tooltip = tooltip; donut.update(); }
  else {
    donut = new Chart($('#donut'), {
      type: 'doughnut',
      data: donutData,
      options: { cutout: '68%', plugins: { legend: { display: false }, tooltip }, maintainAspectRatio: false },
    });
  }

  const hist = store.history(state.month, 6);
  const barData = {
    labels: hist.map((h) => monthName(h.key, { month: 'short' }).replace('.', '')),
    datasets: [
      { label: 'Доходы', data: hist.map((h) => h.income), backgroundColor: cssVar('--income'), borderRadius: 6, maxBarThickness: 22 },
      { label: 'Расходы', data: hist.map((h) => h.expense), backgroundColor: cssVar('--expense'), borderRadius: 6, maxBarThickness: 22 },
    ],
  };
  const barOpts = {
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 } }, tooltip },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: grid }, border: { display: false }, ticks: { callback: (v) => `${v / 1000}k` } },
    },
  };
  if (bars) { bars.data = barData; bars.options = barOpts; bars.update(); }
  else bars = new Chart($('#bars'), { type: 'bar', data: barData, options: barOpts });
}

// ---------- Список ----------
function renderList(list) {
  const q = state.query.toLowerCase();
  const filtered = list.filter((t) =>
    (state.filter === 'all' || t.type === state.filter)
    && (!q || t.note.toLowerCase().includes(q) || categoryById(t.category).name.toLowerCase().includes(q)));

  if (!filtered.length) {
    $('#list').innerHTML = `<div class="empty-state"><div class="empty-state__icon">🧾</div>
      <p>${list.length ? 'Ничего не найдено' : 'В этом месяце операций пока нет'}</p></div>`;
    return;
  }

  const groups = new Map();
  for (const t of filtered) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  $('#list').innerHTML = [...groups].map(([date, items]) => `
    <div class="tx-group">
      <h3 class="tx-group__date">${dayLabel(date)}</h3>
      ${items.map((t) => {
        const c = categoryById(t.category);
        const sign = t.type === 'income' ? '+' : '−';
        return `<div class="tx">
          <span class="tx__icon" style="--c:${c.color}">${c.icon}</span>
          <div class="tx__body">
            <span class="tx__cat">${c.name}</span>
            ${t.note ? `<span class="tx__note">${escapeHTML(t.note)}</span>` : ''}
          </div>
          <span class="tx__amount ${t.type === 'income' ? 'is-income' : ''}">${sign}${money.format(t.amount)}</span>
          <button class="tx__del" data-del="${t.id}" aria-label="Удалить">✕</button>
        </div>`;
      }).join('')}
    </div>`).join('');
}

// ---------- Общий рендер ----------
function animateValue(el, value) {
  const from = Number(el.dataset.value || 0);
  el.dataset.value = value;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / 450);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = money.format(from + (value - from) * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function render() {
  const list = store.forMonth(state.month);
  const { income, expense, balance } = store.totals(list);
  $('#monthLabel').textContent = monthName(state.month);
  $('#nextMonth').disabled = state.month >= monthKey(toISODate(new Date()));
  animateValue($('#income'), income);
  animateValue($('#expense'), expense);
  animateValue($('#balance'), balance);
  $('#balance').classList.toggle('is-expense', balance < 0);
  $('#demoBanner').hidden = !store.isDemo;
  renderCharts(list);
  renderList(list);
}

// ---------- Форма ----------
const form = $('#txForm');

function renderCats() {
  $('#cats').innerHTML = CATEGORIES[state.formType].map((c) => `
    <button type="button" class="cat ${c.id === state.formCategory ? 'is-active' : ''}" data-cat="${c.id}" style="--c:${c.color}">
      <span>${c.icon}</span>${c.name}
    </button>`).join('');
}

function resetForm() {
  form.reset();
  const today = toISODate(new Date());
  const inMonth = state.month === monthKey(today);
  form.date.value = inMonth ? today : `${state.month}-01`;
}

$('#typeSwitch').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-type]');
  if (!btn) return;
  state.formType = btn.dataset.type;
  state.formCategory = CATEGORIES[state.formType][0].id;
  $('#typeSwitch').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
  renderCats();
});

$('#cats').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cat]');
  if (!btn) return;
  state.formCategory = btn.dataset.cat;
  renderCats();
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const amount = Number(form.amount.value);
  if (!(amount > 0)) return;
  if (store.isDemo && confirm('Убрать демо-данные перед добавлением своей первой операции?')) store.clear();
  store.add({ type: state.formType, amount, category: state.formCategory, date: form.date.value, note: form.note.value });
  state.month = monthKey(form.date.value);
  resetForm();
  closeSheet();
  render();
  toast('Операция добавлена');
});

// ---------- Мобильная панель ----------
function openSheet() {
  $('#sheet').classList.add('is-open');
  $('#backdrop').hidden = false;
  setTimeout(() => form.amount.focus(), 250);
}
function closeSheet() {
  $('#sheet').classList.remove('is-open');
  $('#backdrop').hidden = true;
}
$('#fab').addEventListener('click', openSheet);
$('#backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// ---------- Прочие обработчики ----------
$('#prevMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); resetForm(); render(); });
$('#nextMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); resetForm(); render(); });

$('#typeFilter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  state.filter = btn.dataset.filter;
  $('#typeFilter').querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
  renderList(store.forMonth(state.month));
});

$('#search').addEventListener('input', (e) => {
  state.query = e.target.value;
  renderList(store.forMonth(state.month));
});

let lastDeleted = null;
$('#list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  lastDeleted = store.items.find((t) => t.id === btn.dataset.del);
  store.remove(btn.dataset.del);
  render();
  toast('Операция удалена', 'Вернуть', () => {
    if (!lastDeleted) return;
    store.add(lastDeleted);
    lastDeleted = null;
    render();
  });
});

$('#clearDemo').addEventListener('click', () => { store.clear(); render(); toast('Готово! Добавьте первую операцию'); });

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([store.toCSV()], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fintrack-${toISODate(new Date())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

let toastTimer;
function toast(text, actionLabel, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${text}</span>`;
  if (actionLabel) {
    const b = document.createElement('button');
    b.textContent = actionLabel;
    b.onclick = () => { action(); el.hidden = true; };
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---------- Старт ----------
renderCats();
resetForm();
render();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

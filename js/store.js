// Хранилище операций в localStorage + вычисления. Без DOM.

const KEY = 'fintrack_v1';

export const CATEGORIES = {
  expense: [
    { id: 'food', name: 'Продукты', icon: '🛒', color: '#f97316' },
    { id: 'cafe', name: 'Кафе', icon: '☕', color: '#eab308' },
    { id: 'transport', name: 'Транспорт', icon: '🚇', color: '#3b82f6' },
    { id: 'home', name: 'Жильё', icon: '🏠', color: '#8b5cf6' },
    { id: 'fun', name: 'Развлечения', icon: '🎮', color: '#ec4899' },
    { id: 'health', name: 'Здоровье', icon: '💊', color: '#14b8a6' },
    { id: 'shopping', name: 'Покупки', icon: '🛍️', color: '#ef4444' },
    { id: 'other', name: 'Другое', icon: '📦', color: '#64748b' },
  ],
  income: [
    { id: 'salary', name: 'Зарплата', icon: '💼', color: '#22c55e' },
    { id: 'freelance', name: 'Фриланс', icon: '💻', color: '#10b981' },
    { id: 'gift', name: 'Подарки', icon: '🎁', color: '#84cc16' },
    { id: 'other_in', name: 'Другое', icon: '💰', color: '#06b6d4' },
  ],
};

export const categoryById = (id) =>
  [...CATEGORIES.expense, ...CATEGORIES.income].find((c) => c.id === id) ?? CATEGORIES.expense.at(-1);

const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const monthKey = (date) => date.slice(0, 7); // 'YYYY-MM'

export function toISODate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toISODate(d).slice(0, 7);
}

export class Store {
  constructor() {
    const saved = this.#read();
    this.items = saved?.items ?? [];
    this.isDemo = saved?.isDemo ?? false;
    if (!saved) this.seedDemo();
  }

  #read() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }

  #write() {
    try { localStorage.setItem(KEY, JSON.stringify({ items: this.items, isDemo: this.isDemo })); } catch { /* приватный режим */ }
  }

  add({ type, amount, category, date, note }) {
    this.items.push({ id: uid(), type, amount: Math.round(amount * 100) / 100, category, date, note: note.trim() });
    this.#write();
  }

  remove(id) {
    this.items = this.items.filter((t) => t.id !== id);
    this.#write();
  }

  clear() {
    this.items = [];
    this.isDemo = false;
    this.#write();
  }

  forMonth(key) {
    return this.items
      .filter((t) => monthKey(t.date) === key)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  totals(list) {
    const income = list.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { income, expense, balance: income - expense };
  }

  byCategory(list) {
    const map = new Map();
    for (const t of list) if (t.type === 'expense') map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  /** Доходы и расходы за последние n месяцев до key включительно. */
  history(key, n = 6) {
    return Array.from({ length: n }, (_, i) => {
      const k = shiftMonth(key, i - n + 1);
      return { key: k, ...this.totals(this.forMonth(k)) };
    });
  }

  toCSV() {
    const head = 'Дата;Тип;Категория;Сумма;Комментарий';
    const rows = [...this.items]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        t.date,
        t.type === 'income' ? 'Доход' : 'Расход',
        categoryById(t.category).name,
        String(t.amount).replace('.', ','),
        `"${t.note.replaceAll('"', '""')}"`,
      ].join(';'));
    return '﻿' + [head, ...rows].join('\n');
  }

  /** Демо-данные за 6 месяцев, чтобы посетитель портфолио сразу увидел графики. */
  seedDemo() {
    const now = new Date();
    const items = [];
    const rnd = (a, b) => Math.round(a + Math.random() * (b - a));
    for (let m = 5; m >= 0; m--) {
      const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const days = m === 0 ? now.getDate() : new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      const day = (d) => toISODate(new Date(base.getFullYear(), base.getMonth(), Math.min(d, days)));
      items.push({ id: uid(), type: 'income', amount: 85000, category: 'salary', date: day(5), note: 'Зарплата' });
      if (Math.random() > 0.4) items.push({ id: uid(), type: 'income', amount: rnd(8, 30) * 1000, category: 'freelance', date: day(rnd(10, 25)), note: 'Лендинг для клиента' });
      items.push({ id: uid(), type: 'expense', amount: 32000, category: 'home', date: day(3), note: 'Аренда' });
      for (let i = 0; i < 7; i++) items.push({ id: uid(), type: 'expense', amount: rnd(600, 3500), category: 'food', date: day(rnd(1, 28)), note: 'Супермаркет' });
      for (let i = 0; i < 5; i++) items.push({ id: uid(), type: 'expense', amount: rnd(250, 1200), category: 'cafe', date: day(rnd(1, 28)), note: 'Кофе с друзьями' });
      items.push({ id: uid(), type: 'expense', amount: rnd(1800, 2600), category: 'transport', date: day(rnd(1, 10)), note: 'Проездной' });
      items.push({ id: uid(), type: 'expense', amount: rnd(1000, 6000), category: 'fun', date: day(rnd(1, 28)), note: 'Кино / игры' });
      if (Math.random() > 0.5) items.push({ id: uid(), type: 'expense', amount: rnd(2000, 12000), category: 'shopping', date: day(rnd(1, 28)), note: 'Одежда' });
      if (Math.random() > 0.6) items.push({ id: uid(), type: 'expense', amount: rnd(500, 4000), category: 'health', date: day(rnd(1, 28)), note: 'Аптека' });
    }
    this.items = items.filter((t) => t.date <= toISODate(now));
    this.isDemo = true;
    this.#write();
  }
}

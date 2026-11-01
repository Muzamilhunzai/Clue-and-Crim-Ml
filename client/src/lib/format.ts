const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** SQLite timestamps are UTC "YYYY-MM-DD HH:MM:SS" (or ISO). Parse both. */
export function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const s = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00` : v.includes('T') ? v : `${v.replace(' ', 'T')}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "12 Oct 2026" - date-only values are shown as written (no time-zone shift). */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const d = parseDate(v);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '-';
}

/** Short chip date, "Oct 12" */
export function fmtChip(v: string | null | undefined): string {
  if (!v) return '-';
  const d = parseDate(v);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : '-';
}

export function fmtDateTime(v: string | null | undefined): string {
  const d = parseDate(v);
  if (!d) return '-';
  const hh = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

export function timeAgo(v: string | null | undefined): string {
  const d = parseDate(v);
  if (!d) return '-';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return fmtDate(v);
}

export const humanize = (v: string | null | undefined) =>
  !v ? '' : v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ');

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Renders FTS snippets: "[[match]]" -> <mark> pieces (React-safe: never uses innerHTML). */
export function splitHighlight(text: string | null | undefined): { text: string; hit: boolean }[] {
  if (!text) return [];
  return text.split(/(\[\[.*?\]\])/g).filter(Boolean).map((p) =>
    p.startsWith('[[') && p.endsWith(']]') ? { text: p.slice(2, -2), hit: true } : { text: p, hit: false });
}

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

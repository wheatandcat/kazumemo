/** 月は 'YYYY-MM' 形式の文字列で扱う */

export const MONTH_EVENT = 'kazumemo:month';

const STORAGE_KEY = 'kazumemo:month';

export function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function parse(month: string): { year: number; month: number } {
  const [year, m] = month.split('-').map(Number);
  return { year, month: m };
}

export function addMonths(month: string, n: number): string {
  const p = parse(month);
  return currentMonth(new Date(p.year, p.month - 1 + n, 1));
}

export function monthLabel(month: string): string {
  const p = parse(month);
  return `${p.year}年${p.month}月`;
}

export function shortMonthLabel(month: string): string {
  return `${parse(month).month}月`;
}

/** month で終わる直近 n か月（古い順） */
export function recentMonths(month: string, n = 6): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(month, i - n + 1));
}

/** 画面間で共有する選択中の月。アプリを開き直すと今月に戻る */
export function getSelectedMonth(): string {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v && /^\d{4}-\d{2}$/.test(v)) return v;
  } catch {
    // sessionStorage が使えない環境では今月を使う
  }
  return currentMonth();
}

export function setSelectedMonth(month: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, month);
  } catch {
    // 保存できなくても画面内では切り替える
  }
  window.dispatchEvent(new CustomEvent<string>(MONTH_EVENT, { detail: month }));
}

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

export function daysInMonth(month: string): number {
  const p = parse(month);
  return new Date(p.year, p.month, 0).getDate();
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 例：'10月12日（日）' */
export function dayLabel(month: string, day: number): string {
  const p = parse(month);
  return `${p.month}月${day}日（${WEEKDAYS[new Date(p.year, p.month - 1, day).getDay()]}）`;
}

/** 今日が month に含まれていればその日、含まれなければ null */
export function todayIn(month: string): number | null {
  const now = new Date();
  return currentMonth(now) === month ? now.getDate() : null;
}

/**
 * 時刻 at を month の中の日（1〜末日）にする。
 * 過去の月を開いて記録した場合など at が month の外にあるときは、月初か月末に寄せる。
 */
export function dayIn(at: number, month: string): number {
  const d = new Date(at);
  const m = currentMonth(d);
  if (m === month) return d.getDate();
  return m < month ? 1 : daysInMonth(month);
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

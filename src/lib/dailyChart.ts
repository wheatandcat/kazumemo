import { dayLabel, daysInMonth, todayIn } from './month';
import { setColor } from './render';

export type Series = {
  name: string;
  color: string;
  /** 日ごとの回数（index 0 = 1日） */
  values: number[];
};

type State = { month: string; series: Series[] };

const states = new WeakMap<HTMLElement, State>();
const AXIS_DAYS = new Set([1, 5, 10, 15, 20, 25]);
const HINT = 'グラフをタップすると日ごとの回数を表示します';

function totals(state: State): number[] {
  return Array.from({ length: daysInMonth(state.month) }, (_, i) =>
    state.series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0),
  );
}

function select(root: HTMLElement, day: number | null) {
  const state = states.get(root);
  if (!state) return;
  const readout = root.querySelector<HTMLElement>('.daily-readout')!;
  const bars = root.querySelector<HTMLElement>('.daily-bars')!;
  bars.classList.toggle('has-selection', day !== null);
  bars.querySelectorAll('.daily-col').forEach((col, i) => col.classList.toggle('is-selected', i + 1 === day));
  // 選んだ日は目盛りがない日でも日付を出し、重ならないよう前後2日の目盛りは隠す
  root.querySelectorAll<HTMLElement>('.daily-axis span').forEach((label, i) => {
    const selected = i + 1 === day;
    const near = day !== null && Math.abs(i + 1 - day) <= 2;
    label.classList.toggle('is-selected', selected);
    label.textContent = selected ? String(i + 1) : near ? '' : (label.dataset.label ?? '');
  });
  root.dataset.selected = day === null ? '' : String(day);

  readout.classList.toggle('is-hint', day === null);
  if (day === null) {
    readout.textContent = HINT;
    return;
  }
  const total = totals(state)[day - 1];
  const parts = state.series.filter((s) => s.values[day - 1] > 0).map((s) => `${s.name} ${s.values[day - 1]}`);
  readout.textContent = `${dayLabel(state.month, day)}：${total}回${state.series.length > 1 && parts.length > 0 ? `（${parts.join('・')}）` : ''}`;
}

function bind(root: HTMLElement) {
  const pick = (e: PointerEvent) => {
    const state = states.get(root);
    const bars = root.querySelector<HTMLElement>('.daily-bars');
    if (!state || !bars || !bars.contains(e.target as Node)) return;
    const rect = bars.getBoundingClientRect();
    const days = daysInMonth(state.month);
    const day = Math.min(days, Math.max(1, Math.floor(((e.clientX - rect.left) / rect.width) * days) + 1));
    select(root, day);
  };
  root.addEventListener('pointerdown', pick);
  root.addEventListener('pointermove', (e) => {
    if (e.buttons > 0 || e.pointerType !== 'mouse') pick(e);
  });
}

/**
 * month の日ごとの回数を積み上げ棒グラフで root に描画する。
 * series が1つなら単色、複数ならユーザーごとに色分けして積み上げる。
 */
export function renderDailyChart(root: HTMLElement, month: string, series: Series[]): void {
  const prev = states.get(root);
  if (!prev) bind(root);
  states.set(root, { month, series });

  const days = daysInMonth(month);
  const today = todayIn(month);
  const sums = totals({ month, series });
  const max = Math.max(1, ...sums);

  const readout = document.createElement('p');
  readout.className = 'daily-readout';
  readout.setAttribute('aria-live', 'polite');

  const bars = document.createElement('div');
  bars.className = 'daily-bars';
  bars.style.gridTemplateColumns = `repeat(${days}, minmax(0, 1fr))`;
  bars.setAttribute('role', 'img');
  const nonZero = sums.flatMap((n, i) => (n > 0 ? [`${i + 1}日 ${n}回`] : []));
  bars.setAttribute(
    'aria-label',
    nonZero.length > 0 ? `日ごとの回数：${nonZero.join('、')}` : 'この月のカウントはまだありません',
  );

  const axis = document.createElement('div');
  axis.className = 'daily-axis';
  axis.style.gridTemplateColumns = `repeat(${days}, minmax(0, 1fr))`;
  axis.setAttribute('aria-hidden', 'true');

  for (let day = 1; day <= days; day++) {
    const col = document.createElement('span');
    col.className = 'daily-col';
    for (const s of series) {
      const v = s.values[day - 1] ?? 0;
      if (v === 0) continue;
      const seg = document.createElement('span');
      seg.className = 'daily-seg';
      setColor(seg, s.color);
      seg.style.height = `${(v / max) * 130}px`;
      col.append(seg);
    }
    bars.append(col);

    const label = document.createElement('span');
    label.classList.toggle('is-today', day === today);
    label.dataset.label = AXIS_DAYS.has(day) || day === days ? String(day) : '';
    label.textContent = label.dataset.label;
    axis.append(label);
  }

  root.replaceChildren(readout, bars, axis);

  // 再描画しても選択中の日は保つ。初回は今日（今月を表示しているとき）を選ぶ
  const kept = prev && prev.month === month ? Number(root.dataset.selected) || null : today;
  select(root, kept);
}

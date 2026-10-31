const MOVE_TOLERANCE = 10;

/**
 * タップで +1、長押しで −1 を通知する。
 * 指が動いた（スクロールした）場合はどちらも発火しない。キーボードでは Enter/Space で +1、- か Backspace で −1。
 */
export function bindCounter(el: HTMLElement, onCount: (delta: 1 | -1) => void, holdMs = 500): void {
  let timer: number | undefined;
  let start: { x: number; y: number } | null = null;

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    start = null;
    el.classList.remove('is-pressing');
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cancel();
    start = { x: e.clientX, y: e.clientY };
    el.classList.add('is-pressing');
    timer = window.setTimeout(() => {
      cancel();
      navigator.vibrate?.(30);
      onCount(-1);
    }, holdMs);
  });

  el.addEventListener('pointermove', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
  });

  el.addEventListener('pointerup', () => {
    const tapped = timer !== undefined;
    cancel();
    if (tapped) onCount(1);
  });

  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  // ポインター操作の click は pointerup で処理済みなので、キーボード由来（detail === 0）のみ扱う
  el.addEventListener('click', (e) => {
    if (e.detail === 0) onCount(1);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === '-' || e.key === 'Backspace') {
      e.preventDefault();
      onCount(-1);
    }
  });
}

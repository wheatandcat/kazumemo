const DRAG_THRESHOLD = 5;

/**
 * 横スクロールの領域をマウスでも動かせるようにする。
 * タッチは標準のスクロールに任せ、マウスはホイール（縦回転）とドラッグで横に動かす。
 */
export function bindHorizontalScroll(el: HTMLElement): void {
  el.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    },
    { passive: false },
  );

  let drag: { x: number; left: number; moved: boolean } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: el.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > DRAG_THRESHOLD) drag.moved = true;
    if (drag.moved) el.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    // ドラッグした直後の click でタグが選ばれないようにする
    if (drag?.moved) el.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true });
    drag = null;
  });
}

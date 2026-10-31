type Options = {
  /** 並べ替える要素のセレクタ（list の直下の子） */
  item: string;
  /** このセレクタ内で押したときはドラッグを始めない */
  ignore: string;
  idOf: (el: HTMLElement) => string;
  /** 画面下に固定された要素の高さ。自動スクロールの判定に使う */
  bottomInset?: () => number;
  holdMs?: number;
  /** 並び替え後の id 順を受け取る */
  onEnd: (ids: string[]) => void;
};

const MOVE_TOLERANCE = 10;
const EDGE = 80;

/**
 * 長押しで要素を持ち上げ、ドラッグで順番を入れ替えられるようにする。
 * 長押し前に指が動いた場合はスクロールとして扱い、ドラッグしない。
 * 戻り値はドラッグ中かどうかを返す関数。
 */
export function bindSortable(list: HTMLElement, opts: Options): () => boolean {
  const holdMs = opts.holdMs ?? 450;
  let timer: number | undefined;
  let press: { x: number; y: number; card: HTMLElement } | null = null;
  let drag: { card: HTMLElement; placeholder: HTMLElement; offsetY: number; y: number; raf: number } | null = null;
  let suppressClick = false;

  const cards = () => Array.from(list.querySelectorAll<HTMLElement>(`:scope > ${opts.item}`));

  const cancelPress = () => {
    clearTimeout(timer);
    timer = undefined;
    press?.card.classList.remove('is-holding');
    press = null;
  };

  const move = () => {
    if (!drag) return;
    const { card, placeholder, y } = drag;
    card.style.top = `${y - drag.offsetY}px`;
    const others = cards().filter((c) => c !== card);
    const before = others.find((c) => {
      const r = c.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (before) {
      if (placeholder.nextElementSibling !== before) list.insertBefore(placeholder, before);
    } else {
      const last = others.at(-1);
      if (last && last.nextElementSibling !== placeholder) last.after(placeholder);
    }
  };

  // 画面の上端・下端に近づいたらページをスクロールする
  const tick = () => {
    if (!drag) return;
    const bottom = innerHeight - (opts.bottomInset?.() ?? 0) - EDGE;
    let dy = 0;
    if (drag.y < EDGE) dy = -Math.ceil((EDGE - drag.y) / 6);
    else if (drag.y > bottom) dy = Math.ceil((drag.y - bottom) / 6);
    if (dy !== 0) {
      window.scrollBy(0, dy);
      move();
    }
    drag.raf = requestAnimationFrame(tick);
  };

  const start = (card: HTMLElement, y: number) => {
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('div');
    placeholder.className = 'sort-placeholder';
    placeholder.style.height = `${rect.height}px`;
    card.before(placeholder);
    Object.assign(card.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      zIndex: '20',
    });
    card.classList.remove('is-holding');
    card.classList.add('is-dragging');
    navigator.vibrate?.(20);
    timer = undefined;
    press = null;
    drag = { card, placeholder, offsetY: y - rect.top, y, raf: requestAnimationFrame(tick) };
  };

  const end = () => {
    if (!drag) return;
    const { card, placeholder, raf } = drag;
    cancelAnimationFrame(raf);
    placeholder.replaceWith(card);
    Object.assign(card.style, { position: '', left: '', top: '', width: '', zIndex: '' });
    card.classList.remove('is-dragging');
    drag = null;
    // 指を離したときの click で項目名のリンクが開かないようにする
    suppressClick = true;
    window.setTimeout(() => (suppressClick = false), 300);
    opts.onEnd(cards().map(opts.idOf));
  };

  list.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag) return;
    const target = e.target as Element;
    if (target.closest(opts.ignore)) return;
    const card = target.closest<HTMLElement>(opts.item);
    if (!card || card.parentElement !== list) return;
    press = { x: e.clientX, y: e.clientY, card };
    card.classList.add('is-holding');
    timer = window.setTimeout(() => {
      if (press) start(press.card, press.y);
    }, holdMs);
  });

  window.addEventListener('pointermove', (e) => {
    if (drag) {
      drag.y = e.clientY;
      move();
    } else if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_TOLERANCE) {
      cancelPress();
    }
  });
  window.addEventListener('pointerup', () => (drag ? end() : cancelPress()));
  window.addEventListener('pointercancel', () => (drag ? end() : cancelPress()));

  // ドラッグ中はタッチによるページのスクロールを止める
  window.addEventListener(
    'touchmove',
    (e) => {
      if (drag) e.preventDefault();
    },
    { passive: false },
  );
  list.addEventListener('contextmenu', (e) => {
    if ((e.target as Element).closest(opts.item)) e.preventDefault();
  });
  list.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClick = false;
    },
    true,
  );

  return () => drag !== null;
}

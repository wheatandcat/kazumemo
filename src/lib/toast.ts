let timer: number | undefined;

export function toast(text: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    el.hidden = true;
  }, 1600);
}

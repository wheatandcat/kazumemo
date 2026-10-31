import type { User } from './db';

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
}

/** <template id="..."> の最初の要素を複製する */
export function fromTemplate<T extends HTMLElement = HTMLElement>(id: string): T {
  const first = byId<HTMLTemplateElement>(id).content.firstElementChild;
  if (!first) throw new Error(`#${id} is empty`);
  return first.cloneNode(true) as T;
}

/** root 内の [data-part="name"] を取得する */
export function part<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const el = root.querySelector(`[data-part="${name}"]`);
  if (!el) throw new Error(`[data-part="${name}"] not found`);
  return el as T;
}

/** CSS の var(--c) にユーザー色を渡す */
export function setColor(el: HTMLElement, color: string): void {
  el.style.setProperty('--c', color);
}

export function initialOf(name: string): string {
  return Array.from(name.trim())[0] ?? '?';
}

export function avatar(user: User, size: number): HTMLElement {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.style.setProperty('--s', `${size}px`);
  setColor(el, user.color);
  el.textContent = initialOf(user.name);
  return el;
}

/** UserToggleTemplate の複製にユーザーを流し込む */
export function userToggle(user: User, checked: boolean): HTMLElement {
  const el = fromTemplate('tpl-user-toggle');
  setColor(el, user.color);
  const input = part<HTMLInputElement>(el, 'input');
  input.value = user.id;
  input.checked = checked;
  part(el, 'initial').textContent = initialOf(user.name);
  part(el, 'name').textContent = user.name;
  return el;
}

/** 選択中のチェックボックスの値（ユーザーID）を返す */
export function checkedValues(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'), (i) => i.value);
}

/** 1回目は確認表示、2回目で onConfirm。戻り値で表示を元に戻せる */
export function bindDangerButton(btn: HTMLButtonElement, onConfirm: () => void): () => void {
  const label = btn.textContent ?? '';
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) {
      onConfirm();
      return;
    }
    btn.dataset.armed = '1';
    btn.textContent = 'もう一度押すと削除します（元に戻せません）';
  });
  return () => {
    delete btn.dataset.armed;
    btn.textContent = label;
  };
}

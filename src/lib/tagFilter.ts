/** リストで選択中のタグ（端末ごとの表示設定なので localStorage に保存し、同期の対象にはしない） */

const STORAGE_KEY = 'kazumemo:tag';

/** 選択中のタグの id。「すべて」なら null */
export function getSelectedTag(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setSelectedTag(tagId: string | null): void {
  try {
    if (tagId === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, tagId);
  } catch {
    // 保存できなくても画面内では切り替える
  }
}

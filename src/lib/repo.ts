import { liveQuery } from 'dexie';
import { db, type CountEvent, type Item, type Tag, type User } from './db';
import { dayIn, daysInMonth } from './month';

export type { Item, Tag, User };

/** month -> itemId -> userId -> 回数 */
export type Counts = Record<string, Record<string, Record<string, number>>>;

/** month -> itemId -> userId -> 日ごとの回数（index 0 = 1日） */
export type Daily = Record<string, Record<string, Record<string, number[]>>>;

export type Snapshot = {
  users: User[];
  items: Item[];
  tags: Tag[];
  counts: Counts;
  daily: Daily;
};

// crypto.randomUUID は secure context 限定なので、LAN の http で開いた場合に備えて getRandomValues で作る
function uuid(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let deviceId: Promise<string> | undefined;

function getDeviceId(): Promise<string> {
  deviceId ??= db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get('deviceId');
    if (row) return row.value;
    const value = uuid();
    await db.meta.put({ key: 'deviceId', value });
    return value;
  });
  return deviceId;
}

function alive<T extends { deletedAt: number | null; createdAt: number }>(rows: T[]): T[] {
  return rows.filter((r) => r.deletedAt === null).sort((a, b) => a.createdAt - b.createdAt);
}

async function query(months: string[]): Promise<Snapshot> {
  const [users, items, tags, events] = await Promise.all([
    db.users.toArray(),
    db.items.toArray(),
    db.tags.toArray(),
    months.length > 0 ? db.events.where('month').anyOf(months).toArray() : Promise.resolve([]),
  ]);
  const groups = new Map<string, CountEvent[]>();
  for (const e of events) {
    const key = `${e.month}\n${e.itemId}\n${e.userId}`;
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  // 時刻順に +1 を積み、−1 は直近の +1 を取り消す。残った +1 の日付が日ごとの回数になる
  const counts: Counts = {};
  const daily: Daily = {};
  for (const list of groups.values()) {
    const { month, itemId, userId } = list[0];
    list.sort((a, b) => a.at - b.at);
    const stack: number[] = [];
    for (const e of list) {
      if (e.delta > 0) stack.push(dayIn(e.at, month));
      else stack.pop();
    }
    const days = new Array<number>(daysInMonth(month)).fill(0);
    for (const d of stack) days[d - 1]++;
    ((counts[month] ??= {})[itemId] ??= {})[userId] = stack.length;
    ((daily[month] ??= {})[itemId] ??= {})[userId] = days;
  }
  const bySortOrder = (a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder;
  return {
    users: alive(users),
    items: alive(items).sort(bySortOrder),
    tags: alive(tags).sort(bySortOrder),
    counts,
    daily,
  };
}

/** 指定した月のカウントを含むスナップショットを1回だけ取得する */
export function load(months: string[]): Promise<Snapshot> {
  return query(months);
}

/** 指定した月のスナップショットを購読する。データが変わるたびに onChange が呼ばれる */
export function watch(months: string[], onChange: (s: Snapshot) => void): () => void {
  const sub = liveQuery(() => query(months)).subscribe({
    next: onChange,
    error: (e) => console.error(e),
  });
  return () => sub.unsubscribe();
}

// ---- 集計 ----

export function countOf(s: Snapshot, month: string, itemId: string, userId: string): number {
  return s.counts[month]?.[itemId]?.[userId] ?? 0;
}

/** 日ごとの回数（index 0 = 1日） */
export function dailyOf(s: Snapshot, month: string, itemId: string, userId: string): number[] {
  return s.daily[month]?.[itemId]?.[userId] ?? new Array<number>(daysInMonth(month)).fill(0);
}

/** 項目の現メンバー（項目に登録した順） */
export function membersOf(s: Snapshot, item: Item): User[] {
  return item.userIds.flatMap((id) => s.users.filter((u) => u.id === id));
}

/** 項目に付いているタグ（タグ一覧の順） */
export function tagsOf(s: Snapshot, item: Item): Tag[] {
  return s.tags.filter((t) => item.tagIds.includes(t.id));
}

/** タグで絞り込んだ項目。tagId が null なら全件 */
export function itemsWithTag(s: Snapshot, tagId: string | null): Item[] {
  return tagId === null ? s.items : s.items.filter((i) => i.tagIds.includes(tagId));
}

/** ユーザーが参加している項目 */
export function itemsOf(s: Snapshot, user: User): Item[] {
  return s.items.filter((i) => i.userIds.includes(user.id));
}

export function itemTotal(s: Snapshot, month: string, item: Item): number {
  return membersOf(s, item).reduce((sum, u) => sum + countOf(s, month, item.id, u.id), 0);
}

export function userTotal(s: Snapshot, month: string, user: User): number {
  return itemsOf(s, user).reduce((sum, i) => sum + countOf(s, month, i.id, user.id), 0);
}

// ---- 更新 ----

export async function addUser(name: string, color: string): Promise<void> {
  const t = Date.now();
  await db.users.add({ id: uuid(), name, color, createdAt: t, updatedAt: t, deletedAt: null, syncedAt: 0 });
}

export async function updateUser(id: string, patch: Partial<Pick<User, 'name' | 'color'>>): Promise<void> {
  await db.users.update(id, { ...patch, updatedAt: Date.now(), syncedAt: 0 });
}

/** 論理削除し、参加していた項目のメンバーからも外す */
export async function deleteUser(id: string): Promise<void> {
  const t = Date.now();
  await db.transaction('rw', db.users, db.items, async () => {
    await db.users.update(id, { deletedAt: t, updatedAt: t, syncedAt: 0 });
    await db.items
      .filter((i) => i.userIds.includes(id))
      .modify((i) => {
        i.userIds = i.userIds.filter((u) => u !== id);
        i.updatedAt = t;
        i.syncedAt = 0;
      });
  });
}

export async function addItem(name: string, userIds: string[], tagIds: string[]): Promise<void> {
  const t = Date.now();
  // 並び替え後の sortOrder は 0, 1, 2... になるので、時刻を入れておけば新しい項目は常に末尾に来る
  await db.items.add({
    id: uuid(),
    name,
    userIds,
    tagIds,
    sortOrder: t,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    syncedAt: 0,
  });
}

/** ids の順にリストを並べ替える。順番が変わった項目だけ更新する */
export async function reorderItems(ids: string[]): Promise<void> {
  const t = Date.now();
  await db.transaction('rw', db.items, async () => {
    for (const [i, id] of ids.entries()) {
      const item = await db.items.get(id);
      if (item && item.sortOrder !== i) await db.items.update(id, { sortOrder: i, updatedAt: t, syncedAt: 0 });
    }
  });
}

export async function updateItem(
  id: string,
  patch: Partial<Pick<Item, 'name' | 'userIds' | 'tagIds'>>,
): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: Date.now(), syncedAt: 0 });
}

export async function deleteItem(id: string): Promise<void> {
  const t = Date.now();
  await db.items.update(id, { deletedAt: t, updatedAt: t, syncedAt: 0 });
}

/** タグを作る。同じ名前のタグがすでにあればそれを返す */
export async function addTag(name: string): Promise<Tag> {
  return db.transaction('rw', db.tags, async () => {
    const existing = (await db.tags.toArray()).find((t) => t.deletedAt === null && t.name === name);
    if (existing) return existing;
    const t = Date.now();
    const tag: Tag = { id: uuid(), name, sortOrder: t, createdAt: t, updatedAt: t, deletedAt: null, syncedAt: 0 };
    await db.tags.add(tag);
    return tag;
  });
}

/** itemIds の項目にタグを付ける（すでに付いている項目はそのまま） */
export async function attachTag(tagId: string, itemIds: string[]): Promise<void> {
  const t = Date.now();
  await db.transaction('rw', db.items, async () => {
    await db.items
      .where('id')
      .anyOf(itemIds)
      .modify((i) => {
        if (i.tagIds.includes(tagId)) return;
        i.tagIds = [...i.tagIds, tagId];
        i.updatedAt = t;
        i.syncedAt = 0;
      });
  });
}

export async function renameTag(id: string, name: string): Promise<void> {
  await db.tags.update(id, { name, updatedAt: Date.now(), syncedAt: 0 });
}

/** 論理削除し、付いていた項目からも外す（項目自体は残る） */
export async function deleteTag(id: string): Promise<void> {
  const t = Date.now();
  await db.transaction('rw', db.tags, db.items, async () => {
    await db.tags.update(id, { deletedAt: t, updatedAt: t, syncedAt: 0 });
    await db.items
      .filter((i) => i.tagIds.includes(id))
      .modify((i) => {
        i.tagIds = i.tagIds.filter((tagId) => tagId !== id);
        i.updatedAt = t;
        i.syncedAt = 0;
      });
  });
}

/**
 * カウントを ±1 する。増減後の回数を返す。0 回から減らそうとした場合は何もせず null を返す。
 */
export async function bump(month: string, itemId: string, userId: string, delta: 1 | -1): Promise<number | null> {
  const device = await getDeviceId();
  return db.transaction('rw', db.events, async () => {
    const events = await db.events
      .where('[month+itemId]')
      .equals([month, itemId])
      .filter((e) => e.userId === userId)
      .toArray();
    // query() と同じく、0 回のときの −1 は無視して数える
    const current = events
      .sort((a, b) => a.at - b.at)
      .reduce((n, e) => (e.delta > 0 ? n + 1 : Math.max(0, n - 1)), 0);
    if (delta < 0 && current <= 0) return null;
    await db.events.add({ id: uuid(), itemId, userId, month, delta, at: Date.now(), deviceId: device, syncedAt: 0 });
    return current + delta;
  });
}

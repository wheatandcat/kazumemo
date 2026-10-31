import { liveQuery } from 'dexie';
import { db, type Item, type User } from './db';

export type { Item, User };

/** month -> itemId -> userId -> 回数 */
export type Counts = Record<string, Record<string, Record<string, number>>>;

export type Snapshot = {
  users: User[];
  items: Item[];
  counts: Counts;
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
  const [users, items, events] = await Promise.all([
    db.users.toArray(),
    db.items.toArray(),
    months.length > 0 ? db.events.where('month').anyOf(months).toArray() : Promise.resolve([]),
  ]);
  const counts: Counts = {};
  for (const e of events) {
    const byItem = (counts[e.month] ??= {});
    const byUser = (byItem[e.itemId] ??= {});
    byUser[e.userId] = (byUser[e.userId] ?? 0) + e.delta;
  }
  return { users: alive(users), items: alive(items), counts };
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
  return Math.max(0, s.counts[month]?.[itemId]?.[userId] ?? 0);
}

/** 項目の現メンバー（項目に登録した順） */
export function membersOf(s: Snapshot, item: Item): User[] {
  return item.userIds.flatMap((id) => s.users.filter((u) => u.id === id));
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

export async function addItem(name: string, userIds: string[]): Promise<void> {
  const t = Date.now();
  await db.items.add({ id: uuid(), name, userIds, createdAt: t, updatedAt: t, deletedAt: null, syncedAt: 0 });
}

export async function updateItem(id: string, patch: Partial<Pick<Item, 'name' | 'userIds'>>): Promise<void> {
  await db.items.update(id, { ...patch, updatedAt: Date.now(), syncedAt: 0 });
}

export async function deleteItem(id: string): Promise<void> {
  const t = Date.now();
  await db.items.update(id, { deletedAt: t, updatedAt: t, syncedAt: 0 });
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
    const current = events.reduce((sum, e) => sum + e.delta, 0);
    if (delta < 0 && current <= 0) return null;
    await db.events.add({ id: uuid(), itemId, userId, month, delta, at: Date.now(), deviceId: device, syncedAt: 0 });
    return current + delta;
  });
}

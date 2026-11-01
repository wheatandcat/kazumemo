import Dexie, { type EntityTable } from 'dexie';

// 同期用の共通フィールド。syncedAt は 0 = 未送信（IndexedDB は null をインデックスできないため 0 を使う）
type SyncFields = {
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  syncedAt: number;
};

export type User = SyncFields & {
  id: string;
  name: string;
  color: string;
};

export type Item = SyncFields & {
  id: string;
  name: string;
  userIds: string[];
  /** リストでの並び順（小さいほど上） */
  sortOrder: number;
  tagIds: string[];
};

export type Tag = SyncFields & {
  id: string;
  name: string;
  /** タグ一覧での並び順（小さいほど左） */
  sortOrder: number;
};

/** カウントの増減1回分。回数はイベントの delta の合計で求める（端末間でマージしても競合しない） */
export type CountEvent = {
  id: string;
  itemId: string;
  userId: string;
  /** 'YYYY-MM' */
  month: string;
  delta: 1 | -1;
  at: number;
  deviceId: string;
  syncedAt: number;
};

export type Meta = {
  key: string;
  value: string;
};

export const db = new Dexie('kazumemo') as Dexie & {
  users: EntityTable<User, 'id'>;
  items: EntityTable<Item, 'id'>;
  tags: EntityTable<Tag, 'id'>;
  events: EntityTable<CountEvent, 'id'>;
  meta: EntityTable<Meta, 'key'>;
};

const stores = {
  users: 'id, updatedAt, syncedAt',
  items: 'id, updatedAt, syncedAt',
  events: 'id, month, [month+itemId], [month+userId], syncedAt',
  meta: 'key',
};

db.version(1).stores(stores);

// v2: 項目に sortOrder を追加。既存の項目は作成順で並べる
db.version(2)
  .stores(stores)
  .upgrade((tx) =>
    tx
      .table<Item>('items')
      .toCollection()
      .modify((item) => {
        item.sortOrder ??= item.createdAt;
      }),
  );

// v3: タグを追加。既存の項目はタグなしにする
db.version(3)
  .stores({ ...stores, tags: 'id, updatedAt, syncedAt' })
  .upgrade((tx) =>
    tx
      .table<Item>('items')
      .toCollection()
      .modify((item) => {
        item.tagIds ??= [];
      }),
  );

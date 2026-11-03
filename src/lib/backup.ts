import type { EntityTable, IDType } from 'dexie';
import { db, fillItemV2, fillItemV3, type CountEvent, type Item, type Tag, type User } from './db';

/** バックアップファイルの形式。論理削除済みの行も含め、テーブルの中身をそのまま入れる */
export type Backup = {
  app: 'kazumemo';
  /** 書き出した時点の DB バージョン（db.verno） */
  schemaVersion: number;
  exportedAt: number;
  users: User[];
  items: Item[];
  tags: Tag[];
  events: CountEvent[];
};

export type ImportResult = {
  /** 新しく追加した行数 */
  added: number;
  /** 既存より新しかったので上書きした行数 */
  updated: number;
};

export async function exportBackup(): Promise<Blob> {
  const backup = await db.transaction('r', db.users, db.items, db.tags, db.events, async () => {
    const [users, items, tags, events] = await Promise.all([
      db.users.toArray(),
      db.items.toArray(),
      db.tags.toArray(),
      db.events.toArray(),
    ]);
    return { app: 'kazumemo', schemaVersion: db.verno, exportedAt: Date.now(), users, items, tags, events } satisfies Backup;
  });
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

/** 'kazumemo-20261103.json' */
export function backupFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `kazumemo-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}.json`;
}

function parse(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON として読み込めませんでした');
  }
  const b = data as Partial<Backup> | null;
  if (b?.app !== 'kazumemo') throw new Error('かずメモのバックアップファイルではありません');
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > db.verno) {
    throw new Error('新しいバージョンのバックアップです。アプリを更新してから読み込んでください');
  }
  for (const key of ['users', 'items', 'tags', 'events'] as const) {
    const rows = b[key] ?? [];
    if (!Array.isArray(rows) || rows.some((r) => typeof r?.id !== 'string')) {
      throw new Error('バックアップファイルが壊れています');
    }
  }
  return { ...b, users: b.users ?? [], items: b.items ?? [], tags: b.tags ?? [], events: b.events ?? [] } as Backup;
}

/** users/items/tags は id ごとに updatedAt の新しい方を残す（同期と同じ後勝ち） */
async function mergeLatest<T extends { id: string; updatedAt: number; syncedAt: number }>(
  table: EntityTable<T, 'id'>,
  rows: T[],
  result: ImportResult,
): Promise<void> {
  const current = await table.bulkGet(rows.map((r) => r.id as IDType<T, 'id'>));
  const puts = rows.flatMap((row, i) => {
    const cur = current[i];
    if (cur && cur.updatedAt >= row.updatedAt) return [];
    if (cur) result.updated++;
    else result.added++;
    return [{ ...row, syncedAt: 0 }];
  });
  await table.bulkPut(puts);
}

/**
 * バックアップを今のデータにマージする。置き換えではないので、同じファイルを何度読み込んでも回数は増えない。
 */
export async function importBackup(file: File): Promise<ImportResult> {
  const b = parse(await file.text());
  // 古い形式のファイルは db.ts の upgrade と同じ補完をかける
  for (const item of b.items) {
    fillItemV2(item);
    fillItemV3(item);
  }
  const result: ImportResult = { added: 0, updated: 0 };
  await db.transaction('rw', db.users, db.items, db.tags, db.events, async () => {
    await mergeLatest(db.users, b.users, result);
    await mergeLatest(db.items, b.items, result);
    await mergeLatest(db.tags, b.tags, result);
    // イベントは追記のみなので、id が無いものだけ足す
    const current = await db.events.bulkGet(b.events.map((e) => e.id));
    const missing = b.events.filter((_, i) => !current[i]).map((e) => ({ ...e, syncedAt: 0 }));
    await db.events.bulkAdd(missing);
    result.added += missing.length;
  });
  return result;
}

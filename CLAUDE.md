# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

かずメモ：月ごとに「誰が・何を・何回やったか」を数えるスマホ向け PWA。データは端末の IndexedDB のみに保存（サーバーなし）。README とコードコメントは日本語で書かれているので、それに合わせる。

## コマンド

Node.js 22 以上。

- `npm run dev` — 開発サーバー（http://localhost:4321）。Service Worker は登録されない
- `npm run build` — `astro check`（型チェック）+ 本番ビルド。`dist/` に出力し `sw.js` を生成
- `npm run preview` — 本番ビルドの確認。Service Worker / オフライン動作の確認はこちらで行う
- `npm run deploy` — ビルドして Cloudflare Workers Static Assets にデプロイ（`wrangler.jsonc`）
- `npm run generate-pwa-assets` — `public/icon.svg` からアイコン一式を再生成（`public/` の PNG/ICO を上書きするので注意）

テスト・リンターは無い。変更の検証は `npm run build`（型チェック）で行う。

## アーキテクチャ

- **Astro 静的出力 + 素の TypeScript**。UI フレームワークは使わず、各ページ（`src/pages/**.astro`）の `<script>` で DOM を直接組み立てる。繰り返し要素は `<template>` に置き、`src/lib/render.ts` の `fromTemplate` / `part`（`[data-part="..."]` を取得）で複製・流し込みする。ユーザー色は CSS 変数 `--c` で渡す（`setColor`）。
- **静的出力なので動的ルートは無い**。詳細画面は `/users/detail/?id=...` のようにクエリで ID を受ける。Service Worker はクエリを無視して precache に当てる設定（`integrations/service-worker.mjs`）。
- **Service Worker**：`@vite-pwa/astro` が Astro 7 未対応のため、`integrations/service-worker.mjs` の Astro integration が `astro:build:done` で workbox-build の `generateSW` を直接呼んで `dist/sw.js` を作る。`public/_headers` で `sw.js` と manifest は `no-cache`。
- **データ層**：
  - `src/lib/db.ts` — Dexie のスキーマとバージョン管理。フィールド追加時は `db.version(n+1)` を足し、`upgrade` で既存レコードを補完する（既存の v2/v3 と同じ形）。
  - `src/lib/repo.ts` — 画面はここだけを経由して DB を読み書きする。`watch(months, cb)` は Dexie `liveQuery` で `Snapshot`（users/items/tags/counts/daily）を購読し、データが変わるたびに再描画する。集計ヘルパー（`countOf`, `itemTotal`, `userTotal` など）も Snapshot を引数に取る純粋関数。
- **同期を見据えたローカルファースト設計**（変更時に崩さないこと）：
  - カウントは `events` テーブルに `delta: 1 | -1` のイベントログとして追記するだけで、回数は集計で求める。集計は時刻順に +1 を積み −1 で直近を取り消す（0 回からの −1 は無視）。`bump` と `query` の数え方は一致させる。
  - users/items/tags は `updatedAt` 後勝ち、削除は `deletedAt` による論理削除。読み出し時は `alive()` で除外。
  - 書き込みでは必ず `updatedAt` を更新し `syncedAt: 0`（未送信）に戻す。IndexedDB は null をインデックスできないので未送信は `0`。
  - 項目からユーザーを外してもイベントは消さない（戻すと回数が復元される）。
  - ID は `crypto.getRandomValues` 製の UUID（LAN の http でも動くよう `randomUUID` は使わない）。
- **端末ローカルの表示状態**は同期対象にしない：選択中の月は `sessionStorage`（`month.ts`、変更は `MONTH_EVENT` の CustomEvent で通知、開き直すと今月）、選択中のタグは `localStorage`（`tagFilter.ts`）。
- 操作系ヘルパー：`longpress.ts`（タップ +1 / 500ms 長押し −1）、`sortable.ts`（長押しドラッグ並び替え）、`hscroll.ts`（タグバーの横スクロール）。
- スタイルは `src/styles/global.css` の 1 ファイル。色は `:root` のトークン。
- `design/*.dc.html` は Claude Design で作った画面デザイン（実装の参照用）。

# かずメモ

月ごとに「誰が・何を・何回やったか」をかんたんにカウントする、スマホ向けの PWA です。
洗濯・掃除・ゴミ出し・朝食準備など、家事や仕事の分担を記録できます。

https://kazumemo.wheatandcat.workers.dev

## 機能

- ユーザー登録（名前とアイコンの色）
- カウントする項目の登録（項目ごとに対象ユーザーを選択）
- リストでユーザーのアイコンを **タップで +1、長押し（500ms）で −1**
- 月ごとの集計と月の切り替え
- ユーザー詳細：今月の合計・先月との差・項目別グラフ・直近6か月の推移
- 項目詳細：ユーザー別の回数と割合・直近6か月の推移
- ホーム画面に追加してアプリとして利用、オフラインでも動作

データは端末の中（IndexedDB）にだけ保存され、サーバーには送信しません。

## 技術構成

| 用途 | 使用技術 |
|---|---|
| フレームワーク | [Astro](https://astro.build/)（静的出力）+ `<script>` 内の素の TypeScript |
| データ保存 | IndexedDB（[Dexie](https://dexie.org/)） |
| Service Worker | [workbox-build](https://developer.chrome.com/docs/workbox/)（`integrations/service-worker.mjs` でビルド後に生成） |
| ホスティング | Cloudflare Workers Static Assets |

## 開発

Node.js 22 以上が必要です。

```sh
npm install
npm run dev       # 開発サーバー（http://localhost:4321）
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバーを起動（Service Worker は登録されません） |
| `npm run build` | 型チェック（`astro check`）と本番ビルド。`dist/` に出力し `sw.js` も生成 |
| `npm run preview` | 本番ビルドをローカルで確認（Service Worker の動作確認はこちら） |
| `npm run deploy` | ビルドして Cloudflare にデプロイ |
| `npm run generate-pwa-assets` | `public/icon.svg` からアイコン一式を生成（※後述） |

## デプロイ

Cloudflare Workers の Static Assets で `dist/` を配信しています（設定は `wrangler.jsonc`）。

```sh
npx wrangler login   # 初回のみ
npm run deploy
```

`public/_headers` で `sw.js` と manifest を `no-cache` にしているため、デプロイ後にアプリを開き直すと新しい版に切り替わります。

## ディレクトリ構成

```
design/                 Claude Design で作成した画面デザイン（.dc.html）
integrations/           Service Worker を生成する Astro integration
public/                 アイコン・manifest・_headers
src/
  components/           共通コンポーネント（下部ナビ、月切替、シートなど）
  layouts/Base.astro    共通レイアウト（head、Service Worker 登録）
  lib/
    db.ts               IndexedDB のスキーマ
    repo.ts             データ操作と集計（画面はここだけを使う）
    month.ts            月（YYYY-MM）の計算と選択中の月
    longpress.ts        タップ +1 / 長押し −1 の判定
    render.ts           <template> から DOM を作る小さなヘルパー
  pages/                各画面（/、/items/new/、/items/detail/、/users/、/users/detail/）
  styles/global.css     スタイル（色は :root のトークン）
```

詳細画面は静的出力のため、`/users/detail/?id=...` のようにクエリで ID を受け取ります。

## データ設計

将来サーバーと同期できるよう、ローカルファーストの形にしています。

- **カウントは増減イベントのログ**として保存し、回数は `delta`（+1 / −1）の合計で求めます。複数端末のデータを ID で合わせるだけでマージでき、競合しません。
- ユーザー・項目は `updatedAt` による後勝ちで、削除は `deletedAt` を立てる論理削除です。
- 全レコードに `syncedAt`（`0` = 未送信）を持たせています。同期を追加するときは、未送信のレコードを送り、サーバー側の差分を取り込む処理を足すだけで済みます。
- 項目からユーザーを外してもカウントは残ります（戻すと復元されます）。

## アイコン

アイコンは `public/` に配置しています。

| ファイル | サイズ | 用途 |
|---|---|---|
| `pwa-192x192.png` / `pwa-512x512.png` | 192 / 512 | Android のホーム画面・インストール時 |
| `maskable-icon-512x512.png` | 512 | Android のアダプティブアイコン（絵柄は中央の直径約80%に収める） |
| `apple-touch-icon-180x180.png` | 180 | iPhone のホーム画面（透過なし） |
| `favicon.ico` / `icon.svg` | 48 | ブラウザのタブ |

> **注意**：`npm run generate-pwa-assets` を実行すると、これらのファイルが `public/icon.svg` から生成し直され、上書きされます。

## 注意事項

- データはブラウザ（IndexedDB）にのみ保存されます。ホーム画面のアイコンを削除したり、サイトデータを消去したりするとデータも消えます。
- iPhone では、ホーム画面に追加したアプリと Safari のデータは別々に保存されます。

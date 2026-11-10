# 旅の実績解除！ (unlock-your-trip)

旅先で、定番の名所や体験を自分から取りに行く行動を、ゲームの「実績解除！」として支える Web アプリ (PWA)。解除すべき実績が簡潔な一覧になっていて、眺めて、状況に応じて好きに選んで解除する。

- 公開中: https://unlock-your-trip.yuiseki.workers.dev
- 公開の記録の例: https://unlock-your-trip.yuiseki.workers.dev/u/yuiseki

最初の対象は大阪市で、実績は 49 件。地域ごとに分類を持ち、大阪は「近代史」「食い倒れ」「水都」「観光」の 4 つ (広島なら路面電車の「交通」のように、その土地らしい見出しを立てる)。

## できること

- 実績の一覧と地図を切り替えて眺める。一覧は分類ごとの見出しで区切り、分類ごとの達成数を出す。現在地が分かれば、まだ解除していない実績を近い順に並べ、地図に現在地を出す
- 「解除！」を押すと、端末に先に記録し、つながればサーバーに送る。電波が弱い場所でも記録は消えず、あとで送り直す。同じ実績は二重に記録されず、最初に解除した時刻が残る
- 解除の記録は `/u/<id>` で誰でも見られる

まだ無いもの: 解除の瞬間の演出、撮った写真への差し替え、他の人の登録。

## 使い方 (書き込む人)

1. 管理者から受け取った設定用のリンク (`https://unlock-your-trip.yuiseki.workers.dev/#token=...&user=...`) を、使う端末のブラウザで 1 回だけ開く。合言葉はその端末の中にだけ保存され、アドレス欄からは消える
2. Android の Chrome なら、メニューの「ホーム画面に追加」でアプリとして使える
3. 位置情報の利用を許可すると、近い順に並ぶ

設定用のリンクは合言葉そのものなので、人に見せない。

## 作り

| 部分 | 置き場所と手段 |
|---|---|
| 画面 | Vite と TypeScript。地図は MapLibre GL JS 6 系で、地図のタブを開いたときだけ読み込む |
| 背景の地図 | OpenFreeMap の Liberty スタイル。注記を日本語だけに直して使う (`src/app/style.ts`) |
| 実績の一覧 | 静的な JSON (`public/catalogues/osaka.json`)。`data/` の TSV からビルドする |
| 解除の記録 | 端末の IndexedDB に先に書き (`src/app/store.ts`)、Cloudflare Workers の API (`worker/index.ts`) を通して D1 に送る |
| 配信 | Cloudflare Workers の静的アセット。`/api/*` だけを Worker が受ける |

API:

- `POST /api/unlocks`: `Authorization: Bearer <合言葉>` を付けて `{ "unlocks": [{ "achievementId", "unlockedAt" }] }` を送る。その人の全部の記録を返す
- `GET /api/users/<id>/unlocks`: 誰でも読める

合言葉は D1 に SHA-256 のハッシュだけを置く。

## 実績の一覧の作り方

元のデータは 1 件 1 行の TSV で、ビルドのときに Web の API は呼ばない。

- `data/osaka.categories.tsv`: その地域の分類と、一覧に出す順
- `data/osaka.seed.tsv`: 実績の候補 (ID、題名、種類、分類、場所)。AI が出した定番の名所と体験
- `data/osaka.places.tsv`: 場所の座標と出どころ。Wikidata (CC0) の座標と、Wikidata に無いもの (路線の乗り場、店、商店街) は OpenStreetMap の地物を名前と種類で 1 件ずつ確かめて固定した
- `data/osaka.images.tsv`: 名所の写真 (Wikimedia Commons) の作者とライセンス

`npm run catalogue` で 3 つをつなぎ、つなげない行や範囲外の座標があれば止まる。

## 開発

```sh
npm install --legacy-peer-deps   # npm 11.3 が任意の peer 依存 (canvas) の解決で落ちるため
npm test                         # 画面の部品と Worker の API のテスト (Worker は手元の workerd で動く)
npm run build                    # 一覧のビルド、型検査、Vite のビルド
npx wrangler d1 migrations apply unlock-your-trip --local
npx wrangler dev --port 8820     # 手元で http://127.0.0.1:8820
```

書き込む人を足すには、合言葉を作り、そのハッシュを `users` に入れる。

```sh
T=$(openssl rand -hex 24)
npx wrangler d1 execute unlock-your-trip --remote --command \
  "INSERT INTO users (id, token_sha256, created_at) VALUES ('<id>', '$(printf %s "$T" | sha256sum | cut -d' ' -f1)', '$(date -u +%FT%TZ)')"
echo "https://unlock-your-trip.yuiseki.workers.dev/#token=$T&user=<id>"
```

## 出典

- 背景の地図: OpenFreeMap、© OpenMapTiles、© OpenStreetMap contributors
- 実績の場所: Wikidata (CC0)、© OpenStreetMap contributors (ODbL)
- 名所の写真: Wikimedia Commons。写真ごとの作者とライセンスは、一覧の写真の下と `data/osaka.images.tsv` にある

## ライセンス

コードは [Apache License 2.0](LICENSE)。実績の一覧のデータ (`data/`、`public/catalogues/`) は、元のデータのライセンスと出典表示に従う (Wikidata は CC0、OpenStreetMap は ODbL、写真は写真ごとの Commons のライセンス)。

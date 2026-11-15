# 旅の実績解除！ (unlock-your-trip)

旅先で、定番の名所や体験を自分から取りに行く行動を、ゲームの「実績解除！」として支える Web アプリ (PWA)。解除すべき実績が簡潔な一覧になっていて、眺めて、状況に応じて好きに選んで解除する。

- 公開中: https://trip.yuiseki.net (Workers のカスタムドメイン。前からの https://unlock-your-trip.yuiseki.workers.dev も同じものを返す)
- 大阪: https://trip.yuiseki.net/japan/kansai/osaka/
- 公開の記録の例: https://trip.yuiseki.net/u/yuiseki/japan/kansai/osaka/

旅は 6 つ。トップページ (`/`) が旅の一覧で、旅ごとに `/<国>/<地方>/<都道府県>/` のページがある。

| 旅 | URL | 実績 |
|---|---|---|
| 大阪 2026 | `/japan/kansai/osaka/` | 49 |
| マレーシア 2026 | `/malaysia/kuala-lumpur/kuala-lumpur/` | 15 |
| 広島 2026 | `/japan/chugoku/hiroshima/` | 60 |
| 長崎 2025 | `/japan/kyushu/nagasaki/` | 31 |
| 神戸 2024 | `/japan/kansai/hyogo/` | 21 |
| 沖縄 2023 | `/japan/kyushu/okinawa/` | 54 |
| コソボ 2023 | `/kosovo/prizren/prizren/` | 23 |

地域ごとに分類を持ち、大阪は「近代史」「食い倒れ」「水都」「観光」の 4 つ (広島なら路面電車の「交通」のように、その土地らしい見出しを立てる)。

## できること

- 実績の一覧と地図を切り替えて眺める。一覧は分類ごとの見出しで区切り、分類ごとの達成数を出す。実績ごとに星 1〜5 の優先度を一覧または地図の吹き出しで付けると、分類の中で星の多い順に並ぶ (同じ星なら近い順)。分類の見出しを押すと折りたためる。星は書き込む人の全部の端末で同じになる (端末に先に残し、つながったら送る。端末どうしで食い違ったら、あとから付けたほうが残る)。折りたたみはその端末の中だけに残る。現在地が分かれば、まだ解除していない実績を近い順に並べ、地図に現在地を出す
- 見出しの下に、最後に同期できた時刻を出す。同期できないときは理由を出し、未送信の記録は端末に残る
- 「解除！」を押すと、端末に先に記録し、つながればサーバーに送る。電波が弱い場所でも記録は消えず、あとで送り直す。同じ実績は二重に記録されず、最初に解除した時刻が残る
- 地域は URL の `/<国>/<地方>/<場所>/` で決まる (大阪は `/japan/kansai/osaka/`、表は `src/shared/regions.ts`)。前からの `/` と `/u/<id>` は、画面の中で大阪の URL に置き換える
- 解除の記録は `/u/<id>/japan/kansai/osaka/` で誰でも見られる
- 旅の一覧の地図では、解除済みの緑の点を未解除の点より手前に描く
- 計画中の旅も、実績を解除してサーバーに同期すると公開ページに現れ、未解除の目標も表示される。実績カタログは静的ファイルとして公開されている
- 自分が撮った写真 (Gyazo) を実績に結びつけると、名所の写真の代わりにその写真が出て、Gyazo のページにつながる。D1 には Gyazo の画像 ID だけを置き、画面は Gyazo の縮小版 (`i.gyazo.com/thumb/<幅>/<ID>-jpg.jpg`) を読む。撮影地点などのメタデータは出さない
- 写真を結びつけた実績は解除済みとして扱う。解除日時は、手動の解除日時と写真の撮影日時のうち最も早い時刻になる

まだ無いもの: 解除の瞬間の演出、撮った写真への差し替え、他の人が自分で登録すること。

## 使い方 (書き込む人)

1. 右上の「ログイン」から Google でログインする。端末ごとに 1 回ずつ。初めてのアカウントは「まだ記録先に登録されていません」と ID (`user_...`) が出るので、管理者に伝えて登録してもらう
2. Android の Chrome なら、メニューの「ホーム画面に追加」でアプリとして使える
3. 位置情報の利用を許可すると、近い順に並ぶ

一度登録を確かめた端末は、電波が無くても解除を端末に記録でき、つながったときに送る。

ログインの代わりに、管理者から受け取った設定用のリンク (`https://trip.yuiseki.net/#token=...&user=...`) を端末で 1 回開いてもよい。合言葉はその端末の中にだけ保存され、アドレス欄からは消える。設定用のリンクは合言葉そのものなので、人に見せない。

## 作り

| 部分 | 置き場所と手段 |
|---|---|
| 画面 | Vite と TypeScript。地図は MapLibre GL JS 6 系で、地図のタブを開いたときだけ読み込む。地図の現在地は MapLibre 標準の GeolocateControl (書き込む人の画面だけ) |
| 背景の地図 | OpenFreeMap の Liberty スタイル。注記を日本語だけに直して使う (`src/app/style.ts`) |
| 実績の一覧 | 静的な JSON (`public/catalogues/<地域>.json`)。`data/` の TSV からビルドする。旅の表 (名前、年、URL、範囲) は `src/shared/regions.ts` |
| ログイン | Clerk (Google)。SDK は Clerk の Frontend API から、書き込む人の画面でだけ読み込む (`src/app/auth.ts`)。Worker は Clerk の公開鍵 (JWKS) でセッショントークンを確かめ、Clerk のシークレットキーは持たない (`worker/clerk.ts`) |
| 解除の記録 | 端末の IndexedDB に先に書き (`src/app/store.ts`)、Cloudflare Workers の API (`worker/index.ts`) を通して D1 に送る |
| 配信 | Cloudflare Workers の静的アセット。`/api/*` だけを Worker が受ける |

API:

- `POST /api/unlocks`: `Authorization: Bearer <合言葉か Clerk のセッショントークン>` を付けて `{ "unlocks": [{ "achievementId", "unlockedAt" }] }` を送る。その人の全部の記録を返す
- `GET /api/users/<id>/unlocks`: 誰でも読める
- `POST /api/stars`: 同じ `Authorization` で `{ "stars": [{ "achievementId", "stars", "updatedAt" }] }` を送る。実績ごとに新しいほうを残し、その人の全部の星を返す。星は公開ページには出さない
- `GET /api/me`: 同じ `Authorization` で、記録先の ID を返す。Clerk にログインしていても登録が無ければ 403 と Clerk の ID を返す
- `GET /api/users/<id>/photos`: その人が実績に結びつけた Gyazo の写真。計画中の旅の未解除実績に付いた写真は、本人の認証付きリクエストにのみ返す
- `GET /api/config`: 画面が使う Clerk の公開キー

合言葉は D1 に SHA-256 のハッシュだけを置く。Clerk のトークンは、署名、発行元、期限、`azp` (トークンを求めたオリジン) を確かめる。許すオリジンは `wrangler.jsonc` の `CLERK_AUTHORIZED_PARTIES` にある。

Clerk は今、開発用インスタンス (`pk_test_`) で動かしている。利用者は 100 人までで、ログインの画面に「Development mode」と出る。Google のログインは Clerk の共用の資格情報で動いている。本番用に移すには、自分のドメインと Google OAuth クライアントが要る。

## 実績の一覧の作り方

元のデータは 1 件 1 行の TSV で、ビルドのときに Web の API は呼ばない。

地域ごとに 4 つの TSV がある (`<地域>` は `osaka`、`malaysia`、`hiroshima`、`nagasaki`、`kobe`、`okinawa`、`kosovo`)。

- `data/<地域>.categories.tsv`: その地域の分類と、一覧に出す順
- `data/<地域>.seed.tsv`: 実績の候補 (ID、題名、種類、分類、場所)。マレーシアは2026年9月19〜22日の Gyazo 写真、撮影位置、写真内の文字から作成。ほかの地域の由来は各地域の実績一覧を参照。店が分からない食べ物などは代表の場所に置く。ID は地域名で始める (解除と星は ID ごとに記録するため)
- `data/<地域>.places.tsv`: 場所の座標と出どころ。Wikidata (CC0) の座標と、Wikidata に無いもの (路線の乗り場、店、商店街) は OpenStreetMap の地物を名前と種類で 1 件ずつ確かめて固定した。作者が写真 (Gyazo) を結びつけた実績は、その写真の撮影地点 (EXIF の GPS) を正本にし、出どころを `gyazo:<写真の ID>` と書く。場所の名前は撮影地点の近くの地物 (自前の Overpass) から付ける
- `data/<地域>.images.tsv`: 名所の写真 (Wikimedia Commons) の作者とライセンス

`npm run catalogue` で全地域の TSV をつなぎ、つなげない行や範囲外の座標があれば止まる。

## 開発

```sh
npm install --legacy-peer-deps   # npm 11.3 が任意の peer 依存 (canvas) の解決で落ちるため
npm test                         # 画面の部品と Worker の API のテスト (Worker は手元の workerd で動く)
npm run build                    # 一覧のビルド、型検査、Vite のビルド
npx wrangler d1 migrations apply unlock-your-trip --local
npx wrangler dev --port 8820     # 手元で http://127.0.0.1:8820
```

画面の同期の流れは、2 台の端末に見立てたブラウザで通しで確かめる (`scripts/e2e/two_devices.py`)。Clerk の代わりに、手元の D1 にいる書き込む人の合言葉をセッショントークンとして渡す部品を、2 秒遅らせて読み込ませる。

```sh
E2E_TOKEN=<手元の D1 の合言葉> python3 scripts/e2e/two_devices.py
```

書き込む人を足すには、Google でログインしてもらい、画面に出た Clerk の ID を `users` に入れる。

```sh
npx wrangler d1 execute unlock-your-trip --remote --command \
  "UPDATE users SET clerk_user_id = 'user_...' WHERE id = '<id>'"
# まだ行が無い人は、使わない合言葉のハッシュで行を作る
npx wrangler d1 execute unlock-your-trip --remote --command \
  "INSERT INTO users (id, token_sha256, created_at, clerk_user_id) VALUES ('<id>', '$(openssl rand -hex 32)', '$(date -u +%FT%TZ)', 'user_...')"
```

設定用のリンクで足すには、合言葉を作り、そのハッシュを `users` に入れる。

```sh
T=$(openssl rand -hex 24)
npx wrangler d1 execute unlock-your-trip --remote --command \
  "INSERT INTO users (id, token_sha256, created_at) VALUES ('<id>', '$(printf %s "$T" | sha256sum | cut -d' ' -f1)', '$(date -u +%FT%TZ)')"
echo "https://trip.yuiseki.net/#token=$T&user=<id>"
```

## 出典

- 背景の地図: OpenFreeMap、© OpenMapTiles、© OpenStreetMap contributors
- 実績の場所: Wikidata (CC0)、© OpenStreetMap contributors (ODbL)
- 名所の写真: Wikimedia Commons。写真ごとの作者とライセンスは、一覧の写真の下と `data/<地域>.images.tsv` にある

## ライセンス

コードは [Apache License 2.0](LICENSE)。実績の一覧のデータ (`data/`、`public/catalogues/`) は、元のデータのライセンスと出典表示に従う (Wikidata は CC0、OpenStreetMap は ODbL、写真は写真ごとの Commons のライセンス)。

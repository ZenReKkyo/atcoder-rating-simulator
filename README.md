# AtCoder Rating Simulator 2

今後のコンテストのパフォーマンスを入力して、AtCoder のレーティング推移をシミュレートする Web アプリ。
依存パッケージなし・ビルド不要の静的ファイルです。

<https://zenrekkyo.github.io/atcoder-rating-simulator/>

> **本サービスについて**
>
> 「AtCoder Rating Simulator 2」は個人が独自に作成したものです。
> 以下のサービスとは**一切関係ありません**（作者・運営・コードのいずれも無関係です）。
>
> - 旧「AtCoder Rating Simulator」
> - 「AtCoder Rating Simulator(仮)」 <https://beta.kyo-pro.club/apps/rating-simulator>
>
> また、AtCoder 株式会社とも関係のない非公式のツールです。

## 使い方

```bash
# そのまま index.html を開いてもよいが、ローカルサーバ経由を推奨
python3 -m http.server 8000
# → http://localhost:8000/AtCoder_Rating_Simulator/
```

## 構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面 |
| `style.css` | スタイル |
| `rating.js` | レーティング計算式（ALGO / AHC ver.2） |
| `chart.js` | AtCoder 風レーティンググラフの SVG 描画 |
| `app.js` | UI とシミュレーション |
| `contests_heuristic.json` | ヒューリスティックコンテストの種別・重み DB |
| `tools/build_contest_db.js` | 上記 DB の生成スクリプト |
| `tools/heuristic_contest_ids.json` | 対象コンテスト ID 一覧（公式アーカイブ由来） |

## コンテスト重み DB

AHC ver.2 では各コンテストに重みがあるため、履歴 JSON を読み込んだときに
`contests_heuristic.json` から自動で判定します。

```bash
node tools/build_contest_db.js               # 再生成（ネットワークが必要）
node tools/build_contest_db.js --cached-ids  # ID 一覧はローカルのものを使う
```

**毎週月曜 06:00 JST に GitHub Actions が自動で再生成します**
（[`.github/workflows/update-contest-db.yml`](.github/workflows/update-contest-db.yml)、手動実行も可）。
差分があるときだけコミットし、push により GitHub Pages も自動で更新されます。

- 対象コンテストの ID は公式アーカイブ
  <https://atcoder.jp/contests/archive?ratedType=4> から取得（`tools/heuristic_contest_ids.json`）。
  `ahc001`〜`ahc068` のほか、`rcl-contest-2021-long`（RECRUIT 2021 増刊号）、
  `future-contest-2022-qual`（HTTF 2022 予選）、`toyota2023summer-final` も rated なヒューリスティックです。
- 開催日時・開催時間は AtCoder Problems の `contests.json` から取得し、
  **24 時間以上を長期、それ未満を短期**と判定します（実際の短期は 3.5〜6 時間、長期は 1 週間以上）。
- **unrated（`rate_change = "-"`）は収録しません。** AHC のレートは `IsRated: true` の
  コンテストのみで決まるためです。Masters 選手権予選・AWTF Heuristic・Asprocon・
  HTTF 本選などはヒューリスティックレート履歴に現れません（上位 11 名の履歴で確認）。

## 機能

- **アルゴリズム / ヒューリスティック**をタブで切り替え
- 現在のレーティングと参加回数を手入力、またはユーザー名から取得
- 今後のパフォーマンスを任意個数入力（アルゴリズムは複数行の一括入力も可）
- **逆算**（アルゴリズム）：「N 回のコンテストで目標レート X に到達する」のに必要な毎回のパフォーマンスを算出。
  1/2/3/5/10/20/30/50/100 回の一覧も同時に表示し、結果を今後のパフォーマンス欄へ反映できる
- レート帯を色分けした AtCoder 形式のグラフ + 明細テーブルで結果表示
- ヒューリスティックは開催間隔（日数）と重み（長期 1.0 / 短期 0.5）を入力し、自然減衰を反映

## 計算式

準拠資料:
[AtCoder Rating System ver.1.00](https://atcoder.jp/posts/16) /
[AHC Rating System ver.2](https://atcoder.jp/posts/1381)

### アルゴリズム

パフォーマンス $p_1,\dots,p_n$（$i=1$ が最新）に対して

$$ R_{\text{raw}} = 800\log_2\frac{\sum_i 2^{p_i/800}\cdot 0.9^i}{\sum_i 0.9^i},\qquad
   f(n) = \frac{\frac{\sqrt{1-0.81^n}}{1-0.9^n}-1}{\sqrt{19}-1}\times 1200 $$

$r = R_{\text{raw}} - f(n)$ に低レート補正 $R = 400/e^{(400-r)/400}\ (r<400)$ を適用。

この $(\text{分子},\text{分母})$ の 2 値だけで状態が閉じるため、
**現在のレートと参加回数から内部状態を厳密に復元でき、過去の履歴は不要**です（`AlgoState.fromRating`）。

### ヒューリスティック（AHC ver.2）

各コンテストの生パフォーマンス $p'$ と、直近レート対象コンテスト終了日からの経過日数 $d$ に対し

$$ p = p' + 150 - 100\cdot\frac{d}{365} $$

（＝**年あたり 100 の自然減衰**）。各エントリを仮想的に 100 個へ展開し、

$$ Q = \\{(p_i - S\ln j,\ w_i)\ |\ j = 1..100\\},\qquad S = 724.4744301 $$

これを性能の降順に並べ、重みの累積和 $s_i$ を用いて

$$ r = \sum_i q_i\left(R^{s_{i-1}} - R^{s_i}\right),\qquad R = 0.8271973364 $$

最後に低レート補正を適用。

## 制約・注意

- **ヒューリスティックの手入力モードは近似です。** AHC のレートは全パフォーマンス履歴と各コンテストの
  日付に依存するため、現在レートと参加回数だけからは一意に定まりません。手入力時は
  「全回で同一パフォーマンス・指定間隔で開催」と仮定した等価な履歴を二分探索で逆算しています。
  正確に計算したい場合は履歴 JSON を貼り付けてください。
- **ユーザー名からの自動取得はアルゴリズムのみ。** AtCoder 公式の
  `https://atcoder.jp/users/{user}/history/json` は CORS を許可していないため、ブラウザから直接は叩けません。
  アルゴリズムは CORS を許可している AtCoder Problems のプロキシ
  (`https://kenkoooo.com/atcoder/proxy/users/{user}/history/json`) を利用していますが、
  このプロキシはクエリ文字列を落とすため `?contestType=heuristic` が効きません。
  そのためヒューリスティックは JSON の手動貼り付けとしています。
- **2026 年の重みは未発表です。** 公式規定は「2024 年以前は全て 1.0」「2025 年は長期 1.0 / 短期 0.5」
  「2026 年以降は長期の年間重み合計と短期の年間重み合計がおよそ等しくなるよう調整」までで、
  2026 年の具体的な数値は 2026-07 時点で公表されていません
  （`AHC_rating_v2.pdf` は 2024-12-27 から未更新、v3 も存在せず、各コンテストページにも記載なし）。
  本 DB は 2025 年と同じ 長期 1.0 / 短期 0.5 を**暫定採用**しています。
  **自動更新はコンテスト一覧の追随のみで、重み規定の変更は検知しません。**
  公式が新しい重みを発表したら `tools/build_contest_db.js` の `weightOf()` を手で更新してください。
  2025 年はこれで長期 6.0・短期 6.0 と釣り合っていましたが、2026 年の長期／短期の開催数比が
  1:2 から外れれば別の係数になるはずで、これは導出ではなく仮定です。

## 検証

`rating.js` は公式資料の較正条件と一致することを数値的に確認済みです。

| 検査項目 | 期待値 | 実測 |
| --- | --- | --- |
| $f(1)$ | 1200 | 1200.0000 |
| $f(2)$ | 745.4 | 745.413 |
| ALGO 初参加 perf 1200 | $400/e = 147.15$ | 147.15 |
| ALGO 状態復元の往復 | 入力レートと一致 | 誤差 $<10^{-6}$ |
| AHC 初参加（重み 1） | $p - 850$ | perf 2000 → 1150 |
| AHC 1 年経過の減衰 | $-100$ | 1150 → 1050 |
| AHC 重み 0.5 × 2 回 ≡ 1.0 × 1 回 | 一致 | 完全一致 |
| AHC 逆算履歴の往復 | 入力レートと一致 | 誤差 $<10^{-6}$ |
| 逆算：0 戦から 1 回で 1200 | $1200 + f(1) = 2400$ | 2400 |
| 逆算の往復（全 25 ケース） | 目標レートと一致 | 誤差 $<10^{-6}$ |

さらに、実ユーザ 9 名の履歴 JSON（25〜65 戦）から本実装でレートを再計算し、
AtCoder が表示している実際のレートと突き合わせました。DB 未解決は 0 件、誤差は最大 0.47 で、
公式表示が整数であることを踏まえれば全員一致しています。

| ユーザ | 戦数 | 公式 | 本実装 | 差 |
| --- | ---: | ---: | ---: | ---: |
| tomerun | 61 | 2802 | 2802.47 | +0.47 |
| eijirou | 65 | 3263 | 3263.36 | +0.36 |
| terry_u16 | 65 | 3170 | 3170.40 | +0.40 |
| chokudai | 27 | 3078 | 3078.21 | +0.21 |
| rhoo | 43 | 3185 | 3184.85 | −0.15 |
| saharan | 56 | 3305 | 3305.17 | +0.17 |
| hitonanode | 41 | 3038 | 3038.07 | +0.07 |
| Psyho | 25 | 2936 | 2936.35 | +0.35 |
| montplusa | 47 | 3126 | 3125.68 | −0.32 |

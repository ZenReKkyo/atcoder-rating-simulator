#!/usr/bin/env node
"use strict";
/*
 * ヒューリスティックコンテストの種別・重み DB を生成する。
 *
 *   node tools/build_contest_db.js                      # 全部ネットワークから取得
 *   node tools/build_contest_db.js --cached-ids         # ID 一覧はローカルのものを使う
 *   node tools/build_contest_db.js path/to/contests.json --cached-ids   # 完全オフライン
 *
 * 対象コンテストの ID は AtCoder 公式アーカイブ
 *   https://atcoder.jp/contests/archive?ratedType=4
 * をページングして取得し、tools/heuristic_contest_ids.json に保存する。
 * 開催日時・開催時間は AtCoder Problems の contests.json から引く。
 *
 * unrated なコンテスト（rate_change = "-"）はレーティング計算に一切寄与しないため除外する。
 * 実際、上位ユーザ 11 人のヒューリスティック履歴を調べたところ、rate_change = "-" の
 * コンテストが IsRated = true で現れることは無かった。
 */

const fs = require("fs");
const path = require("path");

const SOURCE_URL = "https://kenkoooo.com/atcoder/resources/contests.json";
const ARCHIVE_URL = "https://atcoder.jp/contests/archive?ratedType=4";
const IDS = path.join(__dirname, "heuristic_contest_ids.json");
const OUT = path.join(__dirname, "..", "contests_heuristic.json");

/** 長期／短期の境界。短期は 3.5〜6 時間、長期は 1 週間以上なので 24 時間で切る。 */
const LONG_THRESHOLD_HOURS = 24;

/** アーカイブのページ取得間隔（ミリ秒）と上限ページ数 */
const FETCH_INTERVAL_MS = 1000;
const MAX_PAGES = 20;

/**
 * AHC Rating System ver.2 の重み規定（https://atcoder.jp/posts/1380）。
 *   2024 年以前 : 全て 1.0
 *   2025 年     : 長期 1.0 / 短期 0.5
 *   2026 年以降 : 「長期の年間重み合計と短期の年間重み合計がおよそ等しくなるよう調整」する予定
 *
 * 2026 年の具体的な数値は 2026-07 時点で未発表（AHC_rating_v2.pdf は 2024-12-27 から未更新、
 * v3 も存在せず、各コンテストページにも重みの記載は無い）。ここでは 2025 年と同じ
 * 長期 1.0 / 短期 0.5 を暫定採用する。2025 年はこれで長期 6.0・短期 6.0 と釣り合っていたが、
 * 2026 年の長期／短期の開催数比が 1:2 から外れれば別の係数になるため、これは仮定である。
 *
 * !! 公式が新しい重みを発表したら、この関数を手で更新すること。自動更新では検知できない。
 */
function weightOf(year, type) {
  if (year <= 2024) return 1.0;
  return type === "long" ? 1.0 : 0.5;
}

/** UTC+9 での "YYYY-MM-DDTHH:MM:SS+09:00" 文字列 */
function toJst(epochSeconds) {
  return new Date((epochSeconds + 9 * 3600) * 1000).toISOString().replace("Z", "+09:00");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 公式アーカイブをページングしてヒューリスティックコンテストの ID を集める */
async function fetchHeuristicIds() {
  const ids = new Set();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${ARCHIVE_URL}&page=${page}`);
    if (!res.ok) throw new Error(`${ARCHIVE_URL}&page=${page}: HTTP ${res.status}`);
    const html = await res.text();
    const found = [...html.matchAll(/href="\/contests\/([a-z0-9_-]+)"/g)]
      .map((m) => m[1])
      .filter((id) => id !== "archive"); // ナビゲーションのリンク
    if (found.length === 0) {
      console.log(`アーカイブ ${page - 1} ページ分を取得しました`);
      return [...ids].sort();
    }
    found.forEach((id) => ids.add(id));
    await sleep(FETCH_INTERVAL_MS);
  }
  throw new Error(`アーカイブが ${MAX_PAGES} ページを超えました。MAX_PAGES を見直してください`);
}

async function loadContests(arg) {
  if (arg) return JSON.parse(fs.readFileSync(arg, "utf8"));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL}: HTTP ${res.status}`);
  return res.json();
}

(async () => {
  const args = process.argv.slice(2);
  const contestsPath = args.find((a) => !a.startsWith("--"));
  const useCachedIds = args.includes("--cached-ids");

  const ids = useCachedIds
    ? JSON.parse(fs.readFileSync(IDS, "utf8"))
    : await fetchHeuristicIds();
  const meta = new Map((await loadContests(contestsPath)).map((c) => [c.id, c]));

  // contests.json 側の反映が遅れている場合、直近のコンテストが欠けることがある
  const unknown = ids.filter((id) => !meta.has(id));
  if (unknown.length) console.warn("contests.json に未反映の ID:", unknown.join(", "));

  const contests = ids
    .map((id) => meta.get(id))
    .filter((c) => c && c.rate_change && c.rate_change !== "-") // unrated は除外
    .sort((a, b) => a.start_epoch_second - b.start_epoch_second)
    .map((c) => {
      const end = toJst(c.start_epoch_second + c.duration_second);
      const hours = c.duration_second / 3600;
      const type = hours >= LONG_THRESHOLD_HOURS ? "long" : "short";
      return {
        id: c.id,
        title: c.title,
        start: toJst(c.start_epoch_second),
        end,
        durationHours: Number(hours.toFixed(2)),
        type,
        // 年は自然減衰の基準と揃えて UTC+9 の終了日で判定する
        weight: weightOf(Number(end.slice(0, 4)), type),
      };
    });

  // 無人実行での事故防止。スクレイプ失敗で DB が消し飛ぶのを防ぐ
  if (fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, "utf8")).contests;
    if (contests.length < prev.length) {
      throw new Error(
        `収録数が減っています（${prev.length} → ${contests.length}）。` +
          `取得に失敗した可能性があるため中断します`
      );
    }
    const added = contests.filter((c) => !prev.some((p) => p.id === c.id));
    console.log(added.length ? `新規: ${added.map((c) => c.id).join(", ")}` : "新規コンテストなし");
  }

  const byYear = {};
  for (const c of contests) {
    const y = c.end.slice(0, 4);
    byYear[y] = byYear[y] || { count: 0, long: 0, short: 0, totalWeight: 0 };
    byYear[y].count++;
    byYear[y][c.type]++;
    byYear[y].totalWeight = Number((byYear[y].totalWeight + c.weight).toFixed(2));
  }

  const db = {
    description: "AtCoder ヒューリスティックコンテスト（rated のみ）の種別と重み",
    ratingSystem: "AHC Rating System ver.2 (https://atcoder.jp/posts/1381)",
    sources: { contestIds: ARCHIVE_URL, schedule: SOURCE_URL },
    weightRule: {
      "-2024": "全て 1.0",
      "2025": "長期 1.0 / 短期 0.5",
      "2026-":
        "長期の年間重み合計と短期の年間重み合計がおよそ等しくなるよう調整される予定。" +
        "2026-07 時点で具体的な数値は未発表のため、2025 年と同じ 長期 1.0 / 短期 0.5 を暫定採用（仮定）。",
    },
    longThresholdHours: LONG_THRESHOLD_HOURS,
    summaryByYear: byYear,
    contests,
  };

  if (!useCachedIds) fs.writeFileSync(IDS, JSON.stringify(ids, null, 1) + "\n");
  fs.writeFileSync(OUT, JSON.stringify(db, null, 2) + "\n");

  const lines = [`${contests.length} 件を ${path.relative(process.cwd(), OUT)} に書き出しました`];
  for (const [y, s] of Object.entries(byYear)) {
    // 長期の重みは全年で 1.0 なので、長期の重み合計 = 長期の開催数
    const shortWeight = s.totalWeight - s.long;
    lines.push(
      `  ${y}: ${s.count} 戦 (長期 ${s.long} / 短期 ${s.short})  ` +
        `重み合計 ${s.totalWeight} = 長期 ${s.long.toFixed(1)} + 短期 ${shortWeight.toFixed(1)}`
    );
  }
  console.log(lines.join("\n"));

  // GitHub Actions のジョブサマリに出す
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + lines.join("\n") + "\n```\n");
  }
})();

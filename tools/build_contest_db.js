#!/usr/bin/env node
"use strict";
/*
 * ヒューリスティックコンテストの種別・重み DB を生成する。
 *
 *   node tools/build_contest_db.js                     # ネットワークから取得
 *   node tools/build_contest_db.js path/to/contests.json
 *
 * 対象コンテストの ID は AtCoder 公式のアーカイブ
 *   https://atcoder.jp/contests/archive?ratedType=4
 * から取得したものを tools/heuristic_contest_ids.json に置いてある。
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
 */
function weightOf(year, type) {
  if (year <= 2024) return 1.0;
  return type === "long" ? 1.0 : 0.5;
}

/** UTC+9 での "YYYY-MM-DDTHH:MM:SS+09:00" 文字列 */
function toJst(epochSeconds) {
  return new Date((epochSeconds + 9 * 3600) * 1000).toISOString().replace("Z", "+09:00");
}

async function loadContests(arg) {
  if (arg) return JSON.parse(fs.readFileSync(arg, "utf8"));
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`${SOURCE_URL}: HTTP ${res.status}`);
  return res.json();
}

(async () => {
  const ids = new Set(JSON.parse(fs.readFileSync(IDS, "utf8")));
  const meta = new Map((await loadContests(process.argv[2])).map((c) => [c.id, c]));

  const missing = [...ids].filter((id) => !meta.has(id) && id !== "archive");
  if (missing.length) console.warn("contests.json に存在しない ID:", missing.join(", "));

  const contests = [...ids]
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

  fs.writeFileSync(OUT, JSON.stringify(db, null, 2) + "\n");
  console.log(`${contests.length} 件を ${path.relative(process.cwd(), OUT)} に書き出しました`);
  for (const [y, s] of Object.entries(byYear)) {
    console.log(`  ${y}: ${s.count} 戦 (長期 ${s.long} / 短期 ${s.short}) 重み合計 ${s.totalWeight}`);
  }
})();

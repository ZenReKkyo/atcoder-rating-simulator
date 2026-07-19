"use strict";
/*
 * AtCoder レーティング計算式
 *
 * ALGO: "AtCoder Rating System ver.1.00" (https://atcoder.jp/posts/16)
 * AHC : "AHC Rating System ver.2"        (https://atcoder.jp/posts/1381)
 */

// ---------------------------------------------------------------- 共通

/** 低レート帯の補正。r >= 400 はそのまま、それ未満は 400/exp((400-r)/400)。 */
function lowCorrect(r) {
  return r >= 400 ? r : 400 / Math.exp((400 - r) / 400);
}

/** lowCorrect の逆関数。表示レートから補正前の値へ戻す。 */
function lowCorrectInv(R) {
  return R >= 400 ? R : 400 - 400 * Math.log(400 / R);
}

// ---------------------------------------------------------------- ALGO

/**
 * 参加回数が少ないことによる補正項 f(n)。
 * f(1) = 1200, f(∞) = 0。
 */
function algoPenalty(n) {
  if (n <= 0) return 0;
  const num = Math.sqrt(1 - Math.pow(0.81, n)) / (1 - Math.pow(0.9, n));
  return ((num - 1) / (Math.sqrt(19) - 1)) * 1200;
}

const g = (x) => Math.pow(2, x / 800);
const gInv = (y) => (800 * Math.log(y)) / Math.LN2;

/**
 * ALGO レートの内部状態。
 * num = Σ g(perf_i) * 0.9^i, den = Σ 0.9^i （i=1 が最新）。
 * この 2 値だけで以降のシミュレーションが閉じる。
 */
class AlgoState {
  constructor(num = 0, den = 0, n = 0) {
    this.num = num;
    this.den = den;
    this.n = n;
  }

  /** 表示レートと参加回数から内部状態を厳密に復元する。 */
  static fromRating(rating, n) {
    if (n <= 0) return new AlgoState(0, 0, 0);
    const raw = lowCorrectInv(rating) + algoPenalty(n);
    const den = 9 * (1 - Math.pow(0.9, n)); // Σ_{i=1..n} 0.9^i
    return new AlgoState(g(raw) * den, den, n);
  }

  /** パフォーマンス perf のコンテストを 1 回追加する。 */
  add(perf) {
    // 既存の各項は重み 0.9^i → 0.9^(i+1) へずれ、新項が 0.9^1 で入る
    this.num = 0.9 * (this.num + g(perf));
    this.den = 0.9 * (this.den + 1);
    this.n += 1;
    return this.rating();
  }

  rating() {
    if (this.n === 0) return 0;
    return lowCorrect(gInv(this.num / this.den) - algoPenalty(this.n));
  }

  clone() {
    return new AlgoState(this.num, this.den, this.n);
  }
}

// ---------------------------------------------------------------- AHC (ver.2)

const AHC_S = 724.4744301;
const AHC_R = 0.8271973364;
const AHC_VIRTUAL = 100; // 仮想エントリ j = 1..100

/**
 * AHC ver.2 のレート。
 * entries: [{perf, day, weight}]  day は任意の基準日からの経過日数（大きいほど新しい）
 * refDay : 直近レート対象コンテストの終了日。減衰はここを基準に測る。
 */
function ahcRating(entries, refDay) {
  if (entries.length === 0) return 0;

  const q = [];
  for (const e of entries) {
    const d = refDay - e.day; // 経過日数
    const base = e.perf + 150 - (100 * d) / 365; // 自然減衰: 年 100 減 + 一律 +150
    for (let j = 1; j <= AHC_VIRTUAL; j++) {
      q.push([base - AHC_S * Math.log(j), e.weight]);
    }
  }
  q.sort((a, b) => b[0] - a[0]);

  let s = 0;
  let r = 0;
  let pow = 1; // AHC_R^s
  for (const [v, w] of q) {
    const next = Math.pow(AHC_R, s + w);
    r += v * (pow - next);
    s += w;
    pow = next;
    if (pow < 1e-12) break; // 以降の寄与は無視できる
  }
  return lowCorrect(r);
}

/**
 * (現レート, 参加回数) しか分からない場合に、それと等価な仮想履歴を逆算する。
 * 全コンテストで同一パフォーマンス・重み 1、interval 日間隔で開催されたと仮定する近似。
 */
function ahcReconstruct(rating, n, interval) {
  const build = (perf) =>
    Array.from({ length: n }, (_, i) => ({
      perf,
      day: (i - (n - 1)) * interval, // 最新が day = 0
      weight: 1,
    }));

  let lo = -5000;
  let hi = 10000;
  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    if (ahcRating(build(mid), 0) < rating) lo = mid;
    else hi = mid;
  }
  return build((lo + hi) / 2);
}

// ---------------------------------------------------------------- 色

const RATING_BANDS = [
  { lo: 0, hi: 400, color: "#808080", name: "灰" },
  { lo: 400, hi: 800, color: "#804000", name: "茶" },
  { lo: 800, hi: 1200, color: "#008000", name: "緑" },
  { lo: 1200, hi: 1600, color: "#00C0C0", name: "水" },
  { lo: 1600, hi: 2000, color: "#0000FF", name: "青" },
  { lo: 2000, hi: 2400, color: "#C0C000", name: "黄" },
  { lo: 2400, hi: 2800, color: "#FF8000", name: "橙" },
  { lo: 2800, hi: 10000, color: "#FF0000", name: "赤" },
];

function ratingColor(r) {
  const band = RATING_BANDS.find((b) => r < b.hi);
  return (band || RATING_BANDS[RATING_BANDS.length - 1]).color;
}

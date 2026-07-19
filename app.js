"use strict";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- タブ

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => {
      p.classList.toggle("active", p.id === `panel-${tab.dataset.tab}`);
    });
  });
});

/** name 属性のラジオで .src-body の表示を切り替える */
function bindSource(radioName, prefix, onChange) {
  document.querySelectorAll(`input[name="${radioName}"]`).forEach((radio) => {
    radio.addEventListener("change", () => {
      document.querySelectorAll(`[id^="${prefix}-"]`).forEach((body) => {
        if (!body.classList.contains("src-body")) return;
        body.classList.toggle("hidden", body.id !== `${prefix}-${radio.value}`);
      });
      onChange();
    });
  });
}

const selectedSource = (name) =>
  document.querySelector(`input[name="${name}"]:checked`).value;

// ---------------------------------------------------------------- 共通の描画

function fmtDelta(d) {
  const r = Math.round(d);
  if (r === 0) return `<span>±0</span>`;
  return `<span class="${r > 0 ? "up" : "down"}">${r > 0 ? "+" : ""}${r}</span>`;
}

function renderSummary(container, current, final, count) {
  const diff = final - current;
  container.innerHTML = `
    <div class="item">現在<b class="rating-badge" style="color:${ratingColor(current)}">${Math.round(current)}</b></div>
    <div class="item">${count} 回後<b class="rating-badge" style="color:${ratingColor(final)}">${Math.round(final)}</b></div>
    <div class="item">変化<b class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "+" : ""}${Math.round(diff)}</b></div>`;
}

function renderTable(container, rows) {
  container.innerHTML = `
    <table>
      <thead><tr>
        <th class="name">コンテスト</th><th>パフォーマンス</th><th>レーティング</th><th>変化</th>
      </tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr class="${r.future ? "future" : ""}">
            <td class="name">${r.label}</td>
            <td>${r.perf === null ? "-" : Math.round(r.perf)}</td>
            <td class="rating-badge" style="color:${ratingColor(r.rating)}">${Math.round(r.rating)}</td>
            <td>${r.delta === null ? "-" : fmtDelta(r.delta)}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table>`;
}

// ================================================================ アルゴリズム

const algoPerfs = [1600, 1600, 1600];

function renderAlgoRows() {
  const wrap = $("algo-rows");
  wrap.innerHTML = "";
  algoPerfs.forEach((perf, i) => {
    const row = document.createElement("div");
    row.className = "perf-row";
    row.innerHTML = `
      <span class="idx">${i + 1} 回目</span>
      <input type="number" step="1" value="${perf}">
      <span class="unit">perf</span>
      <button class="btn tiny" title="削除">✕</button>`;
    row.querySelector("input").addEventListener("input", (e) => {
      algoPerfs[i] = Number(e.target.value);
      simulateAlgo();
    });
    row.querySelector("button").addEventListener("click", () => {
      algoPerfs.splice(i, 1);
      renderAlgoRows();
      simulateAlgo();
    });
    wrap.appendChild(row);
  });
}

function addAlgoRows(k) {
  const last = algoPerfs.length ? algoPerfs[algoPerfs.length - 1] : 1600;
  for (let i = 0; i < k; i++) algoPerfs.push(last);
  renderAlgoRows();
  simulateAlgo();
}

function simulateAlgo() {
  const rating = Number($("algo-rating").value) || 0;
  const count = Math.max(0, Math.floor(Number($("algo-count").value) || 0));

  const state = AlgoState.fromRating(rating, count);
  const current = count > 0 ? state.rating() : 0;

  const points = [];
  const rows = [];
  if (count > 0) {
    points.push({ rating: current, label: "現在", sub: `現在（${count} 戦）`, future: false });
    rows.push({ label: `現在（${count} 戦）`, perf: null, rating: current, delta: null, future: false });
  }

  let prev = current;
  algoPerfs.forEach((perf, i) => {
    const r = state.add(perf);
    points.push({ rating: r, label: `+${i + 1}`, sub: `${i + 1} 回目 / perf ${Math.round(perf)}`, future: true });
    rows.push({ label: `${i + 1} 回目`, perf, rating: r, delta: count > 0 || i > 0 ? r - prev : null, future: true });
    prev = r;
  });

  renderSummary($("algo-summary"), current, prev, algoPerfs.length);
  drawRatingChart($("algo-chart"), points);
  renderTable($("algo-table"), rows);
}

// ---- 逆算：N 回のコンテストで目標レートに到達するのに必要なパフォーマンス

/**
 * state から毎回同じパフォーマンス p で n 回参加したときの最終レート。
 * レートは p に対して単調増加なので二分探索で逆算できる。
 */
function ratingAfter(state, n, perf) {
  const s = state.clone();
  for (let i = 0; i < n; i++) s.add(perf);
  return s.rating();
}

function requiredPerf(state, n, target) {
  let lo = -10000;
  let hi = 30000;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (ratingAfter(state, n, mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const SOLVE_STEPS = [1, 2, 3, 5, 10, 20, 30, 50, 100];

function solveAlgoTarget() {
  const rating = Number($("algo-rating").value) || 0;
  const count = Math.max(0, Math.floor(Number($("algo-count").value) || 0));
  const target = Number($("algo-target").value) || 0;
  const n = Math.max(1, Math.floor(Number($("algo-target-n").value) || 1));
  const state = AlgoState.fromRating(rating, count);
  const current = count > 0 ? state.rating() : 0;

  const perf = requiredPerf(state, n, target);
  const out = $("algo-solve");
  out.innerHTML = `
    <div class="item">目標<b class="rating-badge" style="color:${ratingColor(target)}">${Math.round(target)}</b></div>
    <div class="item">${n} 回で到達するのに必要な毎回のパフォーマンス
      <b class="rating-badge" style="color:${ratingColor(perf)}">${Math.round(perf)}</b></div>`;

  if (count > 0 && target <= current) {
    out.insertAdjacentHTML(
      "beforeend",
      `<p class="note">目標は現在のレーティング ${Math.round(current)} 以下です。
       表示値は「そのレートを維持するのに必要なパフォーマンス」になります。</p>`
    );
  }

  // 回数ごとの必要パフォーマンス一覧
  const rows = SOLVE_STEPS.map((k) => {
    const p = requiredPerf(state, k, target);
    return `<tr class="${k === n ? "future" : ""}">
      <td class="name">${k} 回</td>
      <td class="rating-badge" style="color:${ratingColor(p)}">${Math.round(p)}</td>
      <td>${fmtDelta(p - current)}</td></tr>`;
  }).join("");
  $("algo-solve-table").innerHTML = `
    <table><thead><tr>
      <th class="name">回数</th><th>必要パフォーマンス</th><th>現在レートとの差</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

// ---- ユーザー名から取得（AtCoder Problems のプロキシは CORS を許可している）

async function fetchAlgoUser() {
  const user = $("algo-user").value.trim();
  const status = $("algo-fetch-status");
  if (!user) {
    status.className = "status error";
    status.textContent = "ユーザー名を入力してください。";
    return;
  }
  status.className = "status";
  status.textContent = "取得中…";
  try {
    const res = await fetch(
      `https://kenkoooo.com/atcoder/proxy/users/${encodeURIComponent(user)}/history/json`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const history = (await res.json()).filter((h) => h.IsRated);
    if (history.length === 0) throw new Error("Rated な参加履歴が見つかりませんでした");

    const rating = history[history.length - 1].NewRating;
    $("algo-rating").value = rating;
    $("algo-count").value = history.length;
    document.querySelector('input[name="algo-src"][value="manual"]').checked = true;
    $("algo-src-manual").classList.remove("hidden");
    $("algo-src-user").classList.add("hidden");
    status.className = "status ok";
    status.textContent = `${user}: レーティング ${rating} / ${history.length} 戦を読み込みました。`;
    simulateAlgo();
    solveAlgoTarget();
  } catch (e) {
    status.className = "status error";
    status.textContent = `取得に失敗しました（${e.message}）。手入力に切り替えてください。`;
  }
}

// ================================================================ ヒューリスティック

/** 今後のコンテスト: {perf, interval, weight} */
const heuFuture = [
  { perf: 1600, interval: 21, weight: 1 },
  { perf: 1600, interval: 21, weight: 1 },
  { perf: 1600, interval: 21, weight: 1 },
];

/** 履歴 JSON から読み込んだ過去のコンテスト: {perf, day, weight, name} */
let heuHistory = null;

/** コンテスト種別・重みの DB（contests_heuristic.json） */
let contestDB = null;

async function loadContestDB() {
  try {
    const res = await fetch("contests_heuristic.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const db = await res.json();
    db.byId = new Map(db.contests.map((c) => [c.id, c]));
    contestDB = db;
  } catch (e) {
    contestDB = null;
    console.warn("コンテスト DB を読み込めませんでした:", e.message);
  }
}

/** ContestScreenName（例 "ahc030.contest.atcoder.jp"）から重みを引く */
function lookupContest(screenName) {
  const id = String(screenName || "").split(".")[0];
  const c = contestDB && contestDB.byId.get(id);
  return c ? { weight: c.weight, type: c.type, resolved: true }
           : { weight: 1, type: null, resolved: false };
}

function renderHeuRows() {
  const wrap = $("heu-rows");
  wrap.innerHTML = "";
  heuFuture.forEach((row, i) => {
    const node = document.createElement("div");
    node.className = "perf-row";
    node.innerHTML = `
      <span class="idx">${i + 1} 回目</span>
      <input type="number" step="1" value="${row.perf}" data-k="perf">
      <span class="unit">perf /</span>
      <input type="number" step="1" min="1" value="${row.interval}" data-k="interval">
      <span class="unit">日後 /</span>
      <select data-k="weight">
        <option value="1">重み 1.0</option>
        <option value="0.5">重み 0.5</option>
      </select>
      <button class="btn tiny" title="削除">✕</button>`;
    node.querySelector("select").value = String(row.weight);
    node.querySelectorAll("[data-k]").forEach((input) => {
      input.addEventListener("input", (e) => {
        row[e.target.dataset.k] = Number(e.target.value);
        simulateHeuristic();
      });
    });
    node.querySelector("button").addEventListener("click", () => {
      heuFuture.splice(i, 1);
      renderHeuRows();
      simulateHeuristic();
    });
    wrap.appendChild(node);
  });
}

function addHeuRows(k) {
  const interval = Math.max(1, Number($("heu-default-interval").value) || 21);
  const weight = Number($("heu-default-weight").value);
  const perf = heuFuture.length ? heuFuture[heuFuture.length - 1].perf : 1600;
  for (let i = 0; i < k; i++) heuFuture.push({ perf, interval, weight });
  renderHeuRows();
  simulateHeuristic();
}

/** 過去エントリ（day は最新が 0 になるよう正規化）を返す */
function heuPastEntries() {
  if (selectedSource("heu-src") === "json" && heuHistory && heuHistory.length) {
    return heuHistory.map((h) => ({ ...h }));
  }
  const rating = Number($("heu-rating").value) || 0;
  const count = Math.max(0, Math.floor(Number($("heu-count").value) || 0));
  const interval = Math.max(1, Number($("heu-past-interval").value) || 21);
  if (count === 0) return [];
  return ahcReconstruct(rating, count, interval).map((e, i) => ({
    ...e,
    name: `過去 ${i + 1} 戦目`,
  }));
}

function simulateHeuristic() {
  const past = heuPastEntries();
  const usingHistory = selectedSource("heu-src") === "json" && heuHistory && heuHistory.length > 0;

  const entries = [];
  const points = [];
  const rows = [];
  let prev = null;

  // 過去分。履歴 JSON があるときのみ推移をグラフに出す（手入力時の過去は仮想履歴のため）
  past.forEach((e, i) => {
    entries.push(e);
    const r = ahcRating(entries, e.day);
    const isLast = i === past.length - 1;
    if (usingHistory || isLast) {
      const label = usingHistory ? String(i + 1) : "現在";
      const name =
        (e.name || `${i + 1} 戦目`) +
        (e.type ? `（${e.type === "long" ? "長期" : "短期"} 重み ${e.weight}）` : "");
      points.push({ rating: r, label, sub: name, future: false });
      rows.push({
        label: name,
        perf: usingHistory ? e.perf : null,
        rating: r,
        delta: prev === null ? null : r - prev,
        future: false,
      });
    }
    prev = r;
  });

  const current = prev === null ? 0 : prev;
  let day = past.length ? past[past.length - 1].day : 0;

  heuFuture.forEach((f, i) => {
    day += Math.max(1, f.interval);
    entries.push({ perf: f.perf, day, weight: f.weight });
    const r = ahcRating(entries, day);
    points.push({
      rating: r,
      label: `+${i + 1}`,
      sub: `${i + 1} 回目 / perf ${Math.round(f.perf)} / 重み ${f.weight}`,
      future: true,
    });
    rows.push({
      label: `${i + 1} 回目（+${day - (past.length ? past[past.length - 1].day : 0)} 日）`,
      perf: f.perf,
      rating: r,
      delta: prev === null ? null : r - prev,
      future: true,
    });
    prev = r;
  });

  renderSummary($("heu-summary"), current, prev === null ? 0 : prev, heuFuture.length);
  drawRatingChart($("heu-chart"), points);
  renderTable($("heu-table"), rows);
}

function loadHeuJson() {
  const status = $("heu-json-status");
  try {
    const data = JSON.parse($("heu-json").value);
    if (!Array.isArray(data)) throw new Error("配列ではありません");
    const rated = data.filter((h) => h.IsRated);
    if (rated.length === 0) throw new Error("Rated な参加履歴がありません");

    const times = rated.map((h) => new Date(h.EndTime).getTime());
    const latest = Math.max(...times);
    let unresolved = 0;
    heuHistory = rated.map((h, i) => {
      const info = lookupContest(h.ContestScreenName);
      if (!info.resolved) unresolved++;
      return {
        perf: h.InnerPerformance ?? h.Performance,
        day: (times[i] - latest) / 86400000, // 最新を 0 とした相対日数（負値）
        weight: info.weight,
        type: info.type,
        name: h.ContestName || h.ContestScreenName || `${i + 1} 戦目`,
      };
    });
    heuHistory.sort((a, b) => a.day - b.day);

    const total = heuHistory.reduce((s, e) => s + e.weight, 0);
    status.className = unresolved ? "status" : "status ok";
    status.textContent =
      `${heuHistory.length} 件を読み込みました（重み合計 ${total}）。` +
      (contestDB
        ? unresolved
          ? ` うち ${unresolved} 件は DB に無いため重み 1.0 として扱いました。`
          : " 重みはコンテスト DB から判定しました。"
        : " コンテスト DB を読み込めなかったため、重みはすべて 1.0 です。");
    simulateHeuristic();
  } catch (e) {
    heuHistory = null;
    status.className = "status error";
    status.textContent = `読み込みに失敗しました: ${e.message}`;
  }
}

// ---------------------------------------------------------------- イベント

$("algo-add").addEventListener("click", () => addAlgoRows(1));
$("algo-add5").addEventListener("click", () => addAlgoRows(5));
$("algo-clear").addEventListener("click", () => {
  algoPerfs.length = 0;
  renderAlgoRows();
  simulateAlgo();
});
$("algo-bulk-toggle").addEventListener("click", () => $("algo-bulk").classList.toggle("hidden"));
$("algo-bulk-apply").addEventListener("click", () => {
  const vals = $("algo-bulk-text")
    .value.split(/[\s,、]+/)
    .map(Number)
    .filter((v) => Number.isFinite(v));
  algoPerfs.length = 0;
  algoPerfs.push(...vals);
  renderAlgoRows();
  simulateAlgo();
});
["algo-rating", "algo-count"].forEach((id) =>
  $(id).addEventListener("input", () => {
    simulateAlgo();
    solveAlgoTarget();
  })
);
["algo-target", "algo-target-n"].forEach((id) =>
  $(id).addEventListener("input", solveAlgoTarget)
);
$("algo-target-apply").addEventListener("click", () => {
  const rating = Number($("algo-rating").value) || 0;
  const count = Math.max(0, Math.floor(Number($("algo-count").value) || 0));
  const n = Math.max(1, Math.floor(Number($("algo-target-n").value) || 1));
  const perf = Math.round(
    requiredPerf(AlgoState.fromRating(rating, count), n, Number($("algo-target").value) || 0)
  );
  algoPerfs.length = 0;
  for (let i = 0; i < n; i++) algoPerfs.push(perf);
  renderAlgoRows();
  simulateAlgo();
});
// 逆算欄の開閉状態を覚えておく
try {
  const card = $("algo-solve-card");
  if (localStorage.getItem("algo-solve-open") === "0") card.open = false;
  card.addEventListener("toggle", () =>
    localStorage.setItem("algo-solve-open", card.open ? "1" : "0")
  );
} catch (e) {
  // localStorage が使えない環境（file:// の一部ブラウザなど）では既定の開いた状態のまま
}

$("algo-fetch").addEventListener("click", fetchAlgoUser);
$("algo-user").addEventListener("keydown", (e) => e.key === "Enter" && fetchAlgoUser());
bindSource("algo-src", "algo-src", simulateAlgo);

$("heu-add").addEventListener("click", () => addHeuRows(1));
$("heu-add5").addEventListener("click", () => addHeuRows(5));
$("heu-clear").addEventListener("click", () => {
  heuFuture.length = 0;
  renderHeuRows();
  simulateHeuristic();
});
["heu-rating", "heu-count", "heu-past-interval"].forEach((id) =>
  $(id).addEventListener("input", simulateHeuristic)
);
$("heu-json-apply").addEventListener("click", loadHeuJson);
$("heu-open").addEventListener("click", () => {
  const user = $("heu-user").value.trim();
  if (!user) return;
  window.open(
    `https://atcoder.jp/users/${encodeURIComponent(user)}/history/json?contestType=heuristic`,
    "_blank",
    "noopener"
  );
});
bindSource("heu-src", "heu-src", simulateHeuristic);

renderAlgoRows();
simulateAlgo();
solveAlgoTarget();
renderHeuRows();
simulateHeuristic();
loadContestDB();

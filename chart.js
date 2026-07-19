"use strict";
/* AtCoder のレーティンググラフ風の描画（SVG） */

const NS = "http://www.w3.org/2000/svg";

function el(name, attrs = {}, text = null) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== null) node.textContent = text;
  return node;
}

/**
 * points: [{ index, rating, label, sub, future }]
 * container: 描画先の要素
 */
function drawRatingChart(container, points) {
  container.innerHTML = "";
  if (points.length === 0) {
    container.appendChild(
      Object.assign(document.createElement("p"), {
        className: "empty",
        textContent: "データがありません。レーティングとパフォーマンスを入力してください。",
      })
    );
    return;
  }

  const W = 900;
  const H = 420;
  const M = { top: 20, right: 20, bottom: 34, left: 52 };
  const iw = W - M.left - M.right;
  const ih = H - M.top - M.bottom;

  const ratings = points.map((p) => p.rating);
  let lo = Math.min(...ratings);
  let hi = Math.max(...ratings);
  const pad = Math.max(120, (hi - lo) * 0.25);
  lo = Math.max(0, Math.floor((lo - pad) / 100) * 100);
  hi = Math.ceil((hi + pad) / 100) * 100;
  if (hi - lo < 400) hi = lo + 400;

  const n = points.length;
  const x = (i) => (n === 1 ? M.left + iw / 2 : M.left + (i * iw) / (n - 1));
  const y = (r) => M.top + ih * (1 - (r - lo) / (hi - lo));

  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "chart",
    preserveAspectRatio: "xMidYMid meet",
  });

  // レート帯の背景
  for (const b of RATING_BANDS) {
    const top = Math.min(b.hi, hi);
    const bot = Math.max(b.lo, lo);
    if (top <= bot) continue;
    svg.appendChild(
      el("rect", {
        x: M.left,
        y: y(top),
        width: iw,
        height: y(bot) - y(top),
        fill: b.color,
        "fill-opacity": "0.16",
      })
    );
  }

  // 横グリッド + Y 軸ラベル
  const step = hi - lo > 2000 ? 400 : hi - lo > 1000 ? 200 : 100;
  for (let r = lo; r <= hi; r += step) {
    svg.appendChild(
      el("line", {
        x1: M.left, y1: y(r), x2: M.left + iw, y2: y(r),
        stroke: "#ffffff", "stroke-opacity": "0.7", "stroke-width": 1,
      })
    );
    svg.appendChild(
      el("text", { x: M.left - 8, y: y(r) + 4, "text-anchor": "end", class: "axis" }, String(r))
    );
  }

  // 枠
  svg.appendChild(
    el("rect", { x: M.left, y: M.top, width: iw, height: ih, fill: "none", stroke: "#999" })
  );

  // 現在と未来の境界
  const firstFuture = points.findIndex((p) => p.future);
  if (firstFuture > 0) {
    const bx = (x(firstFuture - 1) + x(firstFuture)) / 2;
    svg.appendChild(
      el("line", {
        x1: bx, y1: M.top, x2: bx, y2: M.top + ih,
        stroke: "#333", "stroke-width": 1.5, "stroke-dasharray": "4 4",
      })
    );
    svg.appendChild(
      el("text", { x: bx + 5, y: M.top + 14, class: "axis" }, "シミュレーション →")
    );
  }

  // 折れ線
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.rating)}`).join(" ");
  svg.appendChild(
    el("path", { d: path, fill: "none", stroke: "#666", "stroke-width": 1.6 })
  );

  // X 軸ラベル（多いときは間引く）
  const tick = Math.max(1, Math.ceil(n / 14));
  points.forEach((p, i) => {
    if (i % tick !== 0 && i !== n - 1) return;
    svg.appendChild(
      el("text", { x: x(i), y: H - 12, "text-anchor": "middle", class: "axis" }, p.label)
    );
  });

  // マーカー
  points.forEach((p, i) => {
    const c = el("circle", {
      cx: x(i), cy: y(p.rating), r: p.future ? 4.5 : 3.5,
      fill: ratingColor(p.rating), stroke: "#fff", "stroke-width": 1.5,
    });
    c.appendChild(el("title", {}, `${p.sub}\nレーティング: ${Math.round(p.rating)}`));
    svg.appendChild(c);
  });

  container.appendChild(svg);
}

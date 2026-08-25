/* ============================================================
   QuantLens Dashboard — equity chart
   依存ライブラリなし。素の SVG を組み立てる。

   重要:
   SVG のプレゼンテーション属性（fill="..." / stroke="..."）は
   CSS カスタムプロパティを解決しない。そのため下の PALETTE に
   トークンと同じ値を持たせている。tokens.css を変更したら
   ここも必ず同時に更新すること。
   ============================================================ */

export const PALETTE = {
  brand:     "#1E9EBF",  /* --brand */
  brandUi:   "#46C3DC",  /* --brand-ui */
  bench:     "#6E8090",  /* --bench */
  ink3:      "#72859A",  /* --ink-3 */
  hairline:  "#1E2833",  /* --hairline */
  hairline2: "#2A3744",  /* --hairline-2 */
  surface:   "#0F151D",  /* --surface */
  down:      "#F0625D",  /* --down */
  mono: '"IBM Plex Mono", ui-monospace, monospace',
};

const W = 1000, H = 340, M = { t: 16, r: 64, b: 34, l: 8 };
const IW = W - M.l - M.r, IH = H - M.t - M.b;

/* 資金の通貨記号。app.js が summary.json の `unit` から設定する。
   目盛り値はファンドの通貨であって株価（常に USD）ではない。 */
let FUND_SYMBOL = "¥";
export const setChartUnit = u => { FUND_SYMBOL = u === "usd" ? "$" : "¥"; };

const usd = v => FUND_SYMBOL + Math.round(v).toLocaleString("en-US");
const pct = v => (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

/** データのレンジから 1・2・2.5・5・10 系列の「きりの良い」目盛り幅を選ぶ。
    初期資金の桁が変わっても目盛り本数が破綻しないよう、固定値にはしない。 */
function niceStep(range, target) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return mult * mag;
}

/** きりの良い目盛り範囲と目盛り幅を作る */
function niceScale(values, target = 6) {
  const min = Math.min(...values), max = Math.max(...values);
  const pad = ((max - min) || Math.abs(max) * 0.1 || 1) * 0.18;
  const step = niceStep((max + pad) - (min - pad), target);
  return {
    lo: Math.floor((min - pad) / step) * step,
    hi: Math.ceil((max + pad) / step) * step,
    step,
  };
}

/** 最大ドローダウンの区間を求める（帯の描画用） */
export function maxDrawdown(series) {
  let peak = -Infinity, peakIdx = 0, dd = 0, from = 0, to = 0;
  series.forEach((v, i) => {
    if (v > peak) { peak = v; peakIdx = i; }
    const d = (v / peak - 1) * 100;
    if (d < dd) { dd = d; from = peakIdx; to = i; }
  });
  return { pct: dd, from, to };
}

/**
 * エクイティカーブを描く。
 * @param {SVGElement} svg
 * @param {HTMLElement} tooltip
 * @param {{dates:string[], portfolio:number[], benchmark:number[], benchmark_label?:string}} data
 */
export function renderEquityChart(svg, tooltip, data) {
  const { dates, portfolio, benchmark } = data;
  const n = dates.length;
  if (!n) { svg.innerHTML = ""; return; }

  const { lo, hi, step } = niceScale([...portfolio, ...benchmark]);
  const X = i => M.l + (n === 1 ? IW / 2 : (i / (n - 1)) * IW);
  const Y = v => M.t + (1 - (v - lo) / (hi - lo)) * IH;
  const path = arr => arr.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const short = d => String(d).slice(5);   // "2026-04-01" -> "04-01"

  const base = portfolio[0];
  const g = [];

  // --- グリッド（実線ヘアライン。点線は「予測」に読めるので使わない）
  for (let v = lo + step; v < hi; v += step) {
    g.push(`<line x1="${M.l}" y1="${Y(v)}" x2="${M.l + IW}" y2="${Y(v)}" stroke="${PALETTE.hairline}" stroke-width="1"/>`);
    g.push(`<text x="${M.l + IW + 10}" y="${Y(v) + 4}" fill="${PALETTE.ink3}" font-family='${PALETTE.mono}' font-size="11">${usd(v)}</text>`);
  }
  // 初期資金の基準線だけ一段強く
  g.push(`<line x1="${M.l}" y1="${Y(base)}" x2="${M.l + IW}" y2="${Y(base)}" stroke="${PALETTE.hairline2}" stroke-width="1"/>`);

  // --- 最大DD 期間の帯（KPIの最大DD数値と画面上で結びつける）
  const dd = maxDrawdown(portfolio);
  if (dd.pct < -0.5 && dd.to > dd.from) {
    const a = X(dd.from), b = X(dd.to);
    g.push(`<rect x="${a}" y="${M.t}" width="${b - a}" height="${IH}" fill="rgba(240,98,93,.055)"/>`);
    g.push(`<text x="${(a + b) / 2}" y="${M.t + 13}" text-anchor="middle" fill="${PALETTE.down}" font-family='${PALETTE.mono}' font-size="10" opacity=".85">DD ${dd.pct.toFixed(1)}%</text>`);
  }

  // --- x軸ラベル（間引き）
  const stride = Math.max(1, Math.ceil(n / 8));
  dates.forEach((d, i) => {
    if (i % stride !== 0 && i !== n - 1) return;
    g.push(`<text x="${X(i)}" y="${H - 12}" text-anchor="middle" fill="${PALETTE.ink3}" font-family='${PALETTE.mono}' font-size="11">${short(d)}</text>`);
  });

  // --- 面グラデーション（自ポートフォリオのみ）
  g.push(`<defs><linearGradient id="ql-fill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${PALETTE.brand}" stop-opacity=".26"/>
    <stop offset="100%" stop-color="${PALETTE.brand}" stop-opacity="0"/></linearGradient></defs>`);
  g.push(`<path d="${path(portfolio)} L ${X(n - 1)} ${Y(lo)} L ${X(0)} ${Y(lo)} Z" fill="url(#ql-fill)"/>`);

  // --- 線：ベンチマークを先に（後退）、自分を後に（強調）
  g.push(`<path d="${path(benchmark)}" fill="none" stroke="${PALETTE.bench}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  g.push(`<path d="${path(portfolio)}"  fill="none" stroke="${PALETTE.brand}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);

  // --- 直接ラベルは終点2つだけ（全点に数値は置かない）
  const li = n - 1;
  const pRet = (portfolio[li] / base - 1) * 100, bRet = (benchmark[li] / base - 1) * 100;
  g.push(`<circle cx="${X(li)}" cy="${Y(benchmark[li])}" r="4"   fill="${PALETTE.bench}" stroke="${PALETTE.surface}" stroke-width="2"/>`);
  g.push(`<circle cx="${X(li)}" cy="${Y(portfolio[li])}" r="4.5" fill="${PALETTE.brand}" stroke="${PALETTE.surface}" stroke-width="2"/>`);
  g.push(`<text x="${X(li) - 12}" y="${Y(portfolio[li]) - 14}" text-anchor="end" fill="${PALETTE.brandUi}" font-family='${PALETTE.mono}' font-size="12" font-weight="500">${usd(portfolio[li])} (${pct(pRet)})</text>`);
  g.push(`<text x="${X(li) - 12}" y="${Y(benchmark[li]) - 12}" text-anchor="end" fill="${PALETTE.bench}" font-family='${PALETTE.mono}' font-size="11">${data.benchmark_label || "SPY"} ${usd(benchmark[li])} (${pct(bRet)})</text>`);

  // --- ホバー層
  g.push(`<g id="ql-hover" opacity="0">
    <line id="ql-hx" y1="${M.t}" y2="${M.t + IH}" stroke="${PALETTE.hairline2}" stroke-width="1"/>
    <circle id="ql-hb" r="4"   fill="${PALETTE.bench}" stroke="${PALETTE.surface}" stroke-width="2"/>
    <circle id="ql-hp" r="4.5" fill="${PALETTE.brand}" stroke="${PALETTE.surface}" stroke-width="2"/></g>`);
  g.push(`<rect x="${M.l}" y="${M.t}" width="${IW}" height="${IH}" fill="transparent" style="cursor:crosshair"/>`);

  svg.innerHTML = g.join("");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `${dates[0]} から ${dates[li]} までの資金推移。ポートフォリオは ${usd(base)} から ${usd(portfolio[li])}（${pct(pRet)}）、${data.benchmark_label || "SPY"} は ${pct(bRet)}。`);

  // --- クロスヘア + ツールチップ（値への唯一の経路にはしない。表ビューを併設すること）
  const hover = svg.querySelector("#ql-hover");
  const wrap = svg.parentElement;
  const onMove = ev => {
    const r = svg.getBoundingClientRect();
    const sx = (ev.clientX - r.left) / r.width * W;
    let i = Math.round((sx - M.l) / IW * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    hover.setAttribute("opacity", "1");
    svg.querySelector("#ql-hx").setAttribute("x1", X(i));
    svg.querySelector("#ql-hx").setAttribute("x2", X(i));
    svg.querySelector("#ql-hp").setAttribute("cx", X(i));
    svg.querySelector("#ql-hp").setAttribute("cy", Y(portfolio[i]));
    svg.querySelector("#ql-hb").setAttribute("cx", X(i));
    svg.querySelector("#ql-hb").setAttribute("cy", Y(benchmark[i]));
    tooltip.innerHTML =
      `<div class="d">${dates[i]}</div>
       <div class="r"><span><i class="sw" style="background:var(--brand)"></i>QuantLens</span><b>${usd(portfolio[i])} (${pct((portfolio[i] / base - 1) * 100)})</b></div>
       <div class="r"><span><i class="sw" style="background:var(--bench)"></i>${data.benchmark_label || "SPY"}</span><b>${usd(benchmark[i])} (${pct((benchmark[i] / base - 1) * 100)})</b></div>`;
    tooltip.style.opacity = "1";
    const wx = X(i) / W * r.width, my = ev.clientY - r.top;
    tooltip.style.left = Math.min(Math.max(wx + 14, 0), wrap.clientWidth - tooltip.offsetWidth - 4) + "px";
    tooltip.style.top = Math.min(Math.max(my - tooltip.offsetHeight - 14, 4), wrap.clientHeight - tooltip.offsetHeight - 4) + "px";
  };
  svg.addEventListener("mousemove", onMove);
  svg.addEventListener("mouseleave", () => {
    hover.setAttribute("opacity", "0");
    tooltip.style.opacity = "0";
  });
}

/* ============================================================
   QuantLens Dashboard — renderer
   data/*.json を読み、DOM に描画する。ビルド不要（ES Modules）。
   ============================================================ */

import { renderEquityChart, setChartUnit } from "./chart.js";

const $ = s => document.querySelector(s);

/* 資金・損益額はファンドの通貨（既定は円）、株価は常に USD。
   summary.json の `unit` で切り替える。混同すると意味が壊れるので関数を分けている。 */
let FUND_SYMBOL = "¥";
const setUnit = u => { FUND_SYMBOL = u === "usd" ? "$" : "¥"; setChartUnit(u); };

const usd  = v => FUND_SYMBOL + Math.round(v).toLocaleString("en-US");
const usdS = v => (v >= 0 ? "+" : "-") + FUND_SYMBOL + Math.abs(Math.round(v)).toLocaleString("en-US");
/** 株価。実在の市場価格なので通貨は USD 固定。 */
const price = v => "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct  = v => (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%";
const pct2 = v => (v >= 0 ? "+" : "") + Number(v).toFixed(2) + "%";
const cls  = v => (v > 0 ? "pos" : v < 0 ? "neg" : "dim");
const esc  = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const PL_SCALE = 26;   // 損益バーが振り切れる％。データの実レンジに応じて調整可

/* ---------- 共通セル ---------- */

/** 損益セル：数値・符号・バーの向き・色の4重エンコード */
function plCell(p) {
  const w = Math.min(Math.abs(p) / PL_SCALE * 100, 100) / 2;
  const c = p >= 0 ? "var(--up)" : "var(--down)";
  const bar = p >= 0
    ? `<i style="left:50%;width:${w}%;background:${c}"></i>`
    : `<i style="right:50%;width:${w}%;background:${c}"></i>`;
  return `<td class="num"><span class="pl"><span class="pl-bar">${bar}</span><span class="${cls(p)}">${pct(p)}</span></span></td>`;
}

/** スコアメーター（10段階） */
function scoreCell(s) {
  let m = "";
  for (let i = 1; i <= 10; i++) m += `<span class="${i <= s ? "on" : ""}"></span>`;
  return `<td class="num"><span class="score"><span class="meter" aria-hidden="true">${m}</span><b>${s}/10</b></span></td>`;
}

function tickerCell(ticker, name) {
  return `<td><span class="tk">${esc(ticker)}</span>${name ? `<span class="tk-name">${esc(name)}</span>` : ""}</td>`;
}

function chip(kind, label) {
  return `<span class="chip ${kind}"><i class="dot"></i>${esc(label)}</span>`;
}

function fillTable(tbodySel, rows, html, emptyMsg, colspan) {
  const el = $(tbodySel);
  el.innerHTML = rows.length
    ? rows.map(html).join("")
    : `<tr><td class="empty" colspan="${colspan}">${esc(emptyMsg)}</td></tr>`;
}

/* ---------- セクション ---------- */

function renderHeader(s) {
  $("#asOf").textContent  = s.as_of;
  // 価格基準日は as_of（週のアンカー＝金曜）とは別物で、実際に採用した終値の日付。
  // 主役ではないので --ink-3 で後退させて併記する。
  $("#priceDate").innerHTML = s.price_date
    ? `価格 <b>${esc(s.price_date)}</b> 終値${s.provisional ? " · 速報" : ""}`
    : "";
  $("#period").textContent = `${s.period_start} → ${s.as_of}`;
  const c = $("#headChips");
  c.innerHTML =
    chip(s.regime === "BULL" || s.regime === "BULLISH" ? "bull" : "neutral", `REGIME: ${s.regime}`) +
    (s.entry_frozen ? chip("freeze", "LAYER 4: エントリー凍結") : "");
  document.title = `QuantLens Terminal — ${s.as_of}`;
}

function renderKpis(s) {
  const excess = s.total_return_pct - s.benchmark_return_pct;
  const tiles = [
    { label: "総資産",           value: usd(s.equity),           cls: "neu",             sub: s.provisional ? `速報値 · 初期資金 ${usd(s.initial_capital)}` : `初期資金 ${usd(s.initial_capital)}` },
    { label: "累積リターン",      value: pct2(s.total_return_pct), cls: cls(s.total_return_pct), sub: `損益 ${usdS(s.equity - s.initial_capital)}` },
    { label: "対 SPY 超過",      value: (excess >= 0 ? "+" : "") + excess.toFixed(2) + "pt", cls: cls(excess), sub: `SPY ${pct2(s.benchmark_return_pct)}` },
    { label: "最大ドローダウン",   value: pct2(s.max_drawdown_pct), cls: "neg",            sub: `${String(s.max_dd_from).slice(5)} → ${String(s.max_dd_to).slice(5)}` },
    { label: "勝率 / PF",        value: s.win_rate_pct.toFixed(1) + "%", cls: "neu",     sub: `${s.wins}勝${s.losses}敗 · PF ${s.profit_factor.toFixed(2)}` },
    { label: "保有銘柄",         value: `${s.positions} <small>/ ${s.max_positions}</small>`, cls: "neu", sub: `平均保有 ${s.avg_holding_days.toFixed(1)}日` },
  ];
  $("#kpis").innerHTML = tiles.map(t => `
    <div class="kpi">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value ${t.cls}">${t.value}</div>
      <div class="kpi-sub">${t.sub}</div>
    </div>`).join("");
}

function renderLayers(layers) {
  const kind = st => (st === "warn" ? "freeze" : st === "bad" ? "loss" : st === "ok" ? "bull" : "neutral");
  $("#layers").innerHTML = layers.map(l => `
    <div class="layer">
      <span class="layer-n">${esc(l.id)}</span>
      <div class="layer-b">
        <div class="layer-t">${esc(l.title)}${l.chip ? chip(kind(l.status), l.chip) : ""}</div>
        <div class="layer-d">${l.detail_html || esc(l.detail)}</div>
      </div>
    </div>`).join("");
}

function renderEquity(eq) {
  renderEquityChart($("#equity"), $("#tt"), eq);

  // 表ビュー（色に依存しない等価表現。ツールチップだけを値への経路にしない）
  const base = eq.portfolio[0];
  const label = eq.benchmark_label || "SPY";
  $("#equityTable").innerHTML =
    `<table><thead><tr><th>日付</th><th class="num">QuantLens</th><th class="num">累積</th><th class="num">${esc(label)}</th><th class="num">累積</th></tr></thead><tbody>` +
    eq.dates.map((d, i) => {
      const p = (eq.portfolio[i] / base - 1) * 100, b = (eq.benchmark[i] / base - 1) * 100;
      return `<tr><td class="num" style="text-align:left">${esc(d)}</td><td class="num">${usd(eq.portfolio[i])}</td><td class="num ${cls(p)}">${pct(p)}</td><td class="num dim">${usd(eq.benchmark[i])}</td><td class="num dim">${pct(b)}</td></tr>`;
    }).join("") + "</tbody></table>";

  const btn = $("#tblBtn"), box = $("#equityTable");
  btn.addEventListener("click", () => {
    const show = box.hidden;
    box.hidden = !show;
    btn.textContent = show ? "表を閉じる" : "表で見る";
    btn.setAttribute("aria-expanded", String(show));
  });
}

function renderHoldings(rows, s) {
  fillTable("#holdBody", rows, h => `
    <tr>
      ${tickerCell(h.ticker, h.name)}
      <td>${h.phase === 2 ? chip("neutral", "Phase 2") : chip("open", "Phase 1")}</td>
      <td class="num dim">${esc(h.entry_date)}</td>
      <td class="num">${h.holding_days}日</td>
      <td class="num dim">${price(h.entry_price)}</td>
      <td class="num">${price(h.current_price)}</td>
      <td class="num ${h.chg_1d == null ? "dim" : cls(h.chg_1d)}">${h.chg_1d == null ? "—" : pct(h.chg_1d)}</td>
      ${plCell(h.pl_pct)}
      <td class="num ${cls(h.pl_amount)}">${usdS(h.pl_amount)}</td>
      ${scoreCell(h.score)}
      <td class="num ${cls(h.ret_20d)}">${pct(h.ret_20d)}</td>
    </tr>`, "現在の保有ポジションはありません。", 11);

  const unreal = rows.reduce((a, h) => a + h.pl_amount, 0);
  $("#holdNote").innerHTML =
    `${rows.length}銘柄 · 含み損益 <span class="${cls(unreal)}">${usdS(unreal)}</span>` +
    (s.realized_pl != null ? ` ／ 実現損益 <span class="${cls(s.realized_pl)}">${usdS(s.realized_pl)}</span>` : "") +
    `<span class="approx">（1ポジション ${usd(s.position_size)} 換算の概算）</span>`;
}

function renderRanking(rows) {
  fillTable("#rankBody", rows, r => {
    const mv = r.prev_rank == null ? null : r.prev_rank - r.rank;   // 正＝順位上昇
    const mvHtml = mv == null
      ? `<span class="mv dim">NEW</span>`
      : `<span class="mv ${mv > 0 ? "pos" : mv < 0 ? "neg" : "dim"}">${mv > 0 ? "▲" : mv < 0 ? "▼" : "—"} ${Math.abs(mv)}</span>`;
    return `
    <tr>
      <td class="num dim">${String(r.rank).padStart(2, "0")}</td>
      ${tickerCell(r.ticker, r.name)}
      <td class="num" style="font-weight:600;color:var(--brand-ui)">${r.score}/10</td>
      <td class="num dim">${r.prev_score != null ? r.prev_score + "/10" : "—"}</td>
      <td class="num">${mvHtml}</td>
      <td>${r.held ? chip("open", "保有中") : chip("freeze", r.action || "見送り")}</td>
      <td class="cmt">${esc(r.comment)}</td>
    </tr>`;
  }, "ランキングデータがありません。", 7);
}

const TRADE_STATUS = { open: ["open", "保有中"], win: ["win", "利確"], loss: ["loss", "損切り"] };

function renderTrades(all) {
  const draw = f => fillTable("#tradeBody", all.filter(t => f === "all" || t.status === f), t => `
    <tr>
      ${tickerCell(t.ticker, t.name)}
      <td>${chip(...TRADE_STATUS[t.status] || ["neutral", t.status])}</td>
      <td class="num dim">${esc(t.entry_date)}</td>
      <td class="num dim">${t.exit_date ? esc(t.exit_date) : "—"}</td>
      <td class="num">${t.holding_days}日</td>
      <td class="num dim">${price(t.entry_price)}</td>
      <td class="num">${price(t.exit_price)}</td>
      ${plCell(t.pl_pct)}
      <td class="num ${cls(t.pl_amount)}">${usdS(t.pl_amount)}</td>
      <td class="dim" style="font-size:12px">${esc(t.reason)}</td>
    </tr>`, "該当する取引がありません。", 10);

  const count = f => (f === "all" ? all.length : all.filter(t => t.status === f).length);
  $("#tradeTabs").innerHTML = [["all", "すべて"], ["open", "保有中"], ["win", "利確"], ["loss", "損切り"]]
    .map(([f, l], i) => `<button class="tab" role="tab" aria-selected="${i === 0}" data-f="${f}">${l} ${count(f)}</button>`).join("");

  $("#tradeTabs").addEventListener("click", e => {
    const b = e.target.closest(".tab");
    if (!b) return;
    $("#tradeTabs").querySelectorAll(".tab").forEach(x => x.setAttribute("aria-selected", "false"));
    b.setAttribute("aria-selected", "true");
    draw(b.dataset.f);
  });
  draw("all");
}

function renderFooter(s) {
  $("#foot").innerHTML = [
    s.updated_at ? `<span><b>データ更新</b> ${esc(s.updated_at)}</span>` : "",
    s.position_size ? `<span><b>1ポジション</b> ${usd(s.position_size)}（概算）</span>` : "",
    `<span><b>集計</b> 手数料・税引前 / 為替変動を含まず / ${esc(s.frequency || "週次終値ベース")}</span>`,
    s.price_date
      ? (s.provisional
          ? `<span><b>価格基準日</b> ${esc(s.price_date)} 終値（USD）。総資産・累積リターン・カーブ末尾は<b>速報値</b>で、次回の週次実行（${esc(s.weekly_as_of || "")} 週の次）で確定値に置き換わります。</span>`
          : `<span><b>価格基準日</b> ${esc(s.price_date)}（基準日 ${esc(s.as_of)} の前営業日終値・USD）</span>`)
      : "",
    `<span><b>これはシミュレーションです。</b>実口座の運用実績ではありません。</span>`,
  ].filter(Boolean).join("");
}

/* ---------- 起動 ---------- */

const FILES = ["summary", "equity", "holdings", "ranking", "trades"];

async function main() {
  let data;
  try {
    const res = await Promise.all(FILES.map(async n => {
      const r = await fetch(`./data/${n}.json`, { cache: "no-cache" });
      if (!r.ok) throw new Error(`data/${n}.json — HTTP ${r.status}`);
      return r.json();
    }));
    data = Object.fromEntries(FILES.map((n, i) => [n, res[i]]));
  } catch (err) {
    $("#app").insertAdjacentHTML("afterbegin",
      `<div class="error"><b>データを読み込めませんでした。</b><br>
       <code>${esc(err.message)}</code><br>
       file:// で開くと fetch は失敗します。<code>python3 -m http.server -d docs 8000</code> で確認してください。</div>`);
    return;
  }

  const { summary, equity, holdings, ranking, trades } = data;
  setUnit(summary.unit);
  renderHeader(summary);
  renderKpis(summary);
  renderLayers(summary.layers || []);
  renderEquity(equity);
  renderHoldings(holdings, summary);
  renderRanking(ranking);
  renderTrades(trades);
  renderFooter(summary);
}

main();

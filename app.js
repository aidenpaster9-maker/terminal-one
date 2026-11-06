// Terminal One · step 1: live data, wallet balances, paper trading.
// No build step. Data: DexScreener (coins, prices) and GeckoTerminal (charts).
"use strict";

/* ============ helpers ============ */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = u => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = v => { if (!isFinite(v)) return "—"; const a = Math.abs(v), s = v < 0 ? "−" : ""; return a >= 1e9 ? s + "$" + (a / 1e9).toFixed(2) + "B" : a >= 1e6 ? s + "$" + (a / 1e6).toFixed(2) + "M" : a >= 1e3 ? s + "$" + (a / 1e3).toFixed(1) + "K" : s + "$" + a.toFixed(2); };
const px = v => { if (!(v > 0)) return "$0"; if (v >= 1) return "$" + v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 2 : 4 }); const z = -Math.floor(Math.log10(v)) - 1; return z >= 4 ? "$0.0" + "₀₁₂₃₄₅₆₇₈₉"[Math.min(9, z)] + String(Math.round(v * 10 ** (z + 4))).slice(0, 4) : "$" + v.toPrecision(3); };
const pct = v => isFinite(v) ? (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + "%" : "—";
const ago = ms => { if (!ms) return "—"; const m = (Date.now() - ms) / 60000; return m < 1 ? "now" : m < 60 ? Math.round(m) + "m" : m < 1440 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
const shortA = a => a && a.length > 12 ? a.slice(0, 4) + "…" + a.slice(-4) : a || "";
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
let toastT; function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 4200); }
function copyText(txt, label) { navigator.clipboard?.writeText(txt).then(() => toast(label + " copied."), () => toast("Couldn't copy. Select the text and copy it yourself.")); }

/* ============ chains + data sources ============ */
const DS = "https://api.dexscreener.com";
const GT = "https://api.geckoterminal.com/api/v2";
const CHAINS = {
  solana: { name: "Solana", short: "SOL", gt: "solana", ex: a => `https://solscan.io/token/${a}`, exName: "Solscan" },
  ethereum: { name: "Ethereum", short: "ETH", gt: "eth", ex: a => `https://etherscan.io/token/${a}`, exName: "Etherscan" },
  base: { name: "Base", short: "BASE", gt: "base", ex: a => `https://basescan.org/token/${a}`, exName: "BaseScan" },
  bsc: { name: "BNB Chain", short: "BNB", gt: "bsc", ex: a => `https://bscscan.com/token/${a}`, exName: "BscScan" },
};
const TFS = [["15s", "second", 15], ["30s", "second", 30], ["1m", "minute", 1], ["5m", "minute", 5], ["15m", "minute", 15], ["1h", "hour", 1], ["4h", "hour", 4], ["1d", "day", 1]];

async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
const asArr = x => Array.isArray(x) ? x : x && Array.isArray(x.pairs) ? x.pairs : x && typeof x === "object" ? [x] : [];
const keyOf = (chain, addr) => chain + ":" + String(addr).toLowerCase();

function socialUrl(s) {
  const u = safeUrl(s.url); if (u) return u;
  const h = String(s.handle || "").replace(/^@/, ""); if (!h) return null;
  const t = (s.type || s.platform || "").toLowerCase();
  if (t === "twitter" || t === "x") return "https://x.com/" + encodeURIComponent(h);
  if (t === "telegram") return "https://t.me/" + encodeURIComponent(h);
  return null;
}
function toToken(p, prof) {
  const info = p.info || {};
  const socials = (info.socials || []).map(s => ({ type: (s.type || s.platform || "link").toLowerCase(), url: socialUrl(s) })).filter(s => s.url);
  (prof?.links || []).forEach(l => { const u = safeUrl(l.url); const t = (l.type || l.label || "website").toLowerCase(); if (u && !socials.some(s => s.url === u)) socials.push({ type: t, url: u }); });
  const sites = (info.websites || []).map(w => safeUrl(w.url)).filter(Boolean);
  return {
    key: keyOf(p.chainId, p.baseToken.address), chain: p.chainId, addr: p.baseToken.address,
    name: p.baseToken.name || "Unknown", sym: p.baseToken.symbol || "?",
    icon: safeUrl(info.imageUrl || prof?.icon || ""), price: +p.priceUsd || 0,
    chg: +(p.priceChange?.h24 ?? 0), chg1: +(p.priceChange?.h1 ?? 0),
    vol: +(p.volume?.h24 || 0), liq: +(p.liquidity?.usd || 0), mcap: +(p.marketCap || p.fdv || 0),
    created: p.pairCreatedAt || null, buys: p.txns?.h24?.buys || 0, sells: p.txns?.h24?.sells || 0,
    pair: p.pairAddress, dex: p.dexId || "", url: safeUrl(p.url || ""), sites, socials,
    desc: prof?.description || "", updated: Date.now(),
  };
}
function bestPairs(pairs) {
  const m = new Map();
  for (const p of pairs) {
    if (!p || !CHAINS[p.chainId] || !p.baseToken?.address) continue;
    const k = keyOf(p.chainId, p.baseToken.address), cur = m.get(k);
    if (!cur || (p.liquidity?.usd || 0) > (cur.liquidity?.usd || 0)) m.set(k, p);
  }
  return m;
}
async function pairsForTokens(list) {
  const by = {};
  list.forEach(x => { if (CHAINS[x.chainId] && x.tokenAddress) (by[x.chainId] ||= new Set()).add(x.tokenAddress); });
  const jobs = [];
  for (const [c, set] of Object.entries(by)) {
    const a = [...set];
    for (let i = 0; i < a.length; i += 30) jobs.push(getJSON(`${DS}/tokens/v1/${c}/${a.slice(i, i + 30).join(",")}`).then(asArr).catch(() => []));
  }
  return (await Promise.all(jobs)).flat();
}

/* ============ state ============ */
const S = {
  tokens: new Map(), lists: { new: [], trending: [], search: [] }, profiles: new Map(),
  tab: "new", chain: "all", q: "", sel: null, loading: true, err: null, searching: false,
  tf: "1m", candles: [], candleNote: "", ticks: [], prev: null, hov: null,
  mode: store.get("t1-mode", "simple"), side: "buy", amt: "100", sellPct: "50", review: false,
};
const acct = store.get("t1-paper", null) || { cash: 10000, pos: {}, hist: [], start: 10000 };
const saveAcct = () => store.set("t1-paper", acct);
const FEE = 0.0075;
const tok = k => S.tokens.get(k);

/* ============ basic risk check ============ */
function check(t) {
  const out = []; let s = 100; const add = (lvl, txt, p) => { out.push({ lvl, txt }); s -= p; };
  if (t.liq < 5000) add("bad", `Very little liquidity (${usd(t.liq)}). Selling could crash the price.`, 25);
  else if (t.liq < 25000) add("warn", `Thin liquidity (${usd(t.liq)}). Large trades move the price a lot.`, 10);
  else add("ok", `Liquidity of ${usd(t.liq)}.`, 0);
  if (t.mcap > 0 && t.liq / t.mcap < 0.02) add("warn", "Liquidity is tiny compared with market cap. The price can be pushed around.", 10);
  const ageH = t.created ? (Date.now() - t.created) / 3.6e6 : null;
  if (ageH != null && ageH < 1) add("warn", "Less than an hour old. Most coins this new don't last.", 12);
  else if (ageH != null && ageH < 24) add("warn", `Only ${Math.round(ageH)} hours old.`, 5);
  else if (ageH != null) add("ok", `Trading for ${ago(t.created)}.`, 0);
  if (!t.socials.length && !t.sites.length) add("bad", "No website or socials listed. Hard to tell if anyone is behind it.", 12);
  else add("ok", "Has a website or social links.", 0);
  if (t.buys + t.sells > 20 && t.sells > t.buys * 1.5) add("warn", `More selling than buying today (${t.sells.toLocaleString()} sells vs ${t.buys.toLocaleString()} buys).`, 8);
  if (Math.abs(t.chg) > 300) add("warn", `Extreme 24h move (${pct(t.chg)}). Big pumps often reverse.`, 6);
  return { s: Math.max(3, Math.min(97, s)), out };
}
const band = s => s >= 70 ? ["s-good", "Lower risk"] : s >= 45 ? ["s-mid", "Caution"] : ["s-bad", "High risk"];

/* ============ loading ============ */
async function loadLists() {
  try {
    const [prof, boost] = await Promise.all([
      getJSON(DS + "/token-profiles/latest/v1").then(asArr),
      getJSON(DS + "/token-boosts/top/v1").then(asArr).catch(() => []),
    ]);
    prof.concat(boost).forEach(p => { if (p?.chainId && p?.tokenAddress && !S.profiles.has(keyOf(p.chainId, p.tokenAddress))) S.profiles.set(keyOf(p.chainId, p.tokenAddress), p); });
    const pairs = await pairsForTokens(prof.concat(boost));
    bestPairs(pairs).forEach((p, k) => S.tokens.set(k, toToken(p, S.profiles.get(k))));
    const keys = l => [...new Set(l.filter(x => x?.chainId && x?.tokenAddress).map(x => keyOf(x.chainId, x.tokenAddress)))].filter(k => S.tokens.has(k));
    S.lists.new = keys(prof); S.lists.trending = keys(boost);
    S.err = S.tokens.size ? null : "DexScreener didn't return any coins right now.";
  } catch (e) {
    S.err = "Couldn't reach DexScreener. Check your connection; the feed retries every minute.";
  }
  S.loading = false;
  if (!S.sel) { const first = (S.lists[S.tab].length ? S.lists[S.tab] : S.lists.trending)[0]; if (first) selectToken(first, false); }
  renderFeed(); renderMovers(); renderTicker(); if (S.sel) renderToken();
}
async function doSearch(q) {
  S.searching = true; S.tab = "search"; $("searchTab").hidden = false; setTabs(); renderFeed();
  try {
    const pairs = asArr(await getJSON(`${DS}/latest/dex/search?q=${encodeURIComponent(q)}`));
    const best = bestPairs(pairs);
    best.forEach((p, k) => S.tokens.set(k, toToken(p, S.profiles.get(k))));
    S.lists.search = [...best.keys()].sort((a, b) => tok(b).liq - tok(a).liq).slice(0, 40);
  } catch { S.lists.search = []; toast("Search failed. Try again in a moment."); }
  S.searching = false; renderFeed();
  const exact = S.lists.search.find(k => tok(k).addr.toLowerCase() === q.toLowerCase());
  if (exact) selectToken(exact);
}
async function refreshTokens(keys) {
  const list = keys.map(tok).filter(Boolean).map(t => ({ chainId: t.chain, tokenAddress: t.addr }));
  if (!list.length) return;
  const best = bestPairs(await pairsForTokens(list));
  best.forEach((p, k) => S.tokens.set(k, toToken(p, S.profiles.get(k))));
}

/* ============ chart data ============ */
async function loadCandles() {
  const t = tok(S.sel); if (!t) return;
  const tf = TFS.find(x => x[0] === S.tf), net = CHAINS[t.chain].gt;
  S.candleNote = "";
  try {
    const d = await getJSON(`${GT}/networks/${net}/pools/${t.pair}/ohlcv/${tf[1]}?aggregate=${tf[2]}&limit=120&currency=usd`);
    const list = d?.data?.attributes?.ohlcv_list || [];
    if (S.sel !== t.key) return;
    S.candles = list.map(r => ({ t: r[0] * 1000, o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] })).sort((a, b) => a.t - b.t);
    if (!S.candles.length) S.candleNote = "No candles for this timeframe yet. Showing live price ticks instead.";
  } catch {
    if (S.sel !== t.key) return;
    S.candles = [];
    S.candleNote = tf[1] === "second" ? `${S.tf} candles aren't available from the free chart data. Pick 1m or longer.` : "Chart data isn't available for this coin right now. Showing live price ticks instead.";
  }
  drawChart(); const n = $("chartNote"); if (n) n.textContent = S.candleNote;
}

/* ============ header + nav ============ */
const chainSeg = $("chainSeg");
[["all", "All"], ["solana", "SOL"], ["ethereum", "ETH"], ["base", "Base"], ["bsc", "BNB"]].forEach(([k, l]) => {
  const b = document.createElement("button"); b.textContent = l; b.dataset.c = k; b.setAttribute("aria-pressed", String(k === S.chain));
  b.onclick = () => { S.chain = k; chainSeg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.c === k))); renderFeed(); };
  chainSeg.appendChild(b);
});
function setTabs() { document.querySelectorAll(".feedtabs [data-tab]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === S.tab))); }
document.querySelectorAll(".feedtabs [data-tab]").forEach(b => b.onclick = () => { S.tab = b.dataset.tab; setTabs(); renderFeed(); });
function setMode(m) { S.mode = m; store.set("t1-mode", m); document.body.classList.toggle("pro", m === "pro"); $("m-simple").setAttribute("aria-pressed", String(m === "simple")); $("m-pro").setAttribute("aria-pressed", String(m === "pro")); drawChart(); }
$("m-simple").onclick = () => setMode("simple"); $("m-pro").onclick = () => setMode("pro");
let qT;
$("q").addEventListener("input", e => { clearTimeout(qT); const v = e.target.value.trim(); if (v.length < 2) return; qT = setTimeout(() => { if (location.hash !== "#coins" && location.hash !== "") location.hash = "coins"; doSearch(v); }, 400); });
$("q").addEventListener("keydown", e => { if (e.key === "Enter") { clearTimeout(qT); const v = e.target.value.trim(); if (v.length >= 2) { location.hash = "coins"; doSearch(v); } } });

/* ============ feed, movers, ticker ============ */
const avHTML = t => `<span class="av" style="background:#333">${t.icon ? `<img src="${esc(t.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(t.sym.slice(0, 2).toUpperCase())}</span>`;
function renderFeed() {
  const ul = $("feed");
  if (S.loading || S.searching) { ul.innerHTML = `<li class="note" style="padding:20px 10px">${S.searching ? "Searching…" : "Loading live coins…"}</li>`; $("feedCount").textContent = ""; return; }
  if (S.err && !S.tokens.size) { ul.innerHTML = `<li style="padding:20px 10px;display:grid;gap:10px"><span class="limitwarn">${esc(S.err)}</span><button class="btn" id="retry">Try again</button></li>`; $("retry").onclick = () => { S.loading = true; renderFeed(); loadLists(); }; return; }
  const list = S.lists[S.tab].map(tok).filter(t => t && (S.chain === "all" || t.chain === S.chain));
  $("feedCount").textContent = list.length + (S.tab === "search" ? " results" : " coins");
  if (!list.length) { ul.innerHTML = `<li class="note" style="padding:20px 10px">${S.tab === "search" ? "No coins match. Check the spelling or paste the full contract address." : "No coins on this chain in this list right now."}</li>`; return; }
  ul.innerHTML = list.map(t => { const [b] = band(check(t).s); return `<li><button class="row" data-k="${esc(t.key)}" aria-current="${t.key === S.sel}">
    ${avHTML(t)}<span style="min-width:0"><div class="tname">${esc(t.name)} <span class="muted" style="font-weight:400">${esc(t.sym)}</span></div>
    <div class="tmeta"><span class="chain">${CHAINS[t.chain].short}</span><span class="num">${usd(t.mcap)}</span><span>${ago(t.created)}</span></div></span>
    <span class="right"><div class="score ${b}" title="Basic risk check, higher is safer">${check(t).s}</div><div class="num ${t.chg >= 0 ? "up" : "down"}" style="font-size:12px;margin-top:3px">${pct(t.chg)}</div></span></button></li>`; }).join("");
  ul.querySelectorAll(".row").forEach(r => r.onclick = () => { selectToken(r.dataset.k); if (matchMedia("(max-width:780px)").matches) $("tokenPane").scrollIntoView({ block: "start" }); });
}
function renderMovers() {
  const el = $("movers"); const all = [...S.tokens.values()].filter(t => t.liq >= 1000);
  if (!all.length) { el.innerHTML = ""; return; }
  const g = all.filter(t => t.chg > 0).sort((a, b) => b.chg - a.chg).slice(0, 5), l = all.filter(t => t.chg < 0).sort((a, b) => a.chg - b.chg).slice(0, 5), a = [...all].sort((x, y) => y.vol - x.vol).slice(0, 5);
  const row = (t, val, cls, extra) => `<button class="mrow" data-k="${esc(t.key)}">${avHTML(t)}<span style="min-width:0"><span class="mname"><b>${esc(t.name)}</b> <span class="muted">${esc(t.sym)}</span></span><span class="tmeta"><span class="chain">${CHAINS[t.chain].short}</span><span class="num">${px(t.price)}</span>${extra || ""}</span></span><span class="num mval ${cls}">${val}</span></button>`;
  const col = (k, title, sub, rows) => `<section class="pane mcol mcol-${k}" aria-label="${title}"><div class="pane-h"><h3>${title}</h3><span class="label">${sub}</span></div><div class="mlist">${rows || '<div class="note" style="padding:12px 16px">Nothing here right now.</div>'}</div></section>`;
  el.innerHTML = col("g", "Daily gainers", "24h change", g.map(t => row(t, pct(t.chg), "up")).join("")) + col("l", "Daily losers", "24h change", l.map(t => row(t, pct(t.chg), "down")).join("")) + col("a", "Most active", "24h volume", a.map((t, i) => row(t, usd(t.vol), "", S.lists.trending.includes(t.key) ? `<span class="trend">Trending</span>` : "")).join(""));
  el.querySelectorAll("[data-k]").forEach(b => b.onclick = () => selectToken(b.dataset.k));
}
function renderTicker() {
  const ks = (S.lists.trending.length ? S.lists.trending : S.lists.new).slice(0, 14).map(tok).filter(Boolean);
  if (!ks.length) { $("ttrack").innerHTML = `<div class="half"><span class="tk">Waiting for live data…</span></div>`; return; }
  const half = dup => `<div class="half"${dup ? ' aria-hidden="true"' : ""}>` + ks.map(t => `<button data-k="${esc(t.key)}"${dup ? ' tabindex="-1"' : ""}><b>${esc(t.sym)}</b> ${px(t.price)} <span class="${t.chg >= 0 ? "up" : "down"}">${t.chg >= 0 ? "▲" : "▼"} ${Math.abs(t.chg).toFixed(1)}%</span></button>`).join("") + `</div>`;
  $("ttrack").innerHTML = half(false) + half(true);
}
$("ttrack").onclick = e => { const b = e.target.closest("[data-k]"); if (b) { location.hash = "coins"; selectToken(b.dataset.k); } };

/* ============ token detail ============ */
function selectToken(k, load = true) {
  if (!tok(k)) return;
  S.sel = k; S.candles = []; S.ticks = []; S.prev = tok(k).price; S.review = false; S.hov = null;
  renderFeed(); renderToken(); renderTicket();
  if (load) { loadCandles(); refreshTokens([k]).then(() => { if (S.sel === k) updateLive(); }); } else loadCandles();
}
function renderToken() {
  const t = tok(S.sel), el = $("tokenPane");
  if (!t) { el.innerHTML = `<div class="empty"><h2>${S.loading ? "Loading live coins…" : "Pick a coin"}</h2><p>${S.loading ? "Pulling the latest launches from DexScreener." : "Choose a coin from the feed or search by name or contract address."}</p></div>`; return; }
  const c = check(t), [b, lbl] = band(c.s), ch = CHAINS[t.chain];
  const links = [...t.sites.map(u => ({ type: "website", url: u })), ...t.socials].slice(0, 6);
  el.innerHTML = `
  <div class="thead">
    ${avHTML(t).replace('class="av"', 'class="av" style="width:46px;height:46px;font-size:16px"')}
    <div style="min-width:0"><div class="label">${ch.name} · ${esc(t.dex)} · listed ${ago(t.created)} ago</div><h1>${esc(t.name)} <span class="muted">${esc(t.sym)}</span></h1></div>
    <div class="spacer"></div>
    <div class="right"><div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><span class="parrow ${t.chg >= 0 ? "up" : "down"}" id="liveArrow" aria-hidden="true">${t.chg >= 0 ? "▲" : "▼"}</span><div class="price num" id="livePrice">${px(t.price)}</div></div>
      <div class="num"><span class="${t.chg >= 0 ? "up" : "down"}" id="liveChg">${pct(t.chg)} 24h</span><span class="ptick muted" id="liveDelta"></span></div></div>
  </div>
  <div class="cabar"><span class="label">CA</span><code class="ca" id="caText">${esc(t.addr)}</code><button class="btn sm" id="copyCA">Copy</button>
    <a class="btn sm" href="${esc(ch.ex(t.addr))}" target="_blank" rel="noopener noreferrer">${ch.exName} ↗</a>${t.url ? `<a class="btn sm" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">DexScreener ↗</a>` : ""}</div>
  <div class="socials">${links.length ? links.map(l => `<a class="soc" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.type === "twitter" ? "X" : l.type.charAt(0).toUpperCase() + l.type.slice(1))} ↗</a>`).join("") : `<span class="soc no">No links listed</span>`}</div>
  <div class="stats">
    <div><div class="label">Market cap</div><div class="v" id="stMcap">${usd(t.mcap)}</div></div>
    <div><div class="label">Liquidity</div><div class="v" id="stLiq">${usd(t.liq)}</div></div>
    <div><div class="label">24h volume</div><div class="v" id="stVol">${usd(t.vol)}</div></div>
    <div><div class="label">24h trades</div><div class="v" id="stTx"><span class="up">${t.buys.toLocaleString()}</span> / <span class="down">${t.sells.toLocaleString()}</span></div></div>
    <div><div class="label">Risk check</div><div class="v" style="display:flex;gap:6px;align-items:center"><span class="score ${b}">${c.s}</span><span style="font-family:var(--body);font-size:12.5px">${lbl}</span></div></div>
  </div>
  <div class="chartwrap">
    <div class="charttools"><span class="label">Price · ${S.tf} candles</span>
      <div class="seg" role="group" aria-label="Timeframe">${TFS.map(([f]) => `<button data-tf="${f}" aria-pressed="${f === S.tf}">${f}</button>`).join("")}</div></div>
    <canvas id="chart" aria-label="Price chart for ${esc(t.name)}"></canvas>
    <div class="note" id="chartNote" style="min-height:1.4em">${esc(S.candleNote)}</div>
  </div>
  <div class="cols">
    <div><div class="label" style="margin-bottom:8px">Basic risk check</div>
      <ul class="factors">${c.out.map(r => `<li><span class="ic ${r.lvl}" aria-label="${r.lvl === "ok" ? "Pass" : r.lvl === "warn" ? "Caution" : "Fail"}">${r.lvl === "ok" ? "✓" : "!"}</span><span>${esc(r.txt)}</span></li>`).join("")}</ul>
      <div class="method">Built from market data only. Holder, creator and bundle checks arrive in a later version. Not financial advice.</div></div>
    <div><div class="label" style="margin-bottom:8px">About</div><p style="margin:0">${t.desc ? esc(t.desc.slice(0, 400)) + (t.desc.length > 400 ? "…" : "") : "The creator hasn't added a description."}</p></div>
  </div>`;
  $("copyCA").onclick = () => copyText(t.addr, "Contract address");
  el.querySelectorAll("[data-tf]").forEach(x => x.onclick = () => { S.tf = x.dataset.tf; S.hov = null; renderToken(); loadCandles(); });
  const cv = $("chart");
  cv.onmousemove = e => { const r = cv.getBoundingClientRect(); S.hov = { x: e.clientX - r.left, y: e.clientY - r.top }; drawChart(); };
  cv.onmouseleave = () => { S.hov = null; drawChart(); };
  requestAnimationFrame(drawChart);
}
function updateLive() {
  const t = tok(S.sel); if (!t) return;
  const before = S.prev ?? t.price; S.prev = t.price;
  S.ticks.push({ t: Date.now(), c: t.price }); if (S.ticks.length > 300) S.ticks.shift();
  const last = S.candles[S.candles.length - 1]; if (last && t.price > 0) { last.c = t.price; last.h = Math.max(last.h, t.price); last.l = Math.min(last.l, t.price); }
  const set = (id, v) => { const e = $(id); if (e) e.innerHTML = v; };
  const lp = $("livePrice"); if (lp) { lp.textContent = px(t.price); if (t.price !== before) { lp.classList.remove("flash-up", "flash-down"); void lp.offsetWidth; lp.classList.add(t.price > before ? "flash-up" : "flash-down"); } }
  const ar = $("liveArrow"); if (ar && t.price !== before) { const u = t.price > before; ar.textContent = u ? "▲" : "▼"; ar.className = "parrow " + (u ? "up" : "down"); set("liveDelta", ` · last move ${pct((t.price / before - 1) * 100)}`); }
  set("liveChg", `${pct(t.chg)} 24h`); set("stMcap", usd(t.mcap)); set("stLiq", usd(t.liq)); set("stVol", usd(t.vol));
  set("stTx", `<span class="up">${t.buys.toLocaleString()}</span> / <span class="down">${t.sells.toLocaleString()}</span>`);
  drawChart(); if (S.review) quote();
}

/* ============ chart ============ */
function setupCanvas(cv) { const d = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return null; cv.width = W * d; cv.height = H * d; const g = cv.getContext("2d"); g.scale(d, d); g.font = "12px " + (css("--mono") || "monospace"); g.textBaseline = "middle"; return { g, W, H }; }
function drawChart() {
  const cv = $("chart"); if (!cv || $("view-coins").hidden) return; const c = setupCanvas(cv); if (!c) return; const { g, W, H } = c;
  const line = css("--line"), mut = css("--muted"), up = css("--up"), dn = css("--down"), acc = css("--accent");
  const candles = S.candles.length ? S.candles : null, ticks = S.ticks.length > 1 ? S.ticks : null;
  if (!candles && !ticks) { g.fillStyle = mut; g.textAlign = "center"; g.fillText(S.candleNote ? "Waiting for live price ticks…" : "Loading chart…", W / 2, H / 2); return; }
  const padR = 78, padB = 26, padT = 12, volH = S.mode === "pro" && candles ? 42 : 0, cw = W - padR, ch = H - padB - padT - volH;
  const view = candles ? candles.slice(-Math.max(20, Math.min(120, Math.floor(cw / 8)))) : ticks;
  const hi = Math.max(...view.map(x => x.h ?? x.c)), lo = Math.min(...view.map(x => x.l ?? x.c)), pd = (hi - lo) * .08 || hi * .01, top = hi + pd, bot = lo - pd;
  const y = v => padT + (top - v) / (top - bot) * ch;
  for (let i = 0; i < 4; i++) { const v = bot + (top - bot) * (i + .5) / 4, yy = y(v); g.strokeStyle = line; g.globalAlpha = .4; g.beginPath(); g.moveTo(0, yy); g.lineTo(cw, yy); g.stroke(); g.globalAlpha = 1; g.fillStyle = mut; g.fillText(px(v), cw + 8, yy); }
  const slot = cw / Math.max(1, candles ? view.length : view.length - 1), X = i => candles ? i * slot + slot / 2 : i * slot;
  const span = view[view.length - 1].t - view[0].t;
  const fmt = ts => { const d = new Date(ts); return span > 2 * 864e5 ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : span > 6 * 3.6e6 ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" }) : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
  g.textAlign = "center"; g.fillStyle = mut; const nl = Math.max(2, Math.min(5, Math.floor(cw / 150)));
  for (let j = 0; j < nl; j++) { const i = Math.round((view.length - 1) * (j + .5) / nl); g.fillText(fmt(view[i].t), X(i), H - 11); }
  g.textAlign = "left";
  if (candles) {
    const bw = Math.max(2, Math.min(12, slot * .62)), vmax = Math.max(...view.map(x => x.v || 0), 1);
    view.forEach((k, i) => { const x = X(i), col = k.c >= k.o ? up : dn; g.strokeStyle = col; g.fillStyle = col; g.beginPath(); g.moveTo(Math.round(x) + .5, y(k.h)); g.lineTo(Math.round(x) + .5, y(k.l)); g.stroke(); g.fillRect(x - bw / 2, y(Math.max(k.o, k.c)), bw, Math.max(1.5, Math.abs(y(k.o) - y(k.c)))); if (volH) { g.globalAlpha = .28; const vh = (k.v || 0) / vmax * (volH - 8); g.fillRect(x - bw / 2, padT + ch + volH - vh, bw, vh); g.globalAlpha = 1; } });
  } else {
    const col = view[view.length - 1].c >= view[0].c ? up : dn;
    g.beginPath(); view.forEach((k, i) => i ? g.lineTo(X(i), y(k.c)) : g.moveTo(X(i), y(k.c))); g.strokeStyle = col; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
  }
  const last = view[view.length - 1].c, ly = y(last);
  g.setLineDash([3, 3]); g.strokeStyle = acc; g.beginPath(); g.moveTo(0, ly); g.lineTo(cw, ly); g.stroke(); g.setLineDash([]);
  g.fillStyle = acc; g.fillRect(cw + 2, ly - 11, padR - 4, 22); g.fillStyle = "#fff"; g.fillText(px(last), cw + 8, ly);
  const h = S.hov;
  if (h && h.x >= 0 && h.x < cw) {
    const i = Math.min(view.length - 1, Math.max(0, Math.round(candles ? (h.x - slot / 2) / slot : h.x / slot))), k = view[i], x = X(i);
    g.save(); g.strokeStyle = mut; g.globalAlpha = .7; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, padT); g.lineTo(x, padT + ch + volH); if (h.y >= padT && h.y <= padT + ch) { g.moveTo(0, h.y); g.lineTo(cw, h.y); } g.stroke(); g.restore();
    const txt = candles ? `${fmt(k.t)}   O ${px(k.o)}  H ${px(k.h)}  L ${px(k.l)}  C ${px(k.c)}` : `${fmt(k.t)}   ${px(k.c)}`;
    const tw = g.measureText(txt).width + 16; g.fillStyle = css("--panel"); g.globalAlpha = .94; g.fillRect(4, padT, tw, 22); g.globalAlpha = 1; g.strokeStyle = line; g.strokeRect(4.5, padT + .5, tw - 1, 21); g.fillStyle = (k.c >= (k.o ?? k.c)) ? up : dn; g.fillText(txt, 12, padT + 11);
  }
}
addEventListener("resize", () => { clearTimeout(window.__rz); window.__rz = setTimeout(drawChart, 80); });

/* ============ paper ticket ============ */
function renderTicket() {
  const el = $("ticket"), t = tok(S.sel);
  if (!t) { el.innerHTML = `<div class="note">Pick a coin to practice a trade.</div>`; return; }
  const pos = acct.pos[t.key];
  el.innerHTML = `
   <div class="sides" role="group" aria-label="Side"><button class="b" aria-pressed="${S.side === "buy"}" data-side="buy">Buy</button><button class="s" aria-pressed="${S.side === "sell"}" data-side="sell">Sell</button></div>
   ${S.side === "buy" ? `<div class="field"><label for="amt">Spend</label><div class="inp"><input id="amt" inputmode="decimal" value="${esc(S.amt)}" autocomplete="off"><span>USD</span></div>
     <div class="quick">${["25", "100", "250", "1000"].map(v => `<button data-q="${v}">$${v}</button>`).join("")}</div><div class="note">Practice cash: <span class="num">${usd(acct.cash)}</span></div></div>`
   : `<div class="field"><label for="amt">Sell share of position</label><div class="inp"><input id="amt" inputmode="decimal" value="${esc(S.sellPct)}"><span>%</span></div>
     <div class="quick">${["25", "50", "100"].map(v => `<button data-q="${v}">${v}%</button>`).join("")}</div>
     <div class="note">${pos ? `You hold <span class="num">${pos.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${esc(t.sym)}</span> (≈ ${usd(pos.qty * t.price)}).` : `You don't hold ${esc(t.sym)}.`}</div></div>`}
   <div id="quote"></div>
   <button class="btn primary" id="go">${S.review ? "Edit order" : "Review order"}</button>
   <div class="note">Real trading through your own wallet comes in step 2. For now every trade is practice.</div>`;
  el.querySelectorAll("[data-side]").forEach(b => b.onclick = () => { S.side = b.dataset.side; S.review = false; renderTicket(); });
  el.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { if (S.side === "buy") S.amt = b.dataset.q; else S.sellPct = b.dataset.q; S.review = false; renderTicket(); });
  $("amt").oninput = e => { if (S.side === "buy") S.amt = e.target.value; else S.sellPct = e.target.value; if (S.review) quote(); };
  $("go").onclick = () => { S.review = !S.review; renderTicket(); };
  if (S.review) quote();
}
const impactOf = (t, usdv) => t.liq > 0 ? Math.min(50, usdv / (t.liq / 2) * 100) : 50;
function quote() {
  const q = $("quote"), t = tok(S.sel); if (!q || !t) return;
  if (!(t.price > 0)) { q.innerHTML = `<div class="limitwarn">No live price for this coin right now.</div>`; return; }
  if (S.side === "buy") {
    const a = parseFloat(S.amt); if (!(a > 0)) { q.innerHTML = `<div class="limitwarn">Enter an amount above zero.</div>`; return; }
    const fee = a * FEE, imp = impactOf(t, a), fill = t.price * (1 + imp / 100), qty = (a - fee) / fill;
    q.innerHTML = `<div class="review"><h4>Buy ${esc(t.sym)} with $${a.toFixed(2)}</h4>
      <div class="kv"><span>You get (est.)</span><span>${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${esc(t.sym)}</span></div>
      <div class="kv"><span>Price impact (est.)</span><span class="${imp > 5 ? "down" : ""}">${imp.toFixed(2)}%</span></div>
      <div class="kv"><span>Fee (0.75%)</span><span>$${fee.toFixed(2)}</span></div>
      ${a > acct.cash ? `<div class="limitwarn">You only have ${usd(acct.cash)} in practice cash.</div>` : ""}
      ${check(t).s < 45 ? `<div class="limitwarn">This coin fails several risk checks.</div>` : ""}
      <button class="btn primary" id="place" ${a > acct.cash ? "disabled" : ""}>Place paper trade</button></div>`;
    $("place").onclick = () => {
      acct.cash -= a; const p = acct.pos[t.key] || { qty: 0, cost: 0, sym: t.sym, name: t.name, chain: t.chain, addr: t.addr };
      p.qty += qty; p.cost += a; acct.pos[t.key] = p;
      acct.hist.unshift({ ts: Date.now(), key: t.key, sym: t.sym, side: "Buy", qty, price: fill, usd: a, fee, pnl: null }); saveAcct();
      toast(`Paper buy filled: ${qty.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${t.sym}.`); S.review = false; renderTicket();
    };
  } else {
    const p = acct.pos[t.key], f = parseFloat(S.sellPct) / 100;
    if (!p) { q.innerHTML = `<div class="limitwarn">You don't hold any ${esc(t.sym)}.</div>`; return; }
    if (!(f > 0 && f <= 1)) { q.innerHTML = `<div class="limitwarn">Enter a share between 1 and 100%.</div>`; return; }
    const qty = p.qty * f, val = qty * t.price, imp = impactOf(t, val), proceeds = val * (1 - imp / 100), fee = proceeds * FEE, net = proceeds - fee, pnl = net - p.cost * f;
    q.innerHTML = `<div class="review"><h4>Sell ${(f * 100).toFixed(0)}% of your ${esc(t.sym)}</h4>
      <div class="kv"><span>You receive (est.)</span><span>$${net.toFixed(2)}</span></div>
      <div class="kv"><span>Price impact (est.)</span><span>${imp.toFixed(2)}%</span></div>
      <div class="kv"><span>Fee (0.75%)</span><span>$${fee.toFixed(2)}</span></div>
      <div class="kv"><span>Profit or loss</span><span class="${pnl >= 0 ? "up" : "down"}">${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}</span></div>
      <button class="btn primary" id="place">Place paper trade</button></div>`;
    $("place").onclick = () => {
      acct.cash += net; p.qty -= qty; p.cost -= p.cost * f; if (f >= 1 || p.qty < 1e-12) delete acct.pos[t.key];
      acct.hist.unshift({ ts: Date.now(), key: t.key, sym: t.sym, side: "Sell", qty, price: t.price, usd: net, fee, pnl }); saveAcct();
      toast(`Paper sell filled: ${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)}.`); S.review = false; renderTicket();
    };
  }
}

/* ============ wallets ============ */
const W = { sol: null, solBal: null, evm: null, evmBal: null, evmChain: null, solErr: "", evmErr: "", px: { SOL: null, ETH: null, BNB: null } };
const EVM_CHAINS = { "0x1": ["Ethereum", "ETH"], "0x2105": ["Base", "ETH"], "0x38": ["BNB Chain", "BNB"] };
const solRpc = () => store.get("t1-sol-rpc", "") || "https://api.mainnet-beta.solana.com";
async function nativePrices() {
  try {
    const pairs = await pairsForTokens([{ chainId: "solana", tokenAddress: "So11111111111111111111111111111111111111112" }, { chainId: "ethereum", tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" }, { chainId: "bsc", tokenAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" }]);
    const b = bestPairs(pairs), g = (c, a) => +(b.get(keyOf(c, a))?.priceUsd || 0) || null;
    W.px.SOL = g("solana", "So11111111111111111111111111111111111111112"); W.px.ETH = g("ethereum", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"); W.px.BNB = g("bsc", "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");
  } catch {}
}
async function solBalance() {
  W.solErr = "";
  try {
    const r = await fetch(solRpc(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [W.sol] }) });
    const d = await r.json(); if (d.error) throw new Error(d.error.message); W.solBal = (d.result?.value ?? 0) / 1e9;
  } catch { W.solBal = null; W.solErr = "Couldn't read your SOL balance. The free public Solana server limits website traffic. Add a free RPC link under Settings below."; }
}
async function connectPhantom() {
  const p = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
  if (!p) { toast("Phantom isn't installed. Get it at phantom.com, then reload this page."); window.open("https://phantom.com/download", "_blank", "noopener"); return; }
  try { const r = await p.connect(); W.sol = r.publicKey.toString(); await solBalance(); toast("Phantom connected."); } catch { toast("Phantom connection was cancelled."); }
  afterWallet();
}
async function evmRefresh() {
  W.evmErr = "";
  try {
    W.evmChain = await window.ethereum.request({ method: "eth_chainId" });
    const hex = await window.ethereum.request({ method: "eth_getBalance", params: [W.evm, "latest"] }); W.evmBal = parseInt(hex, 16) / 1e18;
  } catch { W.evmBal = null; W.evmErr = "Couldn't read your balance from MetaMask."; }
}
async function connectMetaMask() {
  if (!window.ethereum) { toast("MetaMask isn't installed. Get it at metamask.io, then reload this page."); window.open("https://metamask.io/download/", "_blank", "noopener"); return; }
  try { const a = await window.ethereum.request({ method: "eth_requestAccounts" }); W.evm = a[0]; await evmRefresh(); toast("MetaMask connected."); } catch { toast("MetaMask connection was cancelled."); }
  afterWallet();
}
if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", a => { W.evm = a[0] || null; if (W.evm) evmRefresh().then(afterWallet); else afterWallet(); });
  window.ethereum.on("chainChanged", () => { if (W.evm) evmRefresh().then(afterWallet); });
}
function afterWallet() { renderWalletBtn(); renderModal(); if (!$("view-portfolio").hidden) renderPortfolio(); }
function renderWalletBtn() { const n = (W.sol ? 1 : 0) + (W.evm ? 1 : 0); $("walletBtn").innerHTML = n ? `<span class="dot"></span> <span class="num">${esc(shortA(W.sol || W.evm))}</span>${n > 1 ? ' <span class="muted">+1</span>' : ""}` : "Connect wallet"; }
function renderModal() { $("st-phantom").textContent = W.sol ? "Connected · disconnect" : "Connect"; $("st-metamask").textContent = W.evm ? "Connected · disconnect" : "Connect"; }
const modal = $("walletModal");
$("walletBtn").onclick = () => { renderModal(); modal.hidden = false; };
$("wmClose").onclick = () => modal.hidden = true;
modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
addEventListener("keydown", e => { if (e.key === "Escape") modal.hidden = true; });
modal.querySelectorAll(".wopt").forEach(b => b.onclick = async () => {
  if (b.dataset.w === "phantom") { if (W.sol) { try { await window.phantom?.solana?.disconnect(); } catch {} W.sol = null; W.solBal = null; afterWallet(); } else connectPhantom(); }
  else { if (W.evm) { W.evm = null; W.evmBal = null; afterWallet(); toast("Disconnected here. To fully revoke access, use MetaMask's Connected sites menu."); } else connectMetaMask(); }
});

/* ============ portfolio ============ */
function renderPortfolio() {
  const v = $("view-portfolio"), keys = Object.keys(acct.pos);
  const posV = keys.reduce((a, k) => a + acct.pos[k].qty * (tok(k)?.price || 0), 0), total = acct.cash + posV, pl = total - acct.start;
  const evmC = EVM_CHAINS[W.evmChain] || [W.evmChain ? "Unknown network" : "", "ETH"];
  v.innerHTML = `<div class="pagehead"><div><h1>Portfolio</h1><p>Your practice account, plus the real balances of any wallet you connect.</p></div></div>
  <div class="pgrid">
    <div class="pane span4"><div class="pbody"><div class="label">Practice account value</div><div class="big num">${usd(total)}</div>
      <div class="kv"><span>Cash</span><span>${usd(acct.cash)}</span></div><div class="kv"><span>Open positions</span><span>${usd(posV)}</span></div>
      <div class="kv"><span>All-time result</span><span class="${pl >= 0 ? "up" : "down"}">${pl >= 0 ? "+" : "−"}${usd(Math.abs(pl))}</span></div>
      <div id="resetBox"><button class="btn sm" id="reset">Reset practice account</button></div></div></div>
    <div class="pane span4"><div class="pane-h"><h3>Phantom</h3><span class="label">Solana</span></div><div class="pbody">
      ${W.sol ? `<div class="addr">${esc(W.sol)}</div><div class="kv"><span>SOL balance</span><span>${W.solBal == null ? "—" : W.solBal.toFixed(4) + " SOL"}</span></div><div class="kv"><span>Value</span><span>${W.solBal != null && W.px.SOL ? usd(W.solBal * W.px.SOL) : "—"}</span></div>${W.solErr ? `<div class="infobox">${esc(W.solErr)}</div>` : ""}<button class="btn sm" id="solRef">Refresh</button>`
      : `<p class="note" style="margin:0">Connect Phantom to see your real SOL balance.</p><button class="btn primary sm" id="solCon">Connect Phantom</button>`}</div></div>
    <div class="pane span4"><div class="pane-h"><h3>MetaMask</h3><span class="label">${esc(evmC[0] || "Ethereum, Base, BNB")}</span></div><div class="pbody">
      ${W.evm ? `<div class="addr">${esc(W.evm)}</div><div class="kv"><span>${evmC[1]} balance</span><span>${W.evmBal == null ? "—" : W.evmBal.toFixed(5) + " " + evmC[1]}</span></div><div class="kv"><span>Value</span><span>${W.evmBal != null && W.px[evmC[1]] ? usd(W.evmBal * W.px[evmC[1]]) : "—"}</span></div>${W.evmErr ? `<div class="infobox">${esc(W.evmErr)}</div>` : ""}<div class="note">Switch networks in MetaMask and this updates.</div>`
      : `<p class="note" style="margin:0">Connect MetaMask to see your real balance on Ethereum, Base or BNB Chain.</p><button class="btn primary sm" id="evmCon">Connect MetaMask</button>`}</div></div>
    <div class="pane span12"><div class="pane-h"><h3>Practice positions</h3><span class="label">Live prices</span></div><div class="tbl"><table><thead><tr><th>Coin</th><th>Chain</th><th class="n">Amount</th><th class="n">Cost</th><th class="n">Value</th><th class="n">P&amp;L</th><th></th></tr></thead><tbody>
      ${keys.length ? keys.map(k => { const p = acct.pos[k], t = tok(k), val = p.qty * (t?.price || 0), pnl = val - p.cost; return `<tr><td><b>${esc(p.sym)}</b> <span class="note">${esc(p.name)}</span></td><td>${CHAINS[p.chain]?.short || ""}</td><td class="n">${p.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td class="n">${usd(p.cost)}</td><td class="n">${t ? usd(val) : "updating…"}</td><td class="n ${pnl >= 0 ? "up" : "down"}">${t ? (pnl >= 0 ? "+" : "−") + usd(Math.abs(pnl)) : "—"}</td><td><button class="btn sm" data-open="${esc(k)}">Trade</button></td></tr>`; }).join("") : `<tr><td colspan="7" class="muted">No practice positions yet. Buy something on the Coins page.</td></tr>`}
    </tbody></table></div></div>
    <div class="pane span12"><div class="pane-h"><h3>Trade history</h3><span class="label">Saved in this browser</span></div><div class="tbl"><table><thead><tr><th>Time</th><th>Coin</th><th>Side</th><th class="n">Amount</th><th class="n">Price</th><th class="n">Value</th><th class="n">P&amp;L</th></tr></thead><tbody>
      ${acct.hist.length ? acct.hist.slice(0, 50).map(h => `<tr><td>${new Date(h.ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td><td><b>${esc(h.sym)}</b></td><td class="${h.side === "Buy" ? "up" : "down"}">${h.side}</td><td class="n">${h.qty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td><td class="n">${px(h.price)}</td><td class="n">${usd(h.usd)}</td><td class="n ${h.pnl == null ? "muted" : h.pnl >= 0 ? "up" : "down"}">${h.pnl == null ? "—" : (h.pnl >= 0 ? "+" : "−") + usd(Math.abs(h.pnl))}</td></tr>`).join("") : `<tr><td colspan="7" class="muted">No trades yet.</td></tr>`}
    </tbody></table></div></div>
    <div class="pane span12"><div class="pane-h"><h3>Settings</h3><span class="label">Optional</span></div><div class="pbody">
      <div class="field"><label for="rpc">Solana RPC link</label><div class="inp"><input class="txt" id="rpc" placeholder="https://api.mainnet-beta.solana.com" value="${esc(store.get("t1-sol-rpc", ""))}"></div>
      <div class="note">The free public Solana server often blocks websites. A free RPC link from a provider like Helius fixes balance reads. It's saved only in this browser.</div></div>
      <button class="btn sm" id="rpcSave" style="justify-self:start">Save RPC link</button></div></div>
  </div>`;
  v.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { location.hash = "coins"; if (tok(b.dataset.open)) selectToken(b.dataset.open); });
  $("reset").onclick = () => { $("resetBox").innerHTML = `<div class="infobox" style="display:grid;gap:8px">This clears your practice positions and history and resets cash to $10,000.<div style="display:flex;gap:8px"><button class="btn sm primary" id="resetYes">Reset</button><button class="btn sm" id="resetNo">Cancel</button></div></div>`; $("resetYes").onclick = () => { acct.cash = 10000; acct.start = 10000; acct.pos = {}; acct.hist = []; saveAcct(); toast("Practice account reset."); renderPortfolio(); }; $("resetNo").onclick = renderPortfolio; };
  const c1 = $("solCon"); if (c1) c1.onclick = connectPhantom; const c2 = $("evmCon"); if (c2) c2.onclick = connectMetaMask;
  const r1 = $("solRef"); if (r1) r1.onclick = async () => { await solBalance(); renderPortfolio(); };
  $("rpcSave").onclick = async () => { const u = $("rpc").value.trim(); if (u && !safeUrl(u)) { toast("That doesn't look like a web link."); return; } store.set("t1-sol-rpc", u); toast(u ? "RPC link saved." : "Using the public Solana server."); if (W.sol) { await solBalance(); renderPortfolio(); } };
}

/* ============ about ============ */
function renderAbout() {
  $("view-about").innerHTML = `<div class="pagehead"><div><h1>About</h1><p>Terminal One is a memecoin terminal built around risk management.</p></div></div>
  <div class="pgrid"><div class="pane span7"><div class="pbody">
    <div class="label">Live now</div>
    <ul class="locks"><li><span class="ic ok">✓</span><span>Real coins, prices, contract addresses and links from DexScreener.</span></li><li><span class="ic ok">✓</span><span>Real price charts from GeckoTerminal.</span></li><li><span class="ic ok">✓</span><span>Real wallet balances from Phantom and MetaMask.</span></li><li><span class="ic ok">✓</span><span>Paper trading on live prices, saved in your browser.</span></li></ul>
    <div class="label">Coming next</div>
    <ul class="locks"><li><span class="ic warn">!</span><span>Real trades signed in your own wallet.</span></li><li><span class="ic warn">!</span><span>Full risk score with holder and creator checks.</span></li><li><span class="ic warn">!</span><span>Alerts, copy trading, social, news and the X tracker.</span></li></ul>
    <div class="infobox">Nothing here is financial advice. Memecoins are extremely risky and most go to zero.</div></div></div>
    <div class="pane span5"><div class="pane-h"><h3>Data credits</h3></div><div class="pbody"><p style="margin:0">Market data from <a href="https://dexscreener.com" target="_blank" rel="noopener">DexScreener</a>. Charts from <a href="https://www.geckoterminal.com" target="_blank" rel="noopener">GeckoTerminal</a>.</p></div></div></div>`;
}

/* ============ routing + timers ============ */
const VIEWS = ["coins", "portfolio", "about"];
function route() {
  let h = location.hash.slice(1); if (!VIEWS.includes(h)) h = "coins";
  VIEWS.forEach(k => $("view-" + k).hidden = k !== h);
  document.querySelectorAll(".nav a").forEach(a => a.setAttribute("aria-current", a.dataset.v === h ? "page" : "false"));
  if (h === "coins") requestAnimationFrame(drawChart);
  if (h === "portfolio") { renderPortfolio(); const held = Object.keys(acct.pos).filter(k => !tok(k)); if (held.length) { pairsForTokens(held.map(k => { const p = acct.pos[k]; return { chainId: p.chain, tokenAddress: p.addr }; })).then(ps => { bestPairs(ps).forEach((p, k) => S.tokens.set(k, toToken(p, S.profiles.get(k)))); if (!$("view-portfolio").hidden) renderPortfolio(); }); } }
  if (h === "about") renderAbout();
}
addEventListener("hashchange", route);

setMode(S.mode); renderFeed(); renderToken(); renderTicket(); renderTicker(); route();
loadLists(); nativePrices();
setInterval(loadLists, 60000);
setInterval(async () => { if (S.sel && !document.hidden) { await refreshTokens([S.sel]).catch(() => {}); updateLive(); } }, 10000);
setInterval(() => { if (S.sel && !document.hidden && !$("view-coins").hidden) loadCandles(); }, 30000);
setInterval(async () => { const ks = Object.keys(acct.pos); if (ks.length && !document.hidden) { await refreshTokens(ks).catch(() => {}); if (!$("view-portfolio").hidden) renderPortfolio(); } }, 30000);

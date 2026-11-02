#!/usr/bin/env node
/**
 * Scrape StockAnalysis AUM (ETF share-class Assets) and VGT holdings,
 * plus VanEck SMH daily holdings. Prints one JSON object to stdout.
 * Requires: playwright-core + system Chrome/Chromium.
 * Optional env: PLAYWRIGHT_CHROME=/path/to/chrome, NODE_PATH=.../node_modules
 */
import { createRequire } from "module";
import { pathToFileURL } from "url";
import { existsSync } from "fs";

const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    "/workspace/shots-tool/node_modules/playwright-core",
    new URL("../../shots-tool/node_modules/playwright-core", import.meta.url).pathname,
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (_) {}
  }
  return require("playwright-core");
}

function parseAssets(text) {
  const m = text.match(/Assets\s*\$([0-9]+(?:\.[0-9]+)?)\s*([BMKTbmk])/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  const mult = u === "T" ? 1e12 : u === "B" ? 1e9 : u === "M" ? 1e6 : u === "K" ? 1e3 : 1;
  return n * mult;
}

function chromePath() {
  return process.env.PLAYWRIGHT_CHROME
    || ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
}

const { chromium } = loadPlaywright();
const chrome = chromePath();
if (!chrome) {
  console.error("No Chrome found");
  process.exit(2);
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const b = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
const p = await b.newPage({ userAgent: UA });

const tickers = ["vgt", "smh", "schd", "gld"];
const assets = {};
for (const t of tickers) {
  await p.goto(`https://stockanalysis.com/etf/${t}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForTimeout(2500);
  const text = await p.evaluate(() => document.body.innerText);
  assets[t.toUpperCase()] = parseAssets(text);
}

await p.goto("https://stockanalysis.com/etf/vgt/holdings/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(3000);
const vgtText = await p.evaluate(() => document.body.innerText);
const vgtRows = [...vgtText.matchAll(/\n\d+\t([A-Z.]{1,6})\t([^\t\n]+)\t([0-9.]+)%/g)].slice(0, 10);
let vgt = null;
if (vgtRows.length) {
  const top10Match = vgtText.match(/Top 10 Percentage\s*\n\s*([0-9.]+)%/i);
  const top10 = top10Match ? parseFloat(top10Match[1]) : vgtRows.reduce((s, r) => s + parseFloat(r[3]), 0);
  vgt = {
    top10_pct: Math.round(top10 * 100) / 100,
    top1: vgtRows[0][1],
    top1_pct: Math.round(parseFloat(vgtRows[0][3]) * 100) / 100,
    as_of: null,
    source: "https://stockanalysis.com/etf/vgt/holdings/ (Finnhub)",
  };
  const m2 = vgtText.match(/Updated\s+([A-Za-z]+ \d{1,2}, \d{4})/i) || vgtText.match(/as of\s+(\d{4}-\d{2}-\d{2})/i);
  if (m2) {
    const raw = m2[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) vgt.as_of = raw;
    else {
      const d = new Date(raw + " UTC");
      if (!isNaN(d)) vgt.as_of = d.toISOString().slice(0, 10);
    }
  }
}

await p.goto("https://www.vaneck.com/us/en/investments/semiconductor-etf-smh/holdings/", { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForTimeout(4000);
const smhText = await p.evaluate(() => document.body.innerText);
const smhAs = (smhText.match(/Holdings\s+as of\s+(\d{1,2}\/\d{1,2}\/\d{4})/i) || [])[1] || null;
const smhRows = [...smhText.matchAll(/\n([A-Z.]{1,6})\t([^\t\n]+)\t([0-9.]+)\t/g)].slice(0, 10);
let smh = null;
if (smhRows.length) {
  const top10 = smhRows.reduce((s, r) => s + parseFloat(r[3]), 0);
  smh = {
    top10_pct: Math.round(top10 * 100) / 100,
    top1: smhRows[0][1],
    top1_pct: Math.round(parseFloat(smhRows[0][3]) * 100) / 100,
    as_of: null,
    source: "https://www.vaneck.com/us/en/investments/semiconductor-etf-smh/holdings/ (Daily Holdings)",
  };
  if (smhAs) {
    const [mm, dd, yy] = smhAs.split("/");
    smh.as_of = `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
}

await b.close();
const out = {
  assets_usd: assets,
  assets_source_template:
    "StockAnalysis ETF overview 'Assets' (ETF share class), read {fetched}; quotes on page as of {asof} close; https://stockanalysis.com/etf/{vgt,smh,schd,gld}/",
  holdings: { VGT: vgt, SMH: smh },
};
process.stdout.write(JSON.stringify(out));

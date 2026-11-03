#!/usr/bin/env python3
"""Build the static ETF dashboard data files from Yahoo Finance."""

import json
import os
import subprocess
import sys
import warnings
from datetime import date, datetime
from pathlib import Path

warnings.filterwarnings("ignore")

import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")

BASE_DIR = Path(__file__).resolve().parent
OUT_DIR = BASE_DIR / "dashboard"
TICKERS = ("VGT", "SMH", "SCHD", "GLD")
HOLD_TICKERS = ("VGT", "SMH")


def close_series(data, field, ticker):
    if data is None or data.empty:
        return pd.Series(dtype=float)
    columns = data.columns
    if isinstance(columns, pd.MultiIndex):
        first = columns.get_level_values(0)
        second = columns.get_level_values(1)
        if field in first and ticker in second:
            series = data[field][ticker]
        elif ticker in first and field in second:
            series = data[ticker][field]
        else:
            return pd.Series(dtype=float)
    else:
        if field not in columns:
            return pd.Series(dtype=float)
        series = data[field]
    if isinstance(series, pd.DataFrame):
        series = series.iloc[:, 0]
    return pd.to_numeric(series, errors="coerce").dropna().sort_index()


def last_index_on_or_before(dates, reference):
    found = 0
    for i, value in enumerate(dates):
        if value <= reference:
            found = i
        else:
            break
    return found


def pct_return(latest, base):
    if base is None or base == 0:
        return None
    return round((latest / base - 1.0) * 100.0, 2)


def round_or_none(value, digits):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(number):
        return None
    return round(number, digits)


STOCKANALYSIS_AUM_FALLBACK = {
    "VGT": 151550000000.0,
    "SMH": 71380000000.0,
    "SCHD": 120600000000.0,
    "GLD": 134800000000.0,
}
HOLDINGS_FALLBACK = {
    "VGT": {
        "top10_pct": 63.59,
        "top1": "NVDA",
        "top1_pct": 17.59,
        "as_of": "2026-09-30",
        "source": "https://stockanalysis.com/etf/vgt/holdings/ (Finnhub)",
    },
    "SMH": {
        "top10_pct": 69.05,
        "top1": "NVDA",
        "top1_pct": 20.19,
        "as_of": "2026-10-30",
        "source": "https://www.vaneck.com/us/en/investments/semiconductor-etf-smh/holdings/ (Daily Holdings)",
    },
}


def load_existing_snapshot():
    """Return the last written dashboard JSON, or {} if it cannot be read."""
    path = OUT_DIR / "etf_data.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def positive_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(number) or number <= 0:
        return None
    return number


def overlay_holding(row, src):
    """Copy a complete holdings row onto row. Incomplete rows are ignored."""
    if not isinstance(src, dict):
        return False
    top1 = src.get("top1")
    top10 = round_or_none(src.get("top10_pct"), 2)
    top1_pct = round_or_none(src.get("top1_pct"), 2)
    if not isinstance(top1, str) or not top1.strip() or top10 is None or top1_pct is None:
        return False
    row["top10_pct"] = top10
    row["top1"] = top1.strip()
    row["top1_pct"] = top1_pct
    as_of = src.get("as_of")
    if isinstance(as_of, str) and as_of.strip():
        row["as_of"] = as_of.strip()
    source = src.get("source")
    if isinstance(source, str) and source.strip():
        row["source"] = source.strip()
    return True


def write_text_atomic(path, text):
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def scrape_fund_meta():
    """Run dashboard/scrape_meta.mjs (Playwright + Chrome). Return dict or None.

    None means the scrape did not produce data. Callers keep the existing
    AUM and holdings snapshot instead of writing nulls.
    """
    script = BASE_DIR / "dashboard" / "scrape_meta.mjs"
    if not script.exists():
        print("Playwright scrape skipped: dashboard/scrape_meta.mjs not found")
        return None
    env = dict(os.environ)
    env.setdefault("NODE_PATH", "/workspace/shots-tool/node_modules")
    try:
        proc = subprocess.run(
            ["node", str(script)],
            cwd=str(BASE_DIR),
            env=env,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except Exception as exc:
        print(f"Playwright scrape skipped: {exc}")
        return None
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip().splitlines()
        hint = ""
        for line in err:
            text = line.strip()
            if text.startswith("Error:") or "Cannot find module" in text or text.startswith("No Chrome"):
                hint = text
                break
        if not hint:
            for line in reversed(err):
                text = line.strip()
                if text and not text.startswith("Node.js v") and not text.startswith("at ") and text not in {"^", "}"}:
                    hint = text
                    break
        if not hint:
            hint = f"exit {proc.returncode}"
        print(f"Playwright scrape skipped: {hint[:200]}")
        return None
    out = (proc.stdout or "").strip()
    if not out:
        print("Playwright scrape skipped: empty output")
        return None
    # scrape_meta may print logs; take the last JSON object line
    for line in reversed(out.splitlines()):
        line = line.strip()
        if line.startswith("{") and line.endswith("}"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        print("Playwright scrape skipped: output was not JSON")
        return None


def _assets_source(fetched, asof):
    return (
        "StockAnalysis ETF overview 'Assets' (ETF share class), "
        f"read {fetched}; quotes on page as of {asof} close; "
        "https://stockanalysis.com/etf/{vgt,smh,schd,gld}/"
    )


def fetch_fund(tickers, fetched, asof, meta=None, existing=None):
    existing = existing if isinstance(existing, dict) else {}
    existing_fund = existing.get("fund") if isinstance(existing.get("fund"), dict) else {}
    assets = {}
    for ticker in tickers:
        builtin = positive_number(STOCKANALYSIS_AUM_FALLBACK.get(ticker))
        if builtin is not None:
            assets[ticker] = float(int(round(builtin)))
        prev = existing_fund.get(ticker)
        if isinstance(prev, dict):
            kept = positive_number(prev.get("assets_usd"))
            if kept is not None:
                assets[ticker] = float(int(round(kept)))
    scraped_assets = False
    meta_assets = meta.get("assets_usd") if isinstance(meta, dict) else None
    if isinstance(meta_assets, dict):
        for ticker, value in meta_assets.items():
            number = positive_number(value)
            if number is None:
                continue
            assets[ticker] = float(int(round(number)))
            scraped_assets = True
    result = {}
    refreshed_er = False
    for ticker in tickers:
        row = {"expense_ratio_pct": None, "assets_usd": assets.get(ticker)}
        try:
            info = yf.Ticker(ticker).info or {}
            row["expense_ratio_pct"] = round_or_none(info.get("netExpenseRatio"), 4)
        except Exception:
            pass
        if row["expense_ratio_pct"] is not None:
            refreshed_er = True
        else:
            prev = existing_fund.get(ticker)
            if isinstance(prev, dict):
                kept = round_or_none(prev.get("expense_ratio_pct"), 4)
                if kept is not None:
                    row["expense_ratio_pct"] = kept
        result[ticker] = row
    if refreshed_er:
        result["expense_ratio_source"] = (
            f"Yahoo Finance via yfinance (netExpenseRatio), fetched {fetched}"
        )
    else:
        prev_source = existing_fund.get("expense_ratio_source")
        result["expense_ratio_source"] = (
            prev_source
            if isinstance(prev_source, str) and prev_source.strip()
            else f"Yahoo Finance via yfinance (netExpenseRatio), fetched {fetched}"
        )
    if scraped_assets:
        result["assets_source"] = _assets_source(fetched, asof)
    else:
        prev_source = existing_fund.get("assets_source")
        result["assets_source"] = (
            prev_source
            if isinstance(prev_source, str) and prev_source.strip()
            else _assets_source(fetched, asof)
        )
    return result


def fetch_holdings(tickers, fetched, meta=None, existing=None):
    del fetched  # holdings dates come from the snapshot or the scrape, not this run
    existing = existing if isinstance(existing, dict) else {}
    existing_holdings = existing.get("holdings") if isinstance(existing.get("holdings"), dict) else {}
    scraped = {}
    if isinstance(meta, dict) and isinstance(meta.get("holdings"), dict):
        scraped = meta["holdings"]
    result = {}
    for ticker in tickers:
        row = {
            "top10_pct": None,
            "top1": None,
            "top1_pct": None,
            "as_of": None,
            "source": None,
        }
        overlay_holding(row, HOLDINGS_FALLBACK.get(ticker))
        overlay_holding(row, existing_holdings.get(ticker))
        overlay_holding(row, scraped.get(ticker))
        result[ticker] = row
    return result



def main():
    today = pd.Timestamp.today().normalize()
    end = today + pd.Timedelta(days=1)
    start = today - pd.DateOffset(years=5) - pd.Timedelta(days=45)

    adjusted = yf.download(
        list(TICKERS), start=start, end=end, auto_adjust=True, progress=False
    )
    actual = yf.download(
        list(TICKERS), start=start, end=end, auto_adjust=False, progress=False
    )

    adj_series = {t: close_series(adjusted, "Close", t) for t in TICKERS}
    act_series = {t: close_series(actual, "Close", t) for t in TICKERS}

    missing = [t for t in TICKERS if adj_series[t].empty or act_series[t].empty]
    if missing:
        print("Error: no price data returned for: " + ", ".join(missing), file=sys.stderr)
        return 1

    index_sets = [set(s.index) for s in adj_series.values()]
    index_sets += [set(s.index) for s in act_series.values()]
    common = sorted(set.intersection(*index_sets))
    if not common:
        print("Error: no common trading dates across tickers", file=sys.stderr)
        return 1

    asof = common[-1]
    window_start = asof - pd.DateOffset(years=1)
    dates = pd.DatetimeIndex([d for d in common if d >= window_start])

    idx = {
        "1M": last_index_on_or_before(dates, asof - pd.DateOffset(months=1)),
        "3M": last_index_on_or_before(dates, asof - pd.DateOffset(months=3)),
        "6M": last_index_on_or_before(dates, asof - pd.DateOffset(months=6)),
        "YTD": last_index_on_or_before(
            dates, pd.Timestamp(year=asof.year - 1, month=12, day=31)
        ),
        "1Y": 0,
    }

    closes = {}
    adjusted_values = {}
    returns = {}
    lasts = {}
    prevs = {}
    highs = {}
    lows = {}
    divs = {}
    ttms = {}

    for ticker in TICKERS:
        values = [float(adj_series[ticker].loc[d]) for d in dates]
        adjusted_values[ticker] = values
        closes[ticker] = [round(v, 2) for v in values]

        latest = values[-1]
        ticker_returns = {}
        for key in ("1M", "3M", "6M", "YTD", "1Y"):
            ticker_returns[key] = pct_return(latest, values[idx[key]])
        returns[ticker] = ticker_returns

        actual_series = act_series[ticker][act_series[ticker].index <= asof]
        actual_values = [
            float(actual_series.loc[d])
            for d in dates
            if d in actual_series.index
        ]
        lasts[ticker] = round(float(actual_series.iloc[-1]), 2)
        prevs[ticker] = (
            round(float(actual_series.iloc[-2]), 2)
            if len(actual_series) >= 2
            else None
        )
        highs[ticker] = round(max(actual_values), 2) if actual_values else None
        lows[ticker] = round(min(actual_values), 2) if actual_values else None

        cutoff = (asof - pd.DateOffset(years=2)).date()
        ticker_divs = []
        try:
            dividends = yf.Ticker(ticker).dividends
            for ex_date, amount in dividends.items():
                ex_day = ex_date.date() if hasattr(ex_date, "date") else ex_date
                if ex_day > cutoff:
                    ticker_divs.append([ex_day.strftime("%Y-%m-%d"), round(float(amount), 4)])
        except Exception:
            ticker_divs = []
        ticker_divs.sort(key=lambda item: item[0])
        divs[ticker] = ticker_divs

        ttm_cutoff = (asof - pd.DateOffset(years=1)).date()
        ttm = 0.0
        for ex_day, amount in ticker_divs:
            if date.fromisoformat(ex_day) > ttm_cutoff:
                ttm += amount
        ttms[ticker] = round(ttm, 4)

    weekly_start = asof - pd.DateOffset(years=5) - pd.Timedelta(days=7)
    weekly_keep = asof - pd.DateOffset(years=5) - pd.Timedelta(days=6)
    weekly_series = {}
    for ticker in TICKERS:
        series = adj_series[ticker][adj_series[ticker].index <= asof]
        series = series[series.index >= weekly_start]
        weekly = series.resample("W-FRI").last().dropna()
        weekly = weekly[weekly.index >= weekly_keep]
        weekly_series[ticker] = weekly

    weekly_dates = sorted(set().union(*[set(s.index) for s in weekly_series.values()]))
    w5 = {
        "d5": [d.strftime("%Y-%m-%d") for d in weekly_dates],
        "c5": {},
        "r5": {},
    }
    for ticker in TICKERS:
        weekly = weekly_series[ticker].reindex(weekly_dates)
        raw_values = [
            float(v) if pd.notna(v) else None for v in weekly.tolist()
        ]
        w5["c5"][ticker] = [
            round(v, 2) if v is not None else None for v in raw_values
        ]
        clean = [v for v in raw_values if v is not None]
        r5 = pct_return(clean[-1], clean[0]) if len(clean) >= 2 else None
        w5["r5"][ticker] = r5
        returns[ticker]["5Y"] = r5

    for ticker in TICKERS:
        values = adjusted_values[ticker]
        returns[ticker]["1D"] = (
            pct_return(values[-1], values[-2]) if len(values) >= 2 else None
        )

    fetched = date.today().strftime("%Y-%m-%d")
    dates_iso = [d.strftime("%Y-%m-%d") for d in dates]
    existing = load_existing_snapshot()

    schd_amounts = [amount for _, amount in divs["SCHD"][-4:]]
    schd_close = lasts["SCHD"]
    schd_yield = (
        round(sum(schd_amounts) / schd_close * 100.0, 2)
        if len(schd_amounts) >= 4 and schd_close
        else None
    )
    schd_ttm_yield = {
        "divs": schd_amounts,
        "close": schd_close,
        "yield_pct": schd_yield,
        "method": "last 4 dividends / latest close",
    }

    meta = scrape_fund_meta()
    if meta is None:
        print("AUM and holdings: kept existing snapshot (Playwright/Chrome unavailable or scrape failed)")
    else:
        print("AUM and holdings: applied Playwright scrape where values were present; missing values kept the snapshot")
    asof_iso = asof.strftime("%Y-%m-%d")
    etf_data = {
        "asof": asof_iso,
        "dates": dates_iso,
        "idx": idx,
        "c": closes,
        "ret": returns,
        "last": lasts,
        "prev": prevs,
        "hi": highs,
        "lo": lows,
        "div": divs,
        "ttm": ttms,
        "ret_method": (
            "unrounded Yahoo Adj Close; base = last trading day on/before "
            f"offset; YTD base {dates_iso[idx['YTD']]}"
        ),
        "weekly5y": w5,
        "fund": fetch_fund(TICKERS, fetched, asof_iso, meta, existing),
        "holdings": fetch_holdings(HOLD_TICKERS, fetched, meta, existing),
        "schd_ttm_yield": schd_ttm_yield,
        "badge_marks": {"VGT": "V", "SMH": "SM", "SCHD": "SC", "GLD": "G"},
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    etf_json = json.dumps(etf_data, separators=(",", ":"), ensure_ascii=False)
    write_text_atomic(OUT_DIR / "etf_data.json", etf_json)
    write_text_atomic(OUT_DIR / "data.js", f"window.ETF_DATA = {etf_json};\n")

    print(f"asof: {etf_data['asof']}")
    for ticker in TICKERS:
        print(f"{ticker}: {lasts[ticker]:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Track recent ETF performance and write terminal, chart, and HTML outputs."""

import base64
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd
import yfinance as yf

warnings.filterwarnings("ignore")  # yfinance re-enables some pandas warnings on import

BASE_DIR = Path(__file__).resolve().parent
CHART_PATH = BASE_DIR / "chart.png"
REPORT_PATH = BASE_DIR / "report.html"
TICKERS = ("VGT", "SMH", "SCHD", "GLD")
NAMES = {
    "VGT": "Vanguard Information Technology ETF",
    "SMH": "VanEck Semiconductor ETF",
    "SCHD": "Schwab U.S. Dividend Equity ETF",
    "GLD": "SPDR Gold Shares ETF",
}


def close_series(data, ticker):
    if data is None or data.empty:
        return pd.Series(dtype=float)
    if isinstance(data.columns, pd.MultiIndex):
        first = data.columns.get_level_values(0)
        second = data.columns.get_level_values(1)
        if "Close" in first and ticker in second:
            close = data["Close"][ticker]
        elif ticker in first and "Close" in second:
            close = data[ticker]["Close"]
        else:
            return pd.Series(dtype=float)
    else:
        if "Close" not in data.columns:
            return pd.Series(dtype=float)
        close = data["Close"]
    if isinstance(close, pd.DataFrame):
        close = close.iloc[:, 0]
    return pd.to_numeric(close, errors="coerce").dropna().sort_index()


def prior_point(series, reference):
    subset = series[series.index <= reference]
    if subset.empty:
        return None, None
    return subset.index[-1], float(subset.iloc[-1])


def pct_change(latest, base):
    if base is None or base == 0:
        return None
    return (latest / base - 1.0) * 100.0


def pct_text(value):
    return "N/A" if value is None else f"{value:+.2f}%"


def print_table(rows, data_date):
    header = f"{'Ticker':<6} {'Name':<38} {'Date':<12} {'Price':>11} {'1D %':>9} {'1M %':>9} {'1Y %':>9}"
    print(header)
    print("-" * len(header))
    for row in rows:
        print(
            f"{row['ticker']:<6} {row['name']:<38} {row['date']:<12} "
            f"${row['price']:>10,.2f} {pct_text(row['1d']):>9} "
            f"{pct_text(row['1m']):>9} {pct_text(row['1y']):>9}"
        )
    print("\nNote: GLD is the SPDR Gold Shares ETF, used as a gold proxy so it is comparable to the other ETFs.")
    print(f"Data date: {data_date}")


def make_chart(trends, path):
    fig, ax = plt.subplots(figsize=(12, 6))
    for ticker, (dates, values) in trends.items():
        ax.plot(dates, values, label=ticker, linewidth=1.7)
    ax.axhline(100.0, color="#888888", linestyle="--", linewidth=1)
    ax.set_title("1-Year Normalized Price Trend (Base = 100)")
    ax.set_ylabel("Normalized price")
    ax.grid(True, alpha=0.3)
    ax.legend(title="Ticker", ncol=4, loc="upper left")
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)


def pct_cell(value):
    if value is None:
        cls = "na"
    elif value > 0:
        cls = "pos"
    elif value < 0:
        cls = "neg"
    else:
        cls = "flat"
    return f'<td class="{cls}">{pct_text(value)}</td>'


def write_report(rows, data_date, chart_path, report_path):
    encoded = base64.b64encode(chart_path.read_bytes()).decode("ascii")
    generated = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
    table_rows = "\n".join(
        f"<tr><td>{r['ticker']}</td><td>{r['name']}</td><td>{r['date']}</td>"
        f"<td>${r['price']:,.2f}</td>{pct_cell(r['1d'])}{pct_cell(r['1m'])}"
        f"{pct_cell(r['1y'])}</tr>" for r in rows
    )
    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ETF Performance Tracker</title>
<style>
body{{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#222;line-height:1.5}}
h1{{margin-bottom:.25rem}}h2{{margin-top:2rem}}.meta{{color:#666;margin-top:0}}
table{{border-collapse:collapse;width:100%;margin-top:1rem}}
th,td{{border-bottom:1px solid #ddd;padding:.6rem .5rem;text-align:right;white-space:nowrap}}
th:nth-child(-n+3),td:nth-child(-n+3){{text-align:left}}th{{background:#f5f5f5}}
.pos{{color:#0a7d32;font-weight:600}}.neg{{color:#c62828;font-weight:600}}
.flat,.na{{color:#666}}img{{max-width:100%;height:auto;border:1px solid #ddd}}
.note{{background:#f8f6e8;border-left:4px solid #c9a227;padding:.75rem 1rem}}
</style></head><body>
<h1>ETF Performance Tracker</h1>
<p class="meta">Generated: {generated}<br>Data date: {data_date}</p>
<table><thead><tr><th>Ticker</th><th>Name</th><th>Date</th><th>Price</th>
<th>1D %</th><th>1M %</th><th>1Y %</th></tr></thead><tbody>
{table_rows}
</tbody></table>
<h2>1-Year Trend</h2>
<p>All series are normalized to 100 at the start of their 1-year window.</p>
<img src="data:image/png;base64,{encoded}" alt="1-year normalized trend chart">
<p class="note"><strong>Gold proxy:</strong> GLD is the SPDR Gold Shares ETF,
used as a gold proxy so it is comparable to the other ETFs.</p>
</body></html>
"""
    report_path.write_text(html, encoding="utf-8")


def main():
    end = pd.Timestamp.today().normalize() + pd.Timedelta(days=1)
    start = end - pd.DateOffset(months=13)
    data = yf.download(list(TICKERS), start=start, end=end, auto_adjust=False, progress=False)
    rows, trends, missing = [], {}, []
    for ticker in TICKERS:
        series = close_series(data, ticker)
        if series.empty:
            missing.append(ticker)
            continue
        latest, latest_date = float(series.iloc[-1]), series.index[-1]
        previous = float(series.iloc[-2]) if len(series) > 1 else None
        _, month_base = prior_point(series, latest_date - pd.DateOffset(months=1))
        year_date, year_base = prior_point(
            series, latest_date - pd.DateOffset(years=1)
        )
        year_change = pct_change(latest, year_base)
        if year_base is None or year_date is None:
            year_date, year_base = series.index[0], float(series.iloc[0])
        window = series[series.index >= year_date]
        trends[ticker] = (window.index, window / year_base * 100.0)
        rows.append({
            "ticker": ticker, "name": NAMES[ticker],
            "date": latest_date.strftime("%Y-%m-%d"), "price": latest,
            "1d": pct_change(latest, previous),
            "1m": pct_change(latest, month_base), "1y": year_change,
        })
    if missing:
        print("Error: no data returned for: " + ", ".join(missing), file=sys.stderr)
        return 1
    data_date = max(row["date"] for row in rows)
    print_table(rows, data_date)
    make_chart(trends, CHART_PATH)
    write_report(rows, data_date, CHART_PATH, REPORT_PATH)
    return 0


if __name__ == "__main__":
    sys.exit(main())

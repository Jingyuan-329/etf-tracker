# ETF 表现追踪器

## 用途

`tracker.py` 会下载最近约 13 个月的每日行情，计算 4 只 ETF 的最新价格、最近交易日涨跌幅、近 1 个月涨跌幅和近 1 年涨跌幅，并在终端输出表格，同时生成走势图和自包含的 HTML 报告。

## 在线查看

https://jingyuan-329.github.io/etf-tracker/

静态仪表盘：https://jingyuan-329.github.io/etf-tracker/dashboard/

## 静态仪表盘（dashboard/）

仪表盘是纯前端页面，不需要后端服务。

### 文件

- `dashboard/index.html`、`dashboard/app.js`、`dashboard/style.css`：纯原生 JS/CSS，无 CDN、无外部请求，可离线打开。
- `dashboard/data.js`：定义 `window.ETF_DATA`（内容与 `etf_data.json` 相同），用 `<script>` 加载，因此 `file://` 与 GitHub Pages 都可用（`file://` 下浏览器不允许 `fetch()` 本地 JSON）。
- `dashboard/etf_data.json`：与原导出相同的 schema：`asof`、`dates`、`idx`、`c`、`ret`（含 5Y）、`last`、`prev`、`hi`、`lo`、`div`、`ttm`、`ret_method`、`weekly5y`、`fund`、`holdings`、`schd_ttm_yield`、`badge_marks`。
- 费用率来自 Yahoo Finance（经 yfinance）；规模（AUM）统一采用 StockAnalysis ETF 概览页「Assets」（ETF 份额类别净资产）；前十大持仓：VGT 来自 StockAnalysis（Finnhub），SMH 来自 VanEck 每日持仓。`dashboard_data.py` 会优先用 Playwright/Chrome 抓取这些页面（`dashboard/scrape_meta.mjs`）。抓取不可用、失败，或某个字段为空时，保留 `dashboard/etf_data.json` 里已有的规模和持仓，不用 `null` 覆盖；文件里也没有这些字段时才使用脚本内置快照。

### 功能

- 区间切换：1M / 3M / 6M / YTD / 1Y / 5Y。
- 单只查看或对比多只 ETF。
- SCHD 分红柱状图。
- 基金特征卡、行情一览表。
- 移动端 2×2 卡片布局。
- 绿色 ▲ 表示上涨、红色 ▼ 表示下跌，并带 +/− 符号。
- 缺失数据显示 `—`，不编造数据，不含任何预测。

### 更新数据

```bash
source venv/bin/activate && python dashboard_data.py
```

或直接使用：

```bash
venv/bin/python dashboard_data.py
```

脚本会重新抓取 yfinance 行情并覆盖 `dashboard/etf_data.json` 和 `dashboard/data.js`，并在终端打印数据截至日期（`asof`）。行情里取不到的字段写为 `null`，页面显示 `—`，不会编造数据，也不含预测。规模和持仓在页面抓取失败时保留已有快照。

同一刷新已接进每日工作流，见下文「自动更新」。

### 每日自动刷新

`.github/workflows/update.yml` 在 `python tracker.py` 之后运行 `python dashboard_data.py`。依赖与根报告相同，由该工作流的 `pip install -r requirements.txt` 安装（含 yfinance、pandas）。成功时把 `dashboard/etf_data.json` 和 `dashboard/data.js` 与根目录报告一并提交。

Playwright/Chrome 抓取规模和持仓是可选的。GitHub 托管 runner 上通常没有现成浏览器，这一步会保留仓库里已有的规模和持仓快照，而不是失败退出，也不会把这些字段写成 `null`。即便 `dashboard_data.py` 本身失败，工作流仍会提交根目录的 `index.html`、`report.html` 和 `chart.png`。

### 本地打开

直接双击或用浏览器打开 `dashboard/index.html`；也可以启动本地静态服务器：

```bash
python3 -m http.server 8000
```

然后访问 http://localhost:8000/dashboard/ 。

## 开启 GitHub Pages

1. 打开仓库的 **Settings → Pages**。
2. 将 **Source** 设为 **Deploy from a branch**。
3. **Branch** 选择 **main**，目录选择 **/(root)**，然后点击 **Save**。

仓库必须为公开（Public）才能免费使用 Pages。如需修改可见性，请前往 **Settings → General → Danger Zone → Change visibility**。

## 追踪标的

- **VGT**：Vanguard Information Technology ETF
- **SMH**：VanEck Semiconductor ETF
- **SCHD**：Schwab U.S. Dividend Equity ETF
- **GLD**：SPDR Gold Shares ETF

GLD 是黄金 ETF，在这里作为黄金敞口的代理。与直接使用金价相比，GLD 本身是 ETF，交易方式、价格形态和比较口径都与其他三只 ETF 更一致，因此便于放在同一张表中比较。

## 数据来源

数据来自 Yahoo Finance，通过 `yfinance` 获取。它是免费的，不需要 API key，也不需要注册账户。

## 安装

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 运行

```bash
python tracker.py
```

## 自动更新

自动更新由工作流 `.github/workflows/update.yml` 实现，周一至周五 UTC 22:30（即美股收盘后）运行。每次运行会更新根目录报告，并重新生成静态仪表盘数据（`dashboard/etf_data.json`、`dashboard/data.js`），因此仪表盘与根报告一样按交易日刷新。只在有变化时提交 `index.html`、`report.html`、`chart.png` 和上述两个仪表盘数据文件。提交后 GitHub Pages 会在几分钟内自动重新部署。GitHub 的定时任务可能有几分钟到更长的延迟。规模和持仓在 CI 无法抓取页面时沿用上一次快照，日期和来源仍标在页面上。仪表盘这一步失败时，根目录报告仍会照常提交。

如需手动触发：打开 **Actions** 标签页 → **Update ETF dashboard** → **Run workflow**。

若推送失败，需在 **Settings → Actions → General → Workflow permissions** 中选择 **Read and write permissions**。

## 输出

- 终端中的对齐表格，包含 Ticker、Name、Date、Price、1D %、1M %、1Y %
- `report.html`：自包含 HTML 报告，包含表格、走势图和黄金代理说明
- `index.html`：与 `report.html` 相同的自包含 HTML 报告，用于 GitHub Pages 首页
- `chart.png`：四只 ETF 近 1 年归一化走势图（起点为 100）
- `dashboard/index.html`、`dashboard/app.js`、`dashboard/style.css`：静态仪表盘页面（纯原生 JS/CSS）
- `dashboard/data.js`：供仪表盘通过 `<script>` 加载的数据（`window.ETF_DATA`）
- `dashboard/etf_data.json`：仪表盘数据（与原导出相同 schema），由 `dashboard_data.py` 生成，并随每日工作流一起提交

`tracker.py` 的输出写入脚本所在目录，`dashboard_data.py` 的输出写入 `dashboard/` 目录。另外仓库根目录有一个空的 `.nojekyll` 文件（非脚本生成），用于让 GitHub Pages 跳过 Jekyll、直接提供静态文件。

## 免责声明

数据可能存在延迟、缺失或错误，仅供参考，不构成任何投资建议。

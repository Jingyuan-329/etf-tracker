# ETF 表现追踪器

## 用途

`tracker.py` 会下载最近约 13 个月的每日行情，计算 4 只 ETF 的最新价格、最近交易日涨跌幅、近 1 个月涨跌幅和近 1 年涨跌幅，并在终端输出表格，同时生成走势图和自包含的 HTML 报告。

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

## 输出

- 终端中的对齐表格，包含 Ticker、Name、Date、Price、1D %、1M %、1Y %
- `report.html`：自包含 HTML 报告，包含表格、走势图和黄金代理说明
- `chart.png`：四只 ETF 近 1 年归一化走势图（起点为 100）

以上文件均写入脚本所在目录。

## 免责声明

数据可能存在延迟、缺失或错误，仅供参考，不构成任何投资建议。

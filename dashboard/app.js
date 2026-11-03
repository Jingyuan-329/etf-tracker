(function () {
  "use strict";

  var D = window.ETF_DATA;
  if (!D) return;

  var MINUS = "\u2212";

  var C = {
    bg: "#F9FAFB", card: "#FFFFFF", border: "#E5E7EB", g800: "#1D2939", g700: "#344054", g500: "#667085", g400: "#98A2B3",
    g100: "#F2F4F7", grid: "#F2F4F7", primary: "#465FFF", tint: "rgb(236,243,255)",
    up: "#039855", upBg: "#ECFDF3", down: "#D92D20", downBg: "#FEF3F2"
  };

  var SRC = "Yahoo Finance";
  var SRCSHORT = "Yahoo";

  var FETCHED = null;
  (function () {
    var s = D.fund && D.fund.expense_ratio_source;
    if (typeof s === "string") {
      var m = s.match(/fetched (\d{4}-\d{2}-\d{2})/);
      if (m) FETCHED = m[1];
    }
  })();
  var ASSETS_READ = null;
  (function () {
    var s = D.fund && D.fund.assets_source;
    if (typeof s === "string") {
      var m = s.match(/read (\d{4}-\d{2}-\d{2})/);
      if (m) ASSETS_READ = m[1];
    }
  })();

  var TK = ["VGT", "SMH", "SCHD", "GLD"];
  var META = {
    VGT: { cn: "信息科技", color: "#465FFF" },
    SMH: { cn: "半导体", color: "#7A5AF8" },
    SCHD: { cn: "美股红利", color: "#0BA5EC" },
    GLD: { cn: "黄金", color: "#F79009" }
  };
  var RANGES = [
    { k: "1M", label: "1M" }, { k: "3M", label: "3M" }, { k: "6M", label: "6M" },
    { k: "YTD", label: "YTD" }, { k: "1Y", label: "1Y" }, { k: "5Y", label: "5Y" }
  ];
  var RG_CN = { "1M": "近 1 个月", "3M": "近 3 个月", "6M": "近 6 个月", YTD: "年初至今", "1Y": "近 1 年", "5Y": "近 5 年" };

  var state = { tk: "VGT", rg: "1Y", cmp: false };

  var MARK = (D.badge_marks && typeof D.badge_marks === "object") ? D.badge_marks : {};
  var W5 = (D.weekly5y && typeof D.weekly5y === "object") ? D.weekly5y : { d5: [], c5: {}, r5: {} };
  var SCHD_DIV = (D.div && D.div.SCHD && D.div.SCHD.length) ? D.div.SCHD.slice(-8) : [];

  function fundOf(t) { return (D.fund && D.fund[t]) || {}; }
  function holdOf(t) { return (D.holdings && D.holdings[t]) || {}; }

  function srcShort(text) {
    if (typeof text !== "string" || !text) return SRC;
    if (/stockanalysis/i.test(text)) return "StockAnalysis";
    if (/vaneck/i.test(text)) return "VanEck";
    var a = text.split(" via yfinance")[0].trim();
    if (a && a.indexOf("http") !== 0) return a;
    var b = text.split(" (")[0].trim();
    if (b && b.indexOf("http") !== 0) return b;
    return text;
  }

  function derivedNames() {
    var names = [];
    function add(s) { var n = srcShort(s); if (n && names.indexOf(n) === -1) names.push(n); }
    if (D.fund) add(D.fund.assets_source);
    if (D.holdings) { add(D.holdings.VGT && D.holdings.VGT.source); add(D.holdings.SMH && D.holdings.SMH.source); }
    return names.length ? names.join("、") : SRC;
  }

  // ---- null-safe helpers -------------------------------------------------
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  function usd(v) {
    return isNum(v) ? "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "\u2014";
  }

  function sgn(v, digits) {
    if (!isNum(v)) return "\u2014";
    return (v > 0 ? "+" : v < 0 ? MINUS : "") + Math.abs(v).toFixed(digits);
  }

  function pct(v) {
    return isNum(v) ? sgn(v, 2) + "%" : "\u2014";
  }

  function arrow(v) {
    if (!isNum(v)) return "\u2014";
    return v > 0 ? "▲" : v < 0 ? "▼" : "\u2014";
  }

  function tone(v) {
    if (!isNum(v)) return C.g500;
    return v > 0 ? C.up : v < 0 ? C.down : C.g500;
  }

  function aumCn(v) {
    return isNum(v) ? "$" + Math.round(v / 1e8).toLocaleString("en-US") + " 亿" : "\u2014";
  }

  function md(d) {
    if (!d) return "\u2014";
    var p = String(d).split("-");
    return Number(p[1]) + "/" + Number(p[2]);
  }

  function ym(d) {
    if (!d) return "\u2014";
    var p = String(d).split("-");
    return p[0].slice(2) + "/" + p[1];
  }

  function dayChg(t) {
    return (isNum(D.last[t]) && isNum(D.prev[t])) ? D.last[t] - D.prev[t] : null;
  }

  function dayPct(t) {
    return (isNum(D.last[t]) && isNum(D.prev[t]) && D.prev[t] !== 0) ? (D.last[t] / D.prev[t] - 1) * 100 : null;
  }

  function fromHi(t) {
    return (isNum(D.last[t]) && isNum(D.hi[t]) && D.hi[t] !== 0) ? (D.last[t] / D.hi[t] - 1) * 100 : null;
  }

  function erText(t) {
    var f = fundOf(t);
    return isNum(f.expense_ratio_pct) ? f.expense_ratio_pct.toFixed(2) + "%" : "\u2014";
  }

  function aumText(t) {
    return aumCn(fundOf(t).assets_usd);
  }

  // ---- DOM helpers -------------------------------------------------------
  function el(tag, props, children) {
    var e = document.createElement(tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === "class" || k === "className") e.className = v;
        else if (k === "style") { for (var s in v) e.style[s] = v[s]; }
        else if (k === "text") e.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
        else e.setAttribute(k, v);
      }
    }
    append(e, children);
    return e;
  }

  function append(e, children) {
    if (children == null) return;
    var arr = Array.isArray(children) ? children : [children];
    for (var i = 0; i < arr.length; i++) {
      var c = arr[i];
      if (c == null || c === false) continue;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
  }

  var SVGNS = "http://www.w3.org/2000/svg";
  function svgAttr(k) {
    if (k === "viewBox" || k === "class" || k === "role" || k === "aria-label") return k;
    return k.replace(/([A-Z])/g, function (m) { return "-" + m.toLowerCase(); });
  }
  function svgEl(tag, props, children) {
    var e = document.createElementNS(SVGNS, tag);
    if (props) {
      for (var k in props) {
        var v = props[k];
        if (v == null || v === false) continue;
        if (k === "style") { for (var s in v) e.style[s] = v[s]; }
        else e.setAttribute(svgAttr(k), v);
      }
    }
    if (children != null) {
      var arr = Array.isArray(children) ? children : [children];
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i];
        if (c == null || c === false) continue;
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      }
    }
    return e;
  }

  // ---- components --------------------------------------------------------
  function Pill(v) {
    var span = el("span", { class: "pill" });
    if (!isNum(v)) {
      span.style.background = C.g100;
      span.style.color = C.g500;
      span.textContent = "\u2014";
      return span;
    }
    span.style.background = v > 0 ? C.upBg : v < 0 ? C.downBg : C.g100;
    span.style.color = tone(v);
    span.textContent = arrow(v) + " " + pct(v);
    return span;
  }

  function Chg(v, opts) {
    var suffix = (opts && opts.suffix) || "";
    var digits = (opts && opts.digits !== undefined) ? opts.digits : 2;
    var span = el("span");
    span.style.fontWeight = 500;
    span.style.whiteSpace = "nowrap";
    if (!isNum(v)) {
      span.style.color = C.g500;
      span.textContent = "\u2014";
      return span;
    }
    span.style.color = tone(v);
    span.textContent = arrow(v) + " " + sgn(v, digits) + suffix;
    return span;
  }

  function Badge(t, size) {
    var mark = (MARK[t] != null && MARK[t] !== "") ? String(MARK[t]) : t;
    var fontScale = mark.length > 1 ? 0.34 : 0.42;
    return el("div", {
      style: {
        width: size + "px", height: size + "px", borderRadius: "999px", background: META[t].color,
        color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * fontScale) + "px", fontWeight: 700, flexShrink: 0
      },
      text: mark,
      "aria-hidden": "true"
    });
  }

  function Seg(opts, value, onChange) {
    var div = el("div", { class: "seg", role: "tablist" });
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      div.appendChild(el("button", {
        class: o.k === value ? "on" : "",
        onclick: (function (k) { return function () { onChange(k); }; })(o.k),
        text: o.label
      }));
    }
    return div;
  }

  function Head(opts) {
    var wrap = el("div", {
      style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }
    });
    var left = el("div", { style: { minWidth: 0 } });
    left.appendChild(el("div", { class: "ctitle", text: opts.title }));
    if (opts.sub) left.appendChild(el("div", { class: "sec", style: { marginTop: "4px" }, text: opts.sub }));
    wrap.appendChild(left);
    if (opts.right) wrap.appendChild(opts.right);
    return wrap;
  }

  function AreaChart(props) {
    var dates = props.dates;
    var series = props.series;
    var weekly = props.weekly;
    var base = props.base;
    var fmt = props.fmt;
    var axis = props.axis;

    var L = 52, R = 10, T = 10, B = 28;

    var container = el("div", { style: { position: "relative", width: "100%" } });
    var svg = svgEl("svg", { width: "100%", role: "img", "aria-label": "价格走势面积图", style: { display: "block", touchAction: "pan-y" } });
    var tooltip = el("div", {
      style: {
        display: "none", position: "absolute", top: "6px", background: "#fff", border: "1px solid " + C.border,
        borderRadius: "10px", boxShadow: "0 4px 12px rgba(16,24,40,.10)", padding: "8px 10px",
        fontSize: "12px", pointerEvents: "none", minWidth: "120px"
      }
    });
    container.appendChild(svg);
    container.appendChild(tooltip);

    var w = 760;
    var hov = null;

    function draw() {
      var n = dates.length;
      if (!n) { svg.textContent = ""; return; }
      var H = w < 640 ? 250 : 310;

      var all = [];
      for (var i = 0; i < series.length; i++) for (var j = 0; j < series[i].vals.length; j++) {
        if (isNum(series[i].vals[j])) all.push(series[i].vals[j]);
      }
      if (!all.length) { svg.textContent = ""; tooltip.style.display = "none"; return; }

      var mn = Math.min.apply(null, all), mx = Math.max.apply(null, all);
      if (base !== undefined) { mn = Math.min(mn, base); mx = Math.max(mx, base); }
      var raw = (mx - mn) / 4 || 1;
      var p10 = Math.pow(10, Math.floor(Math.log10(raw)));
      var m = raw / p10;
      var step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p10;
      var lo = Math.floor(mn / step) * step, hi = Math.ceil(mx / step) * step;
      var x = function (i) { return L + (n <= 1 ? 0 : (i / (n - 1)) * (w - L - R)); };
      var y = function (v) { return T + ((hi - v) / (hi - lo || 1)) * (H - T - B); };

      function pathLine(vals) {
        var segs = [];
        var cur = "";
        var open = false;
        for (var i = 0; i < vals.length; i++) {
          if (!isNum(vals[i])) { if (open) { segs.push(cur.trim()); cur = ""; open = false; } continue; }
          cur += (open ? "L" : "M") + x(i).toFixed(1) + " " + y(vals[i]).toFixed(1) + " ";
          open = true;
        }
        if (open) segs.push(cur.trim());
        return segs;
      }

      function pathFill(vals) {
        var pts = [];
        for (var i = 0; i < vals.length; i++) if (isNum(vals[i])) pts.push(i);
        if (!pts.length) return "";
        var first = pts[0], last = pts[pts.length - 1];
        var d = "M" + x(first).toFixed(1) + " " + y(vals[first]).toFixed(1);
        for (var k = 1; k < pts.length; k++) d += "L" + x(pts[k]).toFixed(1) + " " + y(vals[pts[k]]).toFixed(1);
        d += " L " + x(last).toFixed(1) + " " + (H - B) + " L " + x(first).toFixed(1) + " " + (H - B) + " Z";
        return d;
      }

      var yt = [];
      for (var v = lo; v <= hi + step / 2; v += step) yt.push(v);
      var nt = w < 360 ? 2 : w < 500 ? 4 : 6;
      var xtSet = [];
      for (var k = 0; k < nt; k++) xtSet.push(Math.round((k * (n - 1)) / (nt - 1)));
      var single = series.length === 1;
      var xl = function (d) { return weekly ? ym(d) : md(d); };

      svg.textContent = "";
      svg.setAttribute("height", String(H));
      svg.setAttribute("viewBox", "0 0 " + w + " " + H);

      for (var a = 0; a < yt.length; a++) {
        svg.appendChild(svgEl("line", { x1: L, x2: w - R, y1: y(yt[a]), y2: y(yt[a]), stroke: C.grid }));
        svg.appendChild(svgEl("text", { x: L - 8, y: y(yt[a]) + 4, textAnchor: "end", fontSize: 12, fill: C.g400 }, axis(yt[a])));
      }
      if (base !== undefined) {
        svg.appendChild(svgEl("line", { x1: L, x2: w - R, y1: y(base), y2: y(base), stroke: C.g400, strokeDasharray: "4 4" }));
      }
      for (var b = 0; b < xtSet.length; b++) {
        var xi = xtSet[b];
        svg.appendChild(svgEl("text", {
          x: x(xi), y: H - 8, textAnchor: xi === 0 ? "start" : xi === n - 1 ? "end" : "middle", fontSize: 12, fill: C.g400
        }, xl(dates[xi])));
      }
      for (var si = 0; si < series.length; si++) {
        var s = series[si];
        var segs = pathLine(s.vals);
        var g = svgEl("g");
        if (single) {
          var fpath = pathFill(s.vals);
          if (fpath) g.appendChild(svgEl("path", { d: fpath, fill: s.color, fillOpacity: 0.1 }));
        }
        for (var sg = 0; sg < segs.length; sg++) {
          g.appendChild(svgEl("path", { d: segs[sg], fill: "none", stroke: s.color, strokeWidth: single ? 2 : 1.6, strokeLinejoin: "round" }));
        }
        svg.appendChild(g);
      }

      if (hov !== null) {
        var hx = x(hov);
        var hg = svgEl("g");
        hg.appendChild(svgEl("line", { x1: hx, x2: hx, y1: T, y2: H - B, stroke: C.border }));
        for (var ci = 0; ci < series.length; ci++) {
          if (!isNum(series[ci].vals[hov])) continue;
          hg.appendChild(svgEl("circle", { cx: hx, cy: y(series[ci].vals[hov]), r: 4, fill: "#fff", stroke: series[ci].color, strokeWidth: 2 }));
        }
        svg.appendChild(hg);

        var rightSide = hx / w > 0.55;
        tooltip.style.display = "block";
        tooltip.style.left = rightSide ? "" : (hx + 12) + "px";
        tooltip.style.right = rightSide ? (w - hx + 12) + "px" : "";
        tooltip.textContent = "";
        tooltip.appendChild(el("div", { style: { color: C.g500, marginBottom: "4px" }, text: dates[hov] + (weekly ? " · 复权周收盘" : " · 复权收盘") }));
        for (var ti = 0; ti < series.length; ti++) {
          var ts = series[ti];
          var row = el("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px" } });
          var label = el("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px" } });
          label.appendChild(el("span", { style: { width: "8px", height: "8px", borderRadius: "999px", background: ts.color } }));
          label.appendChild(document.createTextNode(ts.name));
          row.appendChild(label);
          row.appendChild(el("span", { style: { fontWeight: 600 }, text: fmt(ts.vals[hov]) }));
          tooltip.appendChild(row);
        }
      } else {
        tooltip.style.display = "none";
      }
    }

    function onMove(e) {
      var r = svg.getBoundingClientRect();
      var n = dates.length;
      if (!n || r.width === 0) return;
      var sx = ((e.clientX - r.left) / r.width) * w;
      var i = Math.round(((sx - L) / (w - L - R)) * (n - 1));
      hov = Math.max(0, Math.min(n - 1, i));
      draw();
    }
    function onLeave() { hov = null; draw(); }

    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerleave", onLeave);

    function updateWidth() {
      var cw = container.getBoundingClientRect().width;
      var nw = Math.max(260, Math.round(cw));
      if (nw !== w) { w = nw; draw(); }
    }
    updateWidth();
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(updateWidth);
      ro.observe(container);
    }

    return container;
  }

  function DivBars(rows) {
    var W = 480, BAR = 200, TOP = 22, BOT = 34, H = TOP + BAR + BOT, P = 4;
    var n = rows.length;
    var svgStyle = { display: "block", maxWidth: "600px", margin: "0 auto" };
    if (!n) return svgEl("svg", { width: "100%", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "SCHD 近 8 季每股分红", style: svgStyle });
    var mx = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    var slot = (W - 2 * P) / n;
    var bw = Math.min(32, slot * 0.6);
    var svg = svgEl("svg", { width: "100%", viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "SCHD 近 8 季每股分红", style: svgStyle });
    for (var i = 0; i < n; i++) {
      var r = rows[i];
      var h = (r[1] / mx) * (BAR - 8);
      var cx = P + slot * i + slot / 2;
      var p = r[0].split("-");
      var g = svgEl("g");
      g.appendChild(svgEl("rect", { x: cx - bw / 2, y: TOP, width: bw, height: BAR, rx: 8, fill: C.g100 }));
      g.appendChild(svgEl("rect", { x: cx - bw / 2, y: TOP + BAR - h, width: bw, height: h, rx: 8, fill: C.primary, fillOpacity: i === n - 1 ? 1 : 0.8 }));
      g.appendChild(svgEl("text", { x: cx, y: TOP + BAR - h - 6, textAnchor: "middle", fontSize: 10, fontWeight: 600, fill: C.g700 }, r[1].toFixed(3)));
      g.appendChild(svgEl("text", { x: cx, y: TOP + BAR + 14, textAnchor: "middle", fontSize: 10.5, fill: C.g500 }, p[1] + "-" + p[2]));
      g.appendChild(svgEl("text", { x: cx, y: TOP + BAR + 28, textAnchor: "middle", fontSize: 10, fill: C.g400 }, p[0]));
      svg.appendChild(g);
    }
    return svg;
  }

  function statBox(label, value, color) {
    var d = el("div");
    d.appendChild(el("div", { class: "sec", text: label }));
    var s = { fontSize: "18px", fontWeight: 600 };
    if (color) s.color = color;
    d.appendChild(el("div", { style: s, text: value }));
    return d;
  }

  function tickerCell(t, size) {
    var d = el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
    d.appendChild(Badge(t, size));
    var inner = el("div");
    inner.appendChild(el("div", { style: { fontWeight: 600 }, text: t }));
    inner.appendChild(el("div", { class: "sec", text: META[t].cn }));
    d.appendChild(inner);
    return d;
  }

  function mobField(label, child) {
    var d = el("div");
    d.appendChild(document.createTextNode(label));
    d.appendChild(child);
    return d;
  }

  function fundRow(t, title, sub, border) {
    var style = { display: "flex", gap: "12px", padding: "12px 0" };
    if (border !== false) style.borderBottom = "1px solid " + C.g100;
    var row = el("div", { style: style });
    row.appendChild(Badge(t, 32));
    var body = el("div", { style: { minWidth: 0, flex: 1 } });
    body.appendChild(el("div", { style: { fontSize: "14px", fontWeight: 600 }, text: title }));
    body.appendChild(el("div", { class: "sec", style: { marginTop: "2px" }, text: sub }));
    row.appendChild(body);
    return row;
  }

  function schdMonths() {
    var m = [];
    for (var i = 0; i < SCHD_DIV.length; i++) {
      var p = String(SCHD_DIV[i][0]).split("-");
      var mo = Number(p[1]);
      if (m.indexOf(mo) === -1) m.push(mo);
    }
    m.sort(function (a, b) { return a - b; });
    return m.join("/");
  }

  // ---- render ------------------------------------------------------------
  function render() {
    var root = document.getElementById("root");
    if (!root) {
      root = document.createElement("div");
      root.id = "root";
      root.className = "etfd";
      root.setAttribute("lang", "zh-Hans");
      document.body.appendChild(root);
    }
    root.textContent = "";

    var tk = state.tk, rg = state.rg, cmp = state.cmp;
    var asof = D.asof || "\u2014";
    var weekly = rg === "5Y";
    var dates = weekly ? (W5.d5 || []) : D.dates.slice(D.idx[rg]);
    var raw = function (t) { return weekly ? ((W5.c5 && W5.c5[t]) || []) : D.c[t].slice(D.idx[rg]); };
    var rret = function (t) { return weekly ? (W5.r5 && W5.r5[t]) : D.ret[t][rg]; };

    var series;
    if (cmp) {
      series = TK.map(function (t) {
        var s = raw(t);
        var baseVal = null;
        for (var i = 0; i < s.length; i++) { if (isNum(s[i])) { baseVal = s[i]; break; } }
        return {
          name: t, color: META[t].color,
          vals: s.map(function (v) { return (isNum(v) && isNum(baseVal) && baseVal !== 0) ? (v / baseVal) * 100 : null; })
        };
      });
    } else {
      series = [{ name: tk, color: META[tk].color, vals: raw(tk) }];
    }

    var schdTtm = SCHD_DIV.slice(-4).reduce(function (a, r) { return a + r[1]; }, 0);
    var schdYld = (isNum(D.last.SCHD) && D.last.SCHD !== 0) ? (schdTtm / D.last.SCHD) * 100 : null;
    var lastEx = SCHD_DIV.length ? SCHD_DIV[SCHD_DIV.length - 1] : null;

    var stamp = "截至 " + asof + " 收盘 · 来源 " + SRC;
    var fundStamp = "来源 " + SRC + " 基金资料 · 抓取于 " + (FETCHED || "\u2014");
    var assetsShort = srcShort(D.fund && D.fund.assets_source);
    var assetsRead = ASSETS_READ || FETCHED || "\u2014";
    var assetsStamp = assetsShort + "，读取于 " + assetsRead;

    var wrap = el("div", { class: "wrap" });
    var grid = el("div", { class: "g12" });

    // header
    var header = el("div", { class: "s12", style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "12px" } });
    var hLeft = el("div");
    hLeft.appendChild(el("div", { style: { fontSize: "26px", fontWeight: 600, color: C.g800 }, text: "ETF 观察仪表盘" }));
    hLeft.appendChild(el("div", { class: "sec", style: { marginTop: "6px", fontSize: "14px" }, text: "VGT 信息科技 · SMH 半导体 · SCHD 美股红利 · GLD 黄金" }));
    header.appendChild(hLeft);
    var hRight = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" } });
    var hPill = el("span", { style: { display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: C.tint, color: C.primary, borderRadius: "999px", fontSize: "13px", fontWeight: 600 } });
    hPill.appendChild(el("span", { style: { width: "8px", height: "8px", borderRadius: "999px", background: C.primary } }));
    hPill.appendChild(document.createTextNode("数据截至 " + asof + " 收盘（美东）"));
    hRight.appendChild(hPill);
    hRight.appendChild(el("span", { class: "sec", style: { fontSize: "13px" }, text: "价格与分红：" + SRC + "（经 yfinance）· 持仓与规模：" + derivedNames() }));
    header.appendChild(hRight);
    grid.appendChild(header);

    // 4 ETF cards
    for (var a = 0; a < TK.length; a++) {
      var t = TK[a];
      var etf = el("div", { class: "etf" });
      var card = el("div", { class: "card", style: { height: "100%" } });
      var topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
      topRow.appendChild(Badge(t, 36));
      var ttl = el("div", { style: { minWidth: 0 } });
      ttl.appendChild(el("div", { style: { fontSize: "16px", fontWeight: 600 }, text: t }));
      ttl.appendChild(el("div", { class: "sec", text: META[t].cn }));
      topRow.appendChild(ttl);
      card.appendChild(topRow);
      var priceRow = el("div", { style: { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "6px", marginTop: "14px" } });
      priceRow.appendChild(el("div", { class: "price", style: { fontSize: "24px", fontWeight: 600 }, text: usd(D.last[t]) }));
      priceRow.appendChild(Pill(dayPct(t)));
      card.appendChild(priceRow);
      var retLine = el("div", { class: "sec", style: { marginTop: "8px", lineHeight: "1.6" } });
      var l1 = el("div");
      l1.appendChild(el("span", { class: "m-long", text: "年初至今回报 " }));
      l1.appendChild(el("span", { class: "m-short", text: "YTD " }));
      l1.appendChild(Chg(D.ret[t].YTD, { suffix: "%" }));
      retLine.appendChild(l1);
      var l2 = el("div");
      if (fromHi(t) === 0) {
        var hIn = el("span");
        hIn.appendChild(el("span", { class: "m-long", text: "处于 52 周高点（收盘价）" }));
        hIn.appendChild(el("span", { class: "m-short", text: "处于高点" }));
        l2.appendChild(hIn);
      } else {
        l2.appendChild(el("span", { class: "m-long", text: "距 52 周高点（收盘价） " }));
        l2.appendChild(el("span", { class: "m-short", text: "距高点 " }));
        l2.appendChild(Chg(fromHi(t), { suffix: "%" }));
      }
      retLine.appendChild(l2);
      card.appendChild(retLine);
      var meta = el("div", { class: "meta" });
      meta.appendChild(el("span", { class: "m-long", text: asof + " 收盘 · " + SRC }));
      meta.appendChild(el("span", { class: "m-short", text: (asof.length > 5 ? asof.slice(5) : asof) + " 收盘 · " + SRCSHORT }));
      card.appendChild(meta);
      etf.appendChild(card);
      grid.appendChild(etf);
    }

    // price chart card (full width)
    var left = el("div", { class: "left" });
    var chartCard = el("div", { class: "card" });
    chartCard.appendChild(Head({
      title: cmp ? "相对表现（起点 = 100）" : tk + " " + META[tk].cn + " · 价格走势",
      sub: (dates && dates.length ? dates[0] : "\u2014") + " 至 " + asof + " · " + (weekly ? "周收盘" : "日收盘") + "（复权）",
      right: Seg(RANGES, rg, function (v) { state.rg = v; render(); })
    }));
    var controls = el("div", { style: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px" } });
    var ctlLeft = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" } });
    ctlLeft.appendChild(Seg(TK.map(function (x) { return { k: x, label: x }; }), tk, function (v) { state.tk = v; state.cmp = false; render(); }));
    ctlLeft.appendChild(Seg([{ k: "off", label: "单只" }, { k: "on", label: "对比" }], cmp ? "on" : "off", function (v) { state.cmp = (v === "on"); render(); }));
    controls.appendChild(ctlLeft);
    if (cmp) {
      var leg = el("div", { style: { display: "flex", flexWrap: "wrap", gap: "12px" } });
      for (var l1 = 0; l1 < TK.length; l1++) {
        var lt = TK[l1];
        var ls = el("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" } });
        ls.appendChild(el("span", { style: { width: "10px", height: "10px", borderRadius: "3px", background: META[lt].color } }));
        ls.appendChild(el("span", { style: { fontWeight: 600 }, text: lt }));
        ls.appendChild(Chg(rret(lt), { suffix: "%" }));
        leg.appendChild(ls);
      }
      controls.appendChild(leg);
    } else {
      var singleBox = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } });
      singleBox.appendChild(el("span", { style: { fontSize: "22px", fontWeight: 600 }, text: usd(D.last[tk]) }));
      singleBox.appendChild(Pill(rret(tk)));
      singleBox.appendChild(el("span", { class: "sec", text: RG_CN[rg] }));
      controls.appendChild(singleBox);
    }
    chartCard.appendChild(controls);
    chartCard.appendChild(AreaChart({
      dates: dates,
      series: series,
      weekly: weekly,
      base: cmp ? 100 : undefined,
      fmt: cmp ? function (v) { return isNum(v) ? v.toFixed(1) : "\u2014"; } : usd,
      axis: cmp ? function (v) { return String(Math.round(v)); } : function (v) { return "$" + (v >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)); }
    }));
    chartCard.appendChild(el("div", { class: "meta", text: stamp + " · 走势与区间回报使用复权收盘价（含分红、拆股调整）" + (weekly ? "；5Y 为每周五收盘，起点 " + (W5.d5 && W5.d5.length ? W5.d5[0] : "\u2014") : "") }));
    left.appendChild(chartCard);
    grid.appendChild(left);

    // SCHD dividend card (half)
    var divHalf = el("div", { class: "half" });
    var divCard = el("div", { class: "card", style: { height: "100%" } });
    divCard.appendChild(Head({ title: "SCHD 分红", sub: "近 8 个季度 · 每股金额（美元）· 按除息日" }));
    divCard.appendChild(DivBars(SCHD_DIV));
    var g3 = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "12px", marginTop: "14px" } });
    g3.appendChild(statBox("近 12 个月分红合计", "$" + schdTtm.toFixed(3)));
    g3.appendChild(statBox("TTM 股息率", isNum(schdYld) ? schdYld.toFixed(2) + "%" : "\u2014", C.primary));
    g3.appendChild(statBox("最近除息日", lastEx ? lastEx[0] : "\u2014"));
    divCard.appendChild(g3);
    var formula = "口径：近 4 次分红÷收盘价 = (" +
      SCHD_DIV.slice(-4).map(function (r) { return r[1].toFixed(3); }).join(" + ") +
      ") ÷ " + usd(D.last.SCHD) + " = " + (isNum(schdYld) ? schdYld.toFixed(2) + "%" : "\u2014");
    divCard.appendChild(el("div", { class: "sec", style: { marginTop: "10px", lineHeight: "1.6" }, text: formula }));
    divCard.appendChild(el("div", { class: "meta", text: "分红截至 " + (lastEx ? lastEx[0] : "\u2014") + " 除息 · 价格" + stamp }));
    divHalf.appendChild(divCard);
    grid.appendChild(divHalf);

    // fund features card (half)
    var fundHalf = el("div", { class: "half" });
    var fundCard = el("div", { class: "card", style: { height: "100%" } });
    fundCard.appendChild(Head({ title: "基金特征" }));
    var fcol = el("div", { style: { display: "flex", flexDirection: "column" } });
    for (var f1 = 0; f1 < 2; f1++) {
      var ft = TK[f1];
      var fh = holdOf(ft);
      var top10 = isNum(fh.top10_pct) ? fh.top10_pct.toFixed(2) + "%" : "\u2014";
      var n1 = (fh.top1 != null && fh.top1 !== "") ? fh.top1 : "\u2014";
      var w1 = isNum(fh.top1_pct) ? fh.top1_pct.toFixed(2) + "%" : "\u2014";
      var asofH = (fh.as_of != null && fh.as_of !== "") ? fh.as_of : "\u2014";
      var srcH = (fh.source != null && fh.source !== "") ? fh.source : "\u2014";
      var row = el("div", { style: { display: "flex", gap: "12px", padding: "12px 0", borderBottom: "1px solid " + C.g100 } });
      row.appendChild(Badge(ft, 32));
      var body = el("div", { style: { minWidth: 0, flex: 1 } });
      body.appendChild(el("div", { style: { fontSize: "14px", fontWeight: 600 }, text: ft + " · 前十大持仓占比 " + top10 }));
      body.appendChild(el("div", { class: "sec", style: { marginTop: "2px" }, text: "第一大持仓 " + n1 + " " + w1 }));
      body.appendChild(el("div", { class: "sec", text: "持仓截至 " + asofH + " · 来源 " + srcH }));
      row.appendChild(body);
      fcol.appendChild(row);
    }
    var schdFirst = SCHD_DIV.length ? String(SCHD_DIV[0][0]).slice(0, 7) : "\u2014";
    var schdLast = SCHD_DIV.length ? String(SCHD_DIV[SCHD_DIV.length - 1][0]).slice(0, 7) : "\u2014";
    var schdSub = SCHD_DIV.length
      ? "过去 " + SCHD_DIV.length + " 次除息分别在 " + schdMonths() + " 月（" + schdFirst + " 至 " + schdLast + "）"
      : "\u2014";
    fcol.appendChild(fundRow("SCHD", "SCHD · 每季度派息", schdSub));
    fcol.appendChild(fundRow("GLD", "GLD · 无分红 · 持有实物黄金", "作为黄金价格代理", false));
    fundCard.appendChild(fcol);
    var metaH = [];
    for (var f2 = 0; f2 < 2; f2++) {
      var ht = TK[f2];
      var hh = holdOf(ht);
      var hasof = (hh.as_of != null && hh.as_of !== "") ? hh.as_of : "\u2014";
      metaH.push(ht + " 截至 " + hasof + " · " + srcShort(hh.source));
    }
    metaH.push("SCHD 除息日 · " + SRC);
    fundCard.appendChild(el("div", { class: "meta", text: "持仓：" + metaH.join("；") }));
    fundHalf.appendChild(fundCard);
    grid.appendChild(fundHalf);

    // 行情一览 table
    var tableCard = el("div", { class: "s12" });
    var qCard = el("div", { class: "card" });
    qCard.appendChild(Head({ title: "行情一览", sub: stamp + " · 费用率：" + fundStamp + " · 规模：" + assetsStamp }));
    var qdesk = el("div", { class: "qdesk" });
    var qt = el("table", { class: "qt" });
    var thead = el("thead");
    var thr = el("tr");
    var heads = ["代码", "收盘", "涨跌", "涨跌%", "年初至今", "1Y", "52周低–高（收盘）", "费用率", "规模*", "日期/来源"];
    for (var h1 = 0; h1 < heads.length; h1++) {
      var cls = "";
      if (h1 === 0) cls = "l stk";
      else if (h1 === heads.length - 1) cls = "l";
      thr.appendChild(el("th", { class: cls, text: heads[h1] }));
    }
    thead.appendChild(thr);
    qt.appendChild(thead);
    var tbody = el("tbody");
    for (var q1 = 0; q1 < TK.length; q1++) {
      var qt1 = TK[q1];
      var qtr = el("tr");
      var qtd0 = el("td", { class: "l stk" });
      qtd0.appendChild(tickerCell(qt1, 28));
      qtr.appendChild(qtd0);
      qtr.appendChild(el("td", { style: { fontWeight: 600 }, text: usd(D.last[qt1]) }));
      qtr.appendChild(el("td", null, Chg(dayChg(qt1))));
      qtr.appendChild(el("td", null, Pill(dayPct(qt1))));
      qtr.appendChild(el("td", null, Chg(D.ret[qt1].YTD, { suffix: "%" })));
      qtr.appendChild(el("td", null, Chg(D.ret[qt1]["1Y"], { suffix: "%" })));
      qtr.appendChild(el("td", { text: usd(D.lo[qt1]) + " – " + usd(D.hi[qt1]) }));
      qtr.appendChild(el("td", { text: erText(qt1) }));
      qtr.appendChild(el("td", { text: aumText(qt1) }));
      qtr.appendChild(el("td", { class: "l sec", text: asof + " · " + SRC }));
      tbody.appendChild(qtr);
    }
    qt.appendChild(tbody);
    qdesk.appendChild(qt);
    qCard.appendChild(qdesk);

    var qmob = el("div", { class: "qmob" });
    for (var q2 = 0; q2 < TK.length; q2++) {
      var mt = TK[q2];
      var mc = el("div", { style: { border: "1px solid " + C.border, borderRadius: "12px", padding: "12px" } });
      var mTop = el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } });
      mTop.appendChild(Badge(mt, 28));
      mTop.appendChild(el("div", { style: { flex: 1, minWidth: 0, fontWeight: 600 }, text: mt }));
      mTop.appendChild(el("div", { style: { fontWeight: 600 }, text: usd(D.last[mt]) }));
      mTop.appendChild(Pill(dayPct(mt)));
      mc.appendChild(mTop);
      var mGrid = el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px", marginTop: "10px", fontSize: "12px", color: C.g500 } });
      mGrid.appendChild(mobField("涨跌 ", Chg(dayChg(mt))));
      mGrid.appendChild(mobField("年初至今 ", Chg(D.ret[mt].YTD, { suffix: "%" })));
      mGrid.appendChild(mobField("1Y ", Chg(D.ret[mt]["1Y"], { suffix: "%" })));
      mGrid.appendChild(mobField("费用率 ", el("span", { style: { color: C.g800 }, text: erText(mt) })));
      var m52 = el("div", { style: { gridColumn: "span 2" } });
      m52.appendChild(document.createTextNode("52周（收盘） "));
      m52.appendChild(el("span", { style: { color: C.g800 }, text: usd(D.lo[mt]) + " – " + usd(D.hi[mt]) }));
      mGrid.appendChild(m52);
      var mAum = el("div", { style: { gridColumn: "span 2" } });
      mAum.appendChild(document.createTextNode("规模* "));
      mAum.appendChild(el("span", { style: { color: C.g800 }, text: aumText(mt) + " · " + assetsShort + " " + assetsRead }));
      mGrid.appendChild(mAum);
      mc.appendChild(mGrid);
      qmob.appendChild(mc);
    }
    qCard.appendChild(qmob);
    qCard.appendChild(el("div", { class: "sec", style: { marginTop: "12px" }, text: "涨跌与涨跌% 为当日收盘相对前收；52 周低–高及卡片「距高点」均按近 1 年实际收盘价计算（非盘中）。规模* = " + (D.fund && D.fund.assets_source || "\u2014") + "。绿色 ▲ 为上涨，红色 ▼ 为下跌。" }));
    tableCard.appendChild(qCard);
    grid.appendChild(tableCard);

    // 数据说明 card
    var notesCard = el("div", { class: "s12" });
    var nCard = el("div", { class: "card" });
    nCard.appendChild(Head({ title: "数据说明" }));
    var ncol = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: C.g500, lineHeight: "1.6" } });
    var ytdStart = (D.dates && D.idx && D.dates[D.idx.YTD]) ? D.dates[D.idx.YTD] : "\u2014";
    var y1Start = (D.dates && D.dates.length) ? D.dates[0] : "\u2014";
    var y5Start = (W5.d5 && W5.d5.length) ? W5.d5[0] : "\u2014";
    ncol.appendChild(el("div", { text: "• 价格、分红与费用率来源：" + SRC + "（经 yfinance 于 " + (FETCHED || "\u2014") + " 拉取）。" }));
    ncol.appendChild(el("div", { text: "• 卡片与表格的收盘、涨跌、52 周区间为实际收盘价；走势图与区间回报（年初至今、1Y、5Y 等）为复权收盘价。年初至今起点为 " + ytdStart + " 收盘，1Y 起点为 " + y1Start + "，5Y 起点为 " + y5Start + "（每周五收盘）。" }));
    ncol.appendChild(el("div", { text: "• 股息率口径：SCHD 为近 4 次季度分红合计÷最新收盘。VGT 于 2026-04-21 进行 1 拆 8，历史价格与分红已按拆股调整。" }));
    var erSrc = (D.fund && D.fund.expense_ratio_source) || "\u2014";
    var asSrc = (D.fund && D.fund.assets_source) || "\u2014";
    var vgtSrc = (holdOf("VGT").source) || "\u2014";
    var smhSrc = (holdOf("SMH").source) || "\u2014";
    var vgtAsof = (holdOf("VGT").as_of != null && holdOf("VGT").as_of !== "") ? holdOf("VGT").as_of : "\u2014";
    var smhAsof = (holdOf("SMH").as_of != null && holdOf("SMH").as_of !== "") ? holdOf("SMH").as_of : "\u2014";
    ncol.appendChild(el("div", { text: "• 费用率取自 " + erSrc + "；规模取自 " + asSrc + "。前十大持仓：VGT 取自 " + vgtSrc + "，截至 " + vgtAsof + "；SMH 取自 " + smhSrc + "，截至 " + smhAsof + "。GLD 以 SPDR 黄金 ETF 代替现货金价。" }));
    ncol.appendChild(el("div", { text: "• 本页是每日收盘后写入的静态快照，打开后不会自行拉取行情，不含任何预测或目标价。" }));
    var srcLine = el("div", { style: { marginTop: "4px" } });
    srcLine.appendChild(document.createTextNode("原始数据："));
    for (var s1 = 0; s1 < TK.length; s1++) {
      var st = TK[s1];
      var sp = el("span");
      sp.appendChild(document.createTextNode(" "));
      sp.appendChild(el("a", { href: "https://finance.yahoo.com/quote/" + st + "/history/", target: "_blank", rel: "noreferrer", text: st + " 历史价格" }));
      if (st === "VGT") {
        sp.appendChild(document.createTextNode(" · "));
        sp.appendChild(el("a", { href: "https://stockanalysis.com/etf/vgt/holdings/", target: "_blank", rel: "noreferrer", text: "VGT 持仓（StockAnalysis）" }));
      }
      if (st === "SMH") {
        sp.appendChild(document.createTextNode(" · "));
        sp.appendChild(el("a", { href: "https://www.vaneck.com/us/en/investments/semiconductor-etf-smh/holdings/", target: "_blank", rel: "noreferrer", text: "SMH 持仓（VanEck）" }));
      }
      if (st !== "GLD") sp.appendChild(document.createTextNode("；"));
      srcLine.appendChild(sp);
    }
    ncol.appendChild(srcLine);
    nCard.appendChild(ncol);
    notesCard.appendChild(nCard);
    grid.appendChild(notesCard);

    wrap.appendChild(grid);
    root.appendChild(wrap);
  }

  render();
})();

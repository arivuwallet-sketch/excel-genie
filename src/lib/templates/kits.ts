import { S, type FinancialTemplate } from "./types.ts";

/**
 * Spec-driven template kits. Each kit is a fully formula-linked workbook
 * builder; the industry specs below only supply labels, drivers and sample
 * data, so every generated template shares the same audited structure.
 * Only functions supported by the in-app calculator are used so previews,
 * Power BI reports and Excel all agree.
 */

const col = (i: number) => {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Deterministic PRNG so sample data is stable between loads. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

/* ------------------------------------------------------------------ */
/* KPI dashboard kit                                                   */
/* ------------------------------------------------------------------ */

export type Measure = {
  name: string;
  /** Typical value per row. */
  base?: number;
  /** Derive from another measure × a random fraction in [lo, hi]. */
  of?: string;
  frac?: [number, number];
  int?: boolean;
};

export type Ratio = {
  label: string;
  /** Build a formula from cell refs of each measure (same column). */
  f: (m: Record<string, string>) => string;
  /** Status rule: higher is better (default) or lower is better. */
  lowerBetter?: boolean;
};

export type DashSpec = {
  id: string;
  name: string;
  industry: string;
  dimA: [string, string[]];
  dimB: [string, string[]];
  measures: Measure[];
  ratios: Ratio[];
  /** Measures where a fall is good news (costs, incidents, churn…). */
  lowerBetter?: string[];
};

export function kpiDashboard(spec: DashSpec): FinancialTemplate {
  const build = () => {
    const rand = rng(spec.id);
    const [aName, aVals] = spec.dimA;
    const [bName, bVals] = spec.dimB;
    const ms = spec.measures;
    const data: (string | number)[][] = [["Month", aName, bName, ...ms.map((m) => m.name)]];
    MONTHS.forEach((month, mi) => {
      aVals.forEach((a, ai) => {
        const vals: Record<string, number> = {};
        const trend = 1 + 0.035 * mi + (ai - aVals.length / 2) * 0.06;
        for (const m of ms) {
          let v: number;
          if (m.of) {
            const [lo, hi] = m.frac ?? [0.4, 0.6];
            v = (vals[m.of] ?? 0) * (lo + (hi - lo) * rand());
          } else v = (m.base ?? 100) * trend * (0.82 + 0.36 * rand());
          v = m.int || v >= 1000 ? Math.round(v) : Math.round(v * 100) / 100;
          vals[m.name] = Math.max(0, v);
        }
        data.push([month, a, bVals[(mi + ai) % bVals.length]!, ...ms.map((m) => vals[m.name]!)]);
      });
    });
    const last = data.length;
    const rng_ = (i: number) => `Data!$${col(i)}$2:$${col(i)}$${last}`;
    const mCol = (k: number) => rng_(3 + k);
    const monthR = rng_(0);
    const aR = rng_(1);
    const bR = rng_(2);

    // --- Dashboard ---
    const d: (string | number)[][] = [
      [`${spec.name.toUpperCase()}`],
      ["Latest month", MONTHS[MONTHS.length - 1]!, "← change to roll the dashboard"],
      ["Prior month", MONTHS[MONTHS.length - 2]!],
      [],
      ["KPI", "Total (YTD)", "Latest month", "Prior month", "Change %", "Status"],
    ];
    const kpiStart = d.length + 1;
    const refs = (c: string) =>
      Object.fromEntries(ms.map((m, k) => [m.name, `${c}${kpiStart + k}`])) as Record<
        string,
        string
      >;
    const lower = new Set(spec.lowerBetter ?? []);
    ms.forEach((m, k) => {
      const r = kpiStart + k;
      d.push([
        m.name,
        `=SUM(${mCol(k)})`,
        `=SUMIFS(${mCol(k)},${monthR},$B$2)`,
        `=SUMIFS(${mCol(k)},${monthR},$B$3)`,
        `=IFERROR(C${r}/D${r}-1,0)`,
        lower.has(m.name)
          ? `=IF(E${r}<=0,"▲ Improving","▼ Watch")`
          : `=IF(E${r}>=0,"▲ Up","▼ Down")`,
      ]);
    });
    spec.ratios.forEach((ra, k) => {
      const r = kpiStart + ms.length + k;
      d.push([
        ra.label,
        `=IFERROR(${ra.f(refs("B"))},0)`,
        `=IFERROR(${ra.f(refs("C"))},0)`,
        `=IFERROR(${ra.f(refs("D"))},0)`,
        `=IFERROR(C${r}/D${r}-1,0)`,
        ra.lowerBetter
          ? `=IF(C${r}<=D${r},"▲ Improving","▼ Watch")`
          : `=IF(C${r}>=D${r},"▲ Up","▼ Down")`,
      ]);
    });
    d.push([]);

    // Breakdown by dim A
    const shown = ms.slice(0, Math.min(ms.length, 4));
    d.push([`BY ${aName.toUpperCase()}`]);
    d.push([aName, ...shown.map((m) => m.name), `Share of ${ms[0]!.name.toLowerCase()}`]);
    const aStart = d.length + 1;
    aVals.forEach((a, i) => {
      const r = aStart + i;
      d.push([
        a,
        ...shown.map((_, k) => `=SUMIFS(${mCol(k)},${aR},$A${r})`),
        `=IFERROR(B${r}/B$${aStart + aVals.length},0)`,
      ]);
    });
    const aTotal = aStart + aVals.length;
    d.push([
      "Total",
      ...shown.map((_, k) => `=SUM(${col(1 + k)}${aStart}:${col(1 + k)}${aTotal - 1})`),
      `=SUM(${col(1 + shown.length)}${aStart}:${col(1 + shown.length)}${aTotal - 1})`,
    ]);
    d.push([]);

    // Breakdown by dim B
    d.push([`BY ${bName.toUpperCase()}`]);
    d.push([bName, ...shown.slice(0, 2).map((m) => m.name), "Rows"]);
    const bStart = d.length + 1;
    bVals.forEach((b, i) => {
      const r = bStart + i;
      d.push([
        b,
        ...shown.slice(0, 2).map((_, k) => `=SUMIFS(${mCol(k)},${bR},$A${r})`),
        `=COUNTIF(${bR},$A${r})`,
      ]);
    });
    d.push([]);

    // Monthly trend
    d.push(["MONTHLY TREND"]);
    d.push(["Month", ...ms.map((m) => m.name)]);
    const tStart = d.length + 1;
    MONTHS.forEach((mo, i) => {
      const r = tStart + i;
      d.push([mo, ...ms.map((_, k) => `=SUMIFS(${mCol(k)},${monthR},$A${r})`)]);
    });
    const tEnd = tStart + MONTHS.length - 1;

    // --- Audit ---
    const checks: [string, string][] = [];
    shown.forEach((m, k) =>
      checks.push([
        `${m.name}: ${aName.toLowerCase()} split ties to total`,
        `=ABS(Dashboard!${col(1 + k)}${aTotal}-Dashboard!B${kpiStart + k})<0.01`,
      ]),
    );
    ms.forEach((m, k) =>
      checks.push([
        `${m.name}: monthly trend ties to total`,
        `=ABS(SUM(Dashboard!${col(1 + k)}${tStart}:${col(1 + k)}${tEnd})-Dashboard!B${kpiStart + k})<0.01`,
      ]),
    );
    checks.push([`No blank ${aName.toLowerCase()} values`, `=COUNTBLANK(${aR})=0`]);
    checks.push(["Latest month exists in data", `=COUNTIF(${monthR},Dashboard!B2)>0`]);
    checks.push([
      "Shares add to 100%",
      `=ABS(Dashboard!${col(1 + shown.length)}${aTotal}-1)<0.0001`,
    ]);
    const audit: (string | number)[][] = [
      ["DASHBOARD CHECKS"],
      [],
      ["Check", "Result"],
      ...checks,
      ["MASTER CHECK", `=AND(B4:B${3 + checks.length})`],
    ];
    return [S("Dashboard", d), S("Data", data), S("Audit", audit)];
  };
  return {
    id: spec.id,
    name: spec.name,
    tier: "Dashboards",
    blurb: `${spec.industry} KPI board: ${spec.ratios
      .slice(0, 3)
      .map((r) => r.label.toLowerCase())
      .join(", ")}, ${spec.dimA[0].toLowerCase()} split and a rolling month-over-month view.`,
    features: [
      "Rolling month selector",
      `By ${spec.dimA[0].toLowerCase()} & ${spec.dimB[0].toLowerCase()}`,
      "SUMIFS fact table",
      "Tie-out audit tab",
    ],
    prompt: `Extend this ${spec.industry.toLowerCase()} dashboard with targets per ${spec.dimA[0].toLowerCase()}, a variance-to-target column and a top/bottom performer callout.`,
    build,
  };
}

/* ------------------------------------------------------------------ */
/* Driver-based 5-year projection + DCF kit                            */
/* ------------------------------------------------------------------ */

export type ProjSpec = {
  id: string;
  name: string;
  industry: string;
  units: [string, number, number]; // label, year-1 volume, annual growth
  price: [string, number, number]; // label, year-1 price, annual growth
  cogsPct: number;
  opex: [string, number][]; // label, % of revenue
  fixedCost: [string, number, number]; // label, year-1 amount, growth
  daPct: number;
  capexPct: number;
  nwcPct: number;
  taxRate: number;
  wacc: number;
  termGrowth: number;
};

const YEARS = ["FY2026", "FY2027", "FY2028", "FY2029", "FY2030"];

export function projectionModel(spec: ProjSpec): FinancialTemplate {
  const build = () => {
    const A: [string, number, string][] = [
      [`${spec.units[0]} (year 1)`, spec.units[1], "Volume driver"],
      [`${spec.units[0]} growth %`, spec.units[2], "Annual"],
      [`${spec.price[0]} (year 1)`, spec.price[1], "Average realised"],
      [`${spec.price[0]} growth %`, spec.price[2], "Annual"],
      ["Direct cost % of revenue", spec.cogsPct, "Cost of sales"],
      ...spec.opex.map(
        ([l, p]) => [`${l} % of revenue`, p, "Variable opex"] as [string, number, string],
      ),
      [`${spec.fixedCost[0]} (year 1)`, spec.fixedCost[1], "Fixed cost"],
      [`${spec.fixedCost[0]} growth %`, spec.fixedCost[2], "Annual inflation"],
      ["D&A % of revenue", spec.daPct, ""],
      ["Capex % of revenue", spec.capexPct, ""],
      ["Working capital % of revenue", spec.nwcPct, "Change in revenue × %"],
      ["Tax rate", spec.taxRate, ""],
      ["WACC", spec.wacc, "Discount rate"],
      ["Terminal growth %", spec.termGrowth, "Must stay below WACC"],
    ];
    const ar = (label: string) => {
      const i = A.findIndex((a) => a[0] === label);
      return `Assumptions!$B$${i + 4}`;
    };
    const assumptions = S("Assumptions", [
      [`${spec.name.toUpperCase()} — ASSUMPTIONS`],
      ["Blue cells are inputs; every other tab is formula-driven."],
      ["Driver", "Value", "Note"],
      ...A,
    ]);

    const C = ["B", "C", "D", "E", "F"];
    const rows: (string | number)[][] = [["Line item", ...YEARS]];
    const at: Record<string, number> = {};
    const add = (label: string, f: (c: string, i: number) => string) => {
      rows.push([label, ...C.map((c, i) => f(c, i))]);
      at[label] = rows.length;
    };
    const prev = (c: string) => C[C.indexOf(c) - 1]!;
    const R = (label: string, c: string) => `${c}${at[label]}`;
    const uL = spec.units[0];
    const pL = spec.price[0];
    add(uL, (c, i) =>
      i === 0
        ? `=${ar(`${uL} (year 1)`)}`
        : `=${prev(c)}${rows.length + 1}*(1+${ar(`${uL} growth %`)})`,
    );
    add(pL, (c, i) =>
      i === 0
        ? `=${ar(`${pL} (year 1)`)}`
        : `=${prev(c)}${rows.length + 1}*(1+${ar(`${pL} growth %`)})`,
    );
    add("Revenue", (c) => `=${R(uL, c)}*${R(pL, c)}`);
    add("Revenue growth %", (c, i) =>
      i === 0 ? "" : `=IFERROR(${R("Revenue", c)}/${R("Revenue", prev(c))}-1,0)`,
    );
    add("Direct costs", (c) => `=-${R("Revenue", c)}*${ar("Direct cost % of revenue")}`);
    add("Gross profit", (c) => `=${R("Revenue", c)}+${R("Direct costs", c)}`);
    add("Gross margin %", (c) => `=IFERROR(${R("Gross profit", c)}/${R("Revenue", c)},0)`);
    for (const [l] of spec.opex) add(l, (c) => `=-${R("Revenue", c)}*${ar(`${l} % of revenue`)}`);
    const fL = spec.fixedCost[0];
    add(fL, (c, i) =>
      i === 0
        ? `=-${ar(`${fL} (year 1)`)}`
        : `=${prev(c)}${rows.length + 1}*(1+${ar(`${fL} growth %`)})`,
    );
    const opexLabels = [...spec.opex.map(([l]) => l), fL];
    add("Total operating expenses", (c) => `=${opexLabels.map((l) => R(l, c)).join("+")}`);
    add("EBITDA", (c) => `=${R("Gross profit", c)}+${R("Total operating expenses", c)}`);
    add("EBITDA margin %", (c) => `=IFERROR(${R("EBITDA", c)}/${R("Revenue", c)},0)`);
    add("Depreciation & amortization", (c) => `=-${R("Revenue", c)}*${ar("D&A % of revenue")}`);
    add("EBIT", (c) => `=${R("EBITDA", c)}+${R("Depreciation & amortization", c)}`);
    add("Taxes", (c) => `=-MAX(0,${R("EBIT", c)})*${ar("Tax rate")}`);
    add("Net income", (c) => `=${R("EBIT", c)}+${R("Taxes", c)}`);
    add("Net margin %", (c) => `=IFERROR(${R("Net income", c)}/${R("Revenue", c)},0)`);
    rows.push([]);
    rows.push(["FREE CASH FLOW"]);
    add("Add back D&A", (c) => `=-${R("Depreciation & amortization", c)}`);
    add("Capital expenditure", (c) => `=-${R("Revenue", c)}*${ar("Capex % of revenue")}`);
    add("Change in working capital", (c, i) =>
      i === 0
        ? `=-${R("Revenue", c)}*${ar("Working capital % of revenue")}*${ar(`${uL} growth %`)}`
        : `=-(${R("Revenue", c)}-${R("Revenue", prev(c))})*${ar("Working capital % of revenue")}`,
    );
    add(
      "Unlevered free cash flow",
      (c) =>
        `=${R("Net income", c)}+${R("Add back D&A", c)}+${R("Capital expenditure", c)}+${R("Change in working capital", c)}`,
    );
    add("Discount factor", (_c, i) => `=1/(1+${ar("WACC")})^${i + 1}`);
    add(
      "PV of free cash flow",
      (c) => `=${R("Unlevered free cash flow", c)}*${R("Discount factor", c)}`,
    );

    const fcf = (c: string) => `Model!${R("Unlevered free cash flow", c)}`;
    const val = S("Valuation", [
      ["DCF VALUATION"],
      [],
      ["Metric", "Value"],
      [
        "Sum of PV of free cash flow",
        `=SUM(Model!B${at["PV of free cash flow"]}:F${at["PV of free cash flow"]})`,
      ],
      [
        "Terminal value (Gordon growth)",
        `=IFERROR(${fcf("F")}*(1+${ar("Terminal growth %")})/(${ar("WACC")}-${ar("Terminal growth %")}),0)`,
      ],
      ["PV of terminal value", `=B5*Model!F${at["Discount factor"]}`],
      ["Enterprise value", "=B4+B6"],
      ["Terminal value % of EV", "=IFERROR(B6/B7,0)"],
      ["EV / Year-1 EBITDA", `=IFERROR(B7/Model!B${at["EBITDA"]},0)`],
      [
        "5-year revenue CAGR",
        `=IFERROR((Model!F${at["Revenue"]}/Model!B${at["Revenue"]})^(1/4)-1,0)`,
      ],
      [],
      ["SENSITIVITY — ENTERPRISE VALUE", "", "WACC →"],
      ...(() => {
        const w = spec.wacc;
        const g = spec.termGrowth;
        const ws = [w - 0.01, w, w + 0.01].map((x) => Math.round(x * 1000) / 1000);
        const gs = [g - 0.005, g, g + 0.005].map((x) => Math.round(x * 1000) / 1000);
        const out: (string | number)[][] = [["Terminal growth ↓", ...ws]];
        gs.forEach((gv, gi) => {
          const r = 14 + gi;
          out.push([
            gv,
            ...ws.map((_, wi) => {
              const wc = `${col(1 + wi)}$13`;
              const pv = C.map((c, i) => `${fcf(c)}/(1+${wc})^${i + 1}`).join("+");
              return `=IFERROR(${pv}+${fcf("F")}*(1+$A${r})/(${wc}-$A${r})/(1+${wc})^5,0)`;
            }),
          ]);
        });
        return out;
      })(),
    ]);
    const checks = S("Checks", [
      ["MODEL INTEGRITY CHECKS"],
      [],
      ["Check", "Result"],
      ["WACC above terminal growth", `=${ar("WACC")}>${ar("Terminal growth %")}`],
      ["Revenue positive every year", `=MIN(Model!B${at["Revenue"]}:F${at["Revenue"]})>0`],
      [
        "Gross margin between 0% and 100%",
        `=AND(Model!B${at["Gross margin %"]}>0,Model!B${at["Gross margin %"]}<1)`,
      ],
      [
        "EBITDA = gross profit + opex (FY2030)",
        `=ABS(Model!F${at["EBITDA"]}-Model!F${at["Gross profit"]}-Model!F${at["Total operating expenses"]})<0.01`,
      ],
      ["Terminal value under 85% of EV", "=Valuation!B8<0.85"],
      ["MASTER CHECK", "=AND(B4:B8)"],
    ]);
    return [assumptions, S("Model", rows), val, checks];
  };
  return {
    id: spec.id,
    name: spec.name,
    tier: "Industry",
    blurb: `${spec.industry}: ${spec.units[0].toLowerCase()} × ${spec.price[0].toLowerCase()} revenue build, cost structure, free cash flow and DCF with a WACC/growth sensitivity grid.`,
    features: ["Driver-based revenue", "5-year P&L + FCF", "DCF & sensitivity", "Integrity checks"],
    prompt: `Add a downside / base / upside scenario switch to this ${spec.industry.toLowerCase()} model, flexing ${spec.units[0].toLowerCase()} growth and ${spec.price[0].toLowerCase()}.`,
    build,
  };
}

/* ------------------------------------------------------------------ */
/* Budget vs actual tracker kit                                        */
/* ------------------------------------------------------------------ */

export type BudgetSpec = {
  id: string;
  name: string;
  scope: string;
  lines: [string, string, number][]; // group, line, annual budget
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export function budgetTracker(spec: BudgetSpec): FinancialTemplate {
  const build = () => {
    const rand = rng(spec.id);
    const head = [
      "Group",
      "Line item",
      "Annual budget",
      "Monthly budget",
      ...MON,
      "YTD actual",
      "YTD budget",
      "Variance",
      "Variance %",
      "Status",
    ];
    const rows: (string | number)[][] = [
      [`${spec.name.toUpperCase()}`],
      ["Months elapsed", 6, "← inputs in blue; actuals by month"],
      [],
      head,
    ];
    const start = rows.length + 1;
    spec.lines.forEach(([g, l, b], i) => {
      const r = start + i;
      const monthly = b / 12;
      const acts = MON.map(() => Math.round(monthly * (0.8 + 0.4 * rand())));
      rows.push([
        g,
        l,
        b,
        `=C${r}/12`,
        ...acts,
        `=SUM(E${r}:J${r})`,
        `=D${r}*$B$2`,
        `=L${r}-K${r}`,
        `=IFERROR(M${r}/L${r},0)`,
        `=IF(N${r}>=0,"Under budget",IF(N${r}>=-0.05,"Watch","Over budget"))`,
      ]);
    });
    const end = start + spec.lines.length - 1;
    const tot = end + 1;
    rows.push([
      "Total",
      "",
      ...["C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"].map(
        (c) => `=SUM(${c}${start}:${c}${end})`,
      ),
      `=IFERROR(M${tot}/L${tot},0)`,
      `=IF(N${tot}>=0,"Under budget","Over budget")`,
    ]);
    const groups = [...new Set(spec.lines.map((l) => l[0]))];
    const sum: (string | number)[][] = [
      ["SUMMARY BY GROUP"],
      [],
      [
        "Group",
        "Annual budget",
        "YTD actual",
        "YTD budget",
        "Variance",
        "Variance %",
        "Share of spend",
      ],
    ];
    groups.forEach((g, i) => {
      const r = 4 + i;
      const rg = (c: string) => `Budget!$${c}$${start}:$${c}$${end}`;
      sum.push([
        g,
        `=SUMIFS(${rg("C")},${rg("A")},$A${r})`,
        `=SUMIFS(${rg("K")},${rg("A")},$A${r})`,
        `=SUMIFS(${rg("L")},${rg("A")},$A${r})`,
        `=D${r}-C${r}`,
        `=IFERROR(E${r}/D${r},0)`,
        `=IFERROR(C${r}/Budget!$K$${tot},0)`,
      ]);
    });
    const gEnd = 3 + groups.length;
    sum.push([
      "Total",
      `=SUM(B4:B${gEnd})`,
      `=SUM(C4:C${gEnd})`,
      `=SUM(D4:D${gEnd})`,
      `=SUM(E4:E${gEnd})`,
      `=IFERROR(E${gEnd + 1}/D${gEnd + 1},0)`,
      `=SUM(G4:G${gEnd})`,
    ]);
    sum.push([]);
    sum.push(["MONTHLY SPEND"]);
    sum.push(["Month", "Actual", "Budget", "Variance"]);
    MON.forEach((m, i) => {
      const r = sum.length + 1;
      const c = col(4 + i);
      sum.push([m, `=Budget!${c}${tot}`, `=Budget!D${tot}`, `=C${r}-B${r}`]);
    });
    const checks = S("Checks", [
      ["TRACKER CHECKS"],
      [],
      ["Check", "Result"],
      ["Group summary ties to detail", `=ABS(Summary!C${gEnd + 1}-Budget!K${tot})<0.01`],
      ["Budget ties to detail", `=ABS(Summary!B${gEnd + 1}-Budget!C${tot})<0.01`],
      ["Months elapsed between 1 and 12", "=AND(Budget!B2>=1,Budget!B2<=12)"],
      ["No negative budgets", `=MIN(Budget!C${start}:C${end})>=0`],
      ["MASTER CHECK", "=AND(B4:B7)"],
    ]);
    return [S("Budget", rows), S("Summary", sum), checks];
  };
  return {
    id: spec.id,
    name: spec.name,
    tier: "Basic",
    blurb: `${spec.scope} budget vs actual: monthly actuals, YTD variance with traffic-light status and a group summary.`,
    features: ["Budget vs actual", "YTD variance %", "Group SUMIFS summary", "Tie-out checks"],
    prompt: `Add a full-year forecast column (YTD actual + remaining budget) and highlight any ${spec.scope.toLowerCase()} line forecast to overspend.`,
    build,
  };
}

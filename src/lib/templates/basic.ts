import { S, type FinancialTemplate } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export const BASIC_TEMPLATES: FinancialTemplate[] = [
  {
    id: "personal-budget",
    name: "Personal & Family Budgeting Hub",
    tier: "Basic",
    blurb:
      "Zero-based budget tracker, monthly expense planner and a 50/30/20 allocation dashboard.",
    features: ["Zero-based check", "Monthly planner", "50/30/20 dashboard", "Category roll-ups"],
    prompt:
      "Extend this personal budgeting hub with a savings-goal tracker and a rolling 12-month forecast.",
    build: () => [
      S("Budget", [
        ["ZERO-BASED MONTHLY BUDGET"],
        ["Every dollar of income must be assigned. Blue cells are inputs."],
        [],
        ["Income", "Amount"],
        ["Net salary", 5200],
        ["Side income", 650],
        ["Other", 100],
        ["Total income", "=SUM(B5:B7)"],
        [],
        ["Category", "Bucket", "Planned", "Actual", "Variance", "% of income"],
        ["Rent / Mortgage", "Needs", 1600, 1600, "=C11-D11", "=C11/$B$8"],
        ["Groceries", "Needs", 620, 688, "=C12-D12", "=C12/$B$8"],
        ["Utilities", "Needs", 240, 231, "=C13-D13", "=C13/$B$8"],
        ["Transport", "Needs", 310, 355, "=C14-D14", "=C14/$B$8"],
        ["Insurance", "Needs", 285, 285, "=C15-D15", "=C15/$B$8"],
        ["Dining & fun", "Wants", 400, 512, "=C16-D16", "=C16/$B$8"],
        ["Subscriptions", "Wants", 95, 118, "=C17-D17", "=C17/$B$8"],
        ["Travel fund", "Wants", 300, 300, "=C18-D18", "=C18/$B$8"],
        ["Emergency fund", "Savings", 700, 700, "=C19-D19", "=C19/$B$8"],
        ["Retirement", "Savings", 900, 900, "=C20-D20", "=C20/$B$8"],
        ["Debt paydown", "Savings", 500, 500, "=C21-D21", "=C21/$B$8"],
        ["Total allocated", "", "=SUM(C11:C21)", "=SUM(D11:D21)", "=C22-D22", "=C22/$B$8"],
        ["Unassigned (must be 0)", "", "=B8-C22", "=B8-D22", "", ""],
      ]),
      S("50-30-20", [
        ["50 / 30 / 20 ALLOCATION DASHBOARD"],
        [],
        ["Bucket", "Target %", "Target $", "Planned $", "Actual $", "Status"],
        [
          "Needs",
          0.5,
          "=$B$4*Budget!$B$8",
          "=SUMIF(Budget!$B$11:$B$21,\"Needs\",Budget!$C$11:$C$21)",
          "=SUMIF(Budget!$B$11:$B$21,\"Needs\",Budget!$D$11:$D$21)",
          '=IF(E4>C4,"OVER","OK")',
        ],
        [
          "Wants",
          0.3,
          "=$B$5*Budget!$B$8",
          "=SUMIF(Budget!$B$11:$B$21,\"Wants\",Budget!$C$11:$C$21)",
          "=SUMIF(Budget!$B$11:$B$21,\"Wants\",Budget!$D$11:$D$21)",
          '=IF(E5>C5,"OVER","OK")',
        ],
        [
          "Savings",
          0.2,
          "=$B$6*Budget!$B$8",
          "=SUMIF(Budget!$B$11:$B$21,\"Savings\",Budget!$C$11:$C$21)",
          "=SUMIF(Budget!$B$11:$B$21,\"Savings\",Budget!$D$11:$D$21)",
          '=IF(E6>C6,"OVER","OK")',
        ],
        ["Total", "=SUM(B4:B6)", "=SUM(C4:C6)", "=SUM(D4:D6)", "=SUM(E4:E6)", ""],
        [],
        ["Savings rate", "=E6/Budget!$B$8"],
        ["Monthly surplus / (deficit)", "=Budget!$B$8-E7"],
      ]),
      S("Monthly Planner", [
        ["MONTHLY EXPENSE PLANNER"],
        [],
        ["Category", ...MONTHS, "Total", "Average"],
        ...["Rent / Mortgage", "Groceries", "Utilities", "Transport", "Dining & fun", "Savings"].map(
          (cat, i) => {
            const r = 4 + i;
            const base = [1600, 620, 240, 310, 400, 2100][i] ?? 0;
            return [
              cat,
              ...MONTHS.map((_, m) => Math.round(base * (1 + m * 0.015))),
              `=SUM(B${r}:G${r})`,
              `=AVERAGE(B${r}:G${r})`,
            ];
          },
        ),
        ["Total", ...MONTHS.map((_, m) => `=SUM(${String.fromCharCode(66 + m)}4:${String.fromCharCode(66 + m)}9)`), "=SUM(H4:H9)", "=AVERAGE(B10:G10)"],
      ]),
    ],
  },
  {
    id: "income-statement",
    name: "Single-Period Income Statement (P&L)",
    tier: "Basic",
    blurb: "Revenue and expense logs auto-calculating gross margin, operating income and net profit.",
    features: ["Gross margin", "Operating income", "Net profit", "Margin ratios"],
    prompt: "Turn this single-period P&L into a 12-month P&L with monthly growth assumptions.",
    build: () => [
      S("P&L", [
        ["INCOME STATEMENT — FY2026 ($)"],
        [],
        ["Line item", "Amount", "% of revenue"],
        ["Product revenue", 1850000, "=B4/$B$6"],
        ["Service revenue", 420000, "=B5/$B$6"],
        ["Total revenue", "=SUM(B4:B5)", "=B6/$B$6"],
        ["Cost of goods sold", 812000, "=B7/$B$6"],
        ["Gross profit", "=B6-B7", "=B8/$B$6"],
        ["Salaries & wages", 560000, "=B9/$B$6"],
        ["Marketing", 185000, "=B10/$B$6"],
        ["Rent & facilities", 96000, "=B11/$B$6"],
        ["Software & IT", 74000, "=B12/$B$6"],
        ["Other operating", 58000, "=B13/$B$6"],
        ["Total operating expenses", "=SUM(B9:B13)", "=B14/$B$6"],
        ["Operating income (EBIT)", "=B8-B14", "=B15/$B$6"],
        ["Depreciation & amortisation", 64000, "=B16/$B$6"],
        ["EBITDA", "=B15+B16", "=B17/$B$6"],
        ["Interest expense", 38000, "=B18/$B$6"],
        ["Pre-tax income", "=B15-B18", "=B19/$B$6"],
        ["Tax rate", 0.24, ""],
        ["Income tax", "=MAX(0,B19*B20)", "=B21/$B$6"],
        ["Net profit", "=B19-B21", "=B22/$B$6"],
        [],
        ["Gross margin %", "=B8/B6"],
        ["Operating margin %", "=B15/B6"],
        ["Net margin %", "=B22/B6"],
      ]),
      S("Revenue Log", [
        ["Date", "Customer", "Stream", "Invoice", "Amount"],
        ["2026-01-14", "Northwind Ltd", "Product", "INV-1001", 128000],
        ["2026-02-02", "Acme Retail", "Product", "INV-1002", 94500],
        ["2026-02-19", "Globex", "Service", "INV-1003", 61000],
        ["2026-03-08", "Initech", "Product", "INV-1004", 152300],
        ["2026-03-27", "Umbrella Co", "Service", "INV-1005", 47800],
        ["Total", "", "", "", "=SUM(E2:E6)"],
      ]),
      S("Expense Log", [
        ["Date", "Vendor", "Category", "Amount"],
        ["2026-01-05", "CloudHost", "Software & IT", 6200],
        ["2026-01-31", "Payroll Co", "Salaries & wages", 46800],
        ["2026-02-11", "AdWords", "Marketing", 15400],
        ["2026-02-28", "Landlord LLC", "Rent & facilities", 8000],
        ["2026-03-15", "Supplier A", "Cost of goods sold", 67300],
        ["Total", "", "", "=SUM(D2:D6)"],
      ]),
    ],
  },
  {
    id: "cash-flow-log",
    name: "Cash Flow Log",
    tier: "Basic",
    blurb: "Single-entry ledger with net inflows, outflows and a running balance.",
    features: ["Running balance", "Inflow/outflow split", "Category summary", "Min-balance flag"],
    prompt: "Add a 13-week rolling cash forecast sheet linked to this cash flow log.",
    build: () => {
      const rows: (string | number)[][] = [
        ["CASH FLOW LOG"],
        ["Opening balance", 42000],
        [],
        ["Date", "Description", "Category", "Inflow", "Outflow", "Net", "Running balance", "Flag"],
      ];
      const entries: [string, string, string, number, number][] = [
        ["2026-01-03", "Customer payment INV-1001", "Receipts", 128000, 0],
        ["2026-01-08", "Supplier payment", "Payables", 0, 67300],
        ["2026-01-15", "Payroll", "Payroll", 0, 46800],
        ["2026-01-20", "Customer payment INV-1002", "Receipts", 94500, 0],
        ["2026-01-25", "Rent", "Facilities", 0, 8000],
        ["2026-02-01", "Loan drawdown", "Financing", 50000, 0],
        ["2026-02-09", "Equipment purchase", "CapEx", 0, 74000],
        ["2026-02-14", "Customer payment INV-1003", "Receipts", 61000, 0],
        ["2026-02-28", "Payroll", "Payroll", 0, 47950],
        ["2026-03-05", "Tax instalment", "Tax", 0, 21500],
      ];
      entries.forEach((e, i) => {
        const r = 5 + i;
        rows.push([
          ...e,
          `=D${r}-E${r}`,
          i === 0 ? `=$B$2+F${r}` : `=G${r - 1}+F${r}`,
          `=IF(G${r}<$B$20,"LOW CASH","")`,
        ]);
      });
      rows.push(
        ["Totals", "", "", "=SUM(D5:D14)", "=SUM(E5:E14)", "=D15-E15", "=G14", ""],
        [],
        ["Net cash movement", "=F15"],
        ["Closing balance", "=G14"],
        ["Largest outflow", "=MAX(E5:E14)"],
        ["Minimum balance threshold", 25000],
      );
      return [S("Cash Log", rows)];
    },
  },
  {
    id: "amortization",
    name: "Loan & Debt Amortization Schedule",
    tier: "Basic",
    blurb: "Dynamic payoff calculator using PMT, PPMT and IPMT for interest vs principal splits.",
    features: ["PMT / PPMT / IPMT", "Extra-payment toggle", "Total interest", "Payoff summary"],
    prompt: "Add a comparison of 15-year vs 30-year payoff scenarios with total interest saved.",
    build: () => {
      const rows: (string | number)[][] = [
        ["LOAN AMORTIZATION SCHEDULE"],
        [],
        ["Loan amount", 350000],
        ["Annual interest rate", 0.0685],
        ["Term (years)", 25],
        ["Payments per year", 12],
        ["Periodic rate", "=B4/B6"],
        ["Number of payments", "=B5*B6"],
        ["Scheduled payment", "=-PMT(B7,B8,B3)"],
        ["Extra payment per period", 150],
        ["Total interest paid", "=SUM(D14:D73)"],
        [],
        ["Period", "Opening balance", "Payment", "Interest", "Principal", "Extra", "Closing balance"],
      ];
      for (let p = 1; p <= 60; p++) {
        const r = 14 + p - 1;
        rows.push([
          p,
          p === 1 ? "=$B$3" : `=G${r - 1}`,
          `=MIN($B$9,B${r}*(1+$B$7))`,
          `=B${r}*$B$7`,
          `=C${r}-D${r}`,
          `=MIN($B$10,MAX(0,B${r}-E${r}))`,
          `=MAX(0,B${r}-E${r}-F${r})`,
        ]);
      }
      rows.push(
        ["Totals", "", "=SUM(C14:C73)", "=SUM(D14:D73)", "=SUM(E14:E73)", "=SUM(F14:F73)", ""],
        ["Periods until payoff", '=COUNTIF(G14:G73,">0")'],
      );
      return [S("Amortization", rows)];
    },
  },
  {
    id: "invoice-tracker",
    name: "Invoice & Billing Tracker",
    tier: "Basic",
    blurb: "Invoice generator linked to an aging log with auto-summed total receivables.",
    features: ["Invoice builder", "Aging buckets", "Total receivables", "Overdue flags"],
    prompt: "Add automated payment reminder text and a customer-level receivables summary.",
    build: () => [
      S("Invoice", [
        ["INVOICE"],
        ["Company", "SheetSmith Consulting"],
        ["Invoice #", "INV-2041"],
        ["Date", "2026-03-01"],
        ["Due date", "=D4+30"],
        ["Customer", "Northwind Ltd"],
        [],
        ["Description", "Qty", "Unit price", "Line total"],
        ["Implementation services", 40, 185, "=B9*C9"],
        ["Data migration", 12, 220, "=B10*C10"],
        ["Training workshop", 2, 950, "=B11*C11"],
        ["Support retainer", 1, 1800, "=B12*C12"],
        ["Subtotal", "", "", "=SUM(D9:D12)"],
        ["Tax rate", "", "", 0.15],
        ["Tax", "", "", "=D13*D14"],
        ["Total due", "", "", "=D13+D15"],
        [],
        ["Amount received", "", "", 6000],
        ["Balance outstanding", "", "", "=D16-D18"],
      ]),
      S("Aging Log", [
        ["ACCOUNTS RECEIVABLE AGING"],
        ["As-of date", "2026-04-15"],
        [],
        [
          "Invoice",
          "Customer",
          "Invoice date",
          "Due date",
          "Amount",
          "Received",
          "Outstanding",
          "Days overdue",
          "Bucket",
          "Status",
        ],
        ...[
          ["INV-2041", "Northwind Ltd", "2026-03-01", "2026-03-31", 12690, 6000],
          ["INV-2042", "Acme Retail", "2026-02-10", "2026-03-12", 8450, 0],
          ["INV-2043", "Globex", "2026-01-05", "2026-02-04", 15200, 15200],
          ["INV-2044", "Initech", "2026-03-22", "2026-04-21", 6300, 0],
          ["INV-2045", "Umbrella Co", "2025-12-14", "2026-01-13", 9800, 2000],
          ["INV-2046", "Stark Ind", "2026-04-02", "2026-05-02", 22400, 0],
        ].map((row, i) => {
          const r = 5 + i;
          return [
            ...row,
            `=E${r}-F${r}`,
            `=MAX(0,$B$2-D${r})`,
            `=IF(G${r}=0,"Paid",IF(H${r}=0,"Current",IF(H${r}<=30,"1-30",IF(H${r}<=60,"31-60",IF(H${r}<=90,"61-90","90+")))))`,
            `=IF(G${r}=0,"",IF(H${r}>60,"ESCALATE",IF(H${r}>0,"CHASE","")))`,
          ];
        }),
        ["Total", "", "", "", "=SUM(E5:E10)", "=SUM(F5:F10)", "=SUM(G5:G10)", "", "", ""],
        [],
        ["Bucket", "Receivables", "% of total"],
        ...["Current", "1-30", "31-60", "61-90", "90+"].map((b, i) => [
          b,
          `=SUMIF($I$5:$I$10,A${14 + i},$G$5:$G$10)`,
          `=IFERROR(B${14 + i}/$G$11,0)`,
        ]),
        ["Total receivables", "=SUM(B14:B18)", "=SUM(C14:C18)"],
      ]),
    ],
  },
  {
    id: "opex-log",
    name: "Simple Operational Expense (OpEx) Log",
    tier: "Basic",
    blurb: "Categorised expense tracking with over-budget conditional formatting.",
    features: ["Category budgets", "Over-budget flags", "Monthly roll-up", "Top-vendor analysis"],
    prompt: "Add a monthly trend sheet and flag any vendor whose spend grew more than 20%.",
    build: () => [
      S("OpEx Log", [
        ["OPERATIONAL EXPENSE LOG"],
        [],
        ["Date", "Vendor", "Category", "Cost centre", "Amount", "Approved by", "Over policy?"],
        ...[
          ["2026-01-09", "CloudHost", "Software & IT", "Engineering", 6200, "A. Patel"],
          ["2026-01-18", "AdWords", "Marketing", "Growth", 15400, "M. Chen"],
          ["2026-01-27", "Staples", "Office", "G&A", 940, "R. Diaz"],
          ["2026-02-04", "Landlord LLC", "Facilities", "G&A", 8000, "R. Diaz"],
          ["2026-02-13", "Travel Inc", "Travel", "Sales", 5300, "M. Chen"],
          ["2026-02-22", "CloudHost", "Software & IT", "Engineering", 6450, "A. Patel"],
          ["2026-03-06", "LinkedIn Ads", "Marketing", "Growth", 11800, "M. Chen"],
          ["2026-03-19", "Legal Partners", "Professional", "G&A", 9600, "R. Diaz"],
        ].map((row, i) => [...row, `=IF(E${4 + i}>5000,"REVIEW","")`]),
        ["Total", "", "", "", "=SUM(E4:E11)", "", ""],
        [],
        ["Category", "Budget", "Actual", "Variance", "% used", "Status"],
        ...["Software & IT", "Marketing", "Facilities", "Travel", "Office", "Professional"].map(
          (cat, i) => {
            const r = 15 + i;
            const budget = [12000, 25000, 8000, 4000, 1500, 8000][i] ?? 0;
            return [
              cat,
              budget,
              `=SUMIF($C$4:$C$11,A${r},$E$4:$E$11)`,
              `=B${r}-C${r}`,
              `=IFERROR(C${r}/B${r},0)`,
              `=IF(C${r}>B${r},"OVER BUDGET",IF(E${r}>0.9,"WATCH","OK"))`,
            ];
          },
        ),
        ["Total", "=SUM(B15:B20)", "=SUM(C15:C20)", "=B21-C21", "=C21/B21", ""],
      ]),
    ],
  },
];

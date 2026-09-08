import { S, type FinancialTemplate } from "./types";

const YEARS = ["FY2026", "FY2027", "FY2028", "FY2029", "FY2030"];
const COL = (i: number) => String.fromCharCode(66 + i); // B, C, D...

export const INTERMEDIATE_TEMPLATES: FinancialTemplate[] = [
  {
    id: "three-statement",
    name: "Standard 3-Statement Model",
    tier: "Intermediate",
    blurb:
      "Income statement, balance sheet and cash flow fully linked — net income to retained earnings, working-capital changes and closing cash.",
    features: ["Fully linked statements", "Balance sheet check", "Working capital", "5-year build"],
    prompt:
      "Extend this 3-statement model with a debt schedule, interest circularity toggle and quarterly view.",
    build: () => {
      const n = YEARS.length;
      const cols = Array.from({ length: n }, (_, i) => COL(i));
      const IS = [
        ["INCOME STATEMENT ($000s)", ...YEARS],
        [],
        ["Revenue", 12000, "=B3*(1+$B$21)", "=C3*(1+$B$21)", "=D3*(1+$B$21)", "=E3*(1+$B$21)"],
        ...[
          ["COGS", "=-B3*$B$22"],
          ["Gross profit", "=B3+B4"],
          ["Operating expenses", "=-B3*$B$23"],
          ["EBITDA", "=B5+B6"],
          ["Depreciation", "=-B3*$B$24"],
          ["EBIT", "=B7+B8"],
          ["Interest expense", "=-'Balance Sheet'!B14*$B$25"],
          ["Pre-tax income", "=B9+B10"],
          ["Taxes", "=-MAX(0,B11)*$B$26"],
          ["Net income", "=B11+B12"],
        ].map(([label, f]) => [
          label as string,
          ...cols.map((c) => (f as string).replace(/B(?=\d|')/g, c).replace(/\$C\$/g, "$B$")),
        ]),
      ];
      const income = S("Income Statement", [
        ...IS,
        [],
        ["Margins"],
        ["Gross margin %", ...cols.map((c) => `=IFERROR(${c}5/${c}3,0)`)],
        ["EBITDA margin %", ...cols.map((c) => `=IFERROR(${c}7/${c}3,0)`)],
        ["Net margin %", ...cols.map((c) => `=IFERROR(${c}13/${c}3,0)`)],
        [],
        ["ASSUMPTIONS (blue = input)"],
        ["Revenue growth", 0.14],
        ["COGS % of revenue", 0.42],
        ["OpEx % of revenue", 0.33],
        ["D&A % of revenue", 0.05],
        ["Interest rate on debt", 0.07],
        ["Tax rate", 0.25],
        ["DSO (days)", 46],
        ["DIO (days)", 38],
        ["DPO (days)", 41],
        ["CapEx % of revenue", 0.06],
      ]);


      const bs = S("Balance Sheet", [
        ["BALANCE SHEET ($000s)", ...YEARS],
        ["Cash", ...cols.map((c) => `='Cash Flow'!${c}18`)],
        [
          "Accounts receivable",
          ...cols.map((c) => `='Income Statement'!${c}3*'Income Statement'!$B$27/365`),
        ],
        ["Inventory", ...cols.map((c) => `=-'Income Statement'!${c}4*'Income Statement'!$B$28/365`)],
        ["Total current assets", ...cols.map((c) => `=SUM(${c}2:${c}4)`)],
        ["Net PP&E", ...cols.map((c, i) => (i === 0 ? "=8500" : `=${COL(i - 1)}6+${c}7+${c}8`))],
        ["CapEx", ...cols.map((c) => `='Income Statement'!${c}3*'Income Statement'!$B$30`)],
        ["Depreciation", ...cols.map((c) => `='Income Statement'!${c}8`)],
        ["Total assets", ...cols.map((c) => `=${c}5+${c}6`)],
        [],
        [
          "Accounts payable",
          ...cols.map((c) => `=-'Income Statement'!${c}4*'Income Statement'!$B$29/365`),
        ],
        ["Accrued liabilities", ...cols.map((c) => `=-'Income Statement'!${c}6*0.08`)],
        ["Total current liabilities", ...cols.map((c) => `=SUM(${c}11:${c}12)`)],
        ["Long-term debt", ...cols.map(() => 6000)],
        ["Total liabilities", ...cols.map((c) => `=${c}13+${c}14`)],
        ["Common stock", ...cols.map(() => 4000)],
        [
          "Retained earnings",
          ...cols.map((c, i) =>
            i === 0 ? `=3200+'Income Statement'!${c}13` : `=${COL(i - 1)}17+'Income Statement'!${c}13`,
          ),
        ],
        ["Total equity", ...cols.map((c) => `=${c}16+${c}17`)],
        ["Total liabilities & equity", ...cols.map((c) => `=${c}15+${c}18`)],
        [],
        ["BALANCE CHECK (must be 0)", ...cols.map((c) => `=ROUND(${c}9-${c}19,2)`)],
        ["Status", ...cols.map((c) => `=IF(ABS(${c}21)<0.01,"BALANCED","ERROR")`)],
      ]);

      const cf = S("Cash Flow", [
        ["CASH FLOW STATEMENT ($000s)", ...YEARS],
        ["Net income", ...cols.map((c) => `='Income Statement'!${c}13`)],
        ["Add back depreciation", ...cols.map((c) => `=-'Income Statement'!${c}8`)],
        [
          "(Increase) in receivables",
          ...cols.map((c, i) =>
            i === 0 ? `=-'Balance Sheet'!${c}3` : `=-('Balance Sheet'!${c}3-'Balance Sheet'!${COL(i - 1)}3)`,
          ),
        ],
        [
          "(Increase) in inventory",
          ...cols.map((c, i) =>
            i === 0 ? `=-'Balance Sheet'!${c}4` : `=-('Balance Sheet'!${c}4-'Balance Sheet'!${COL(i - 1)}4)`,
          ),
        ],
        [
          "Increase in payables",
          ...cols.map((c, i) =>
            i === 0 ? `='Balance Sheet'!${c}11` : `='Balance Sheet'!${c}11-'Balance Sheet'!${COL(i - 1)}11`,
          ),
        ],
        [
          "Increase in accruals",
          ...cols.map((c, i) =>
            i === 0 ? `='Balance Sheet'!${c}12` : `='Balance Sheet'!${c}12-'Balance Sheet'!${COL(i - 1)}12`,
          ),
        ],
        ["Change in working capital", ...cols.map((c) => `=SUM(${c}4:${c}7)`)],
        ["Cash from operations", ...cols.map((c) => `=${c}2+${c}3+${c}8`)],
        [],
        ["Capital expenditure", ...cols.map((c) => `=-'Balance Sheet'!${c}7`)],
        ["Cash from investing", ...cols.map((c) => `=${c}11`)],
        [],
        ["Debt issued / (repaid)", ...cols.map(() => 0)],
        ["Dividends paid", ...cols.map((c) => `=-'Income Statement'!${c}13*0.15`)],
        ["Cash from financing", ...cols.map((c) => `=SUM(${c}14:${c}15)`)],
        ["Opening cash", ...cols.map((c, i) => (i === 0 ? "=1800" : `=${COL(i - 1)}18`))],
        ["Closing cash", ...cols.map((c) => `=${c}17+${c}9+${c}12+${c}16`)],
        ["Free cash flow", ...cols.map((c) => `=${c}9+${c}12`)],
      ]);

      return [income, bs, cf];
    },
  },
  {
    id: "bank-reconciliation",
    name: "Bank Reconciliation Statement",
    tier: "Intermediate",
    blurb: "Dual-column engine matching bank statements against the general ledger with variance flags.",
    features: ["Auto matching", "Unmatched flags", "Reconciliation summary", "Variance check"],
    prompt: "Match the bank and ledger sheets, flag unmatched items and explain each difference.",
    build: () => [
      S("Bank Statement", [
        ["BANK STATEMENT — March 2026"],
        [],
        ["Date", "Reference", "Description", "Amount", "Matched in GL?"],
        ...[
          ["2026-03-02", "EFT-9001", "Customer receipt Northwind", 12690],
          ["2026-03-05", "CHQ-4410", "Supplier payment", -67300],
          ["2026-03-11", "EFT-9002", "Customer receipt Acme", 8450],
          ["2026-03-15", "DD-2201", "Payroll run", -47950],
          ["2026-03-19", "FEE-0031", "Bank charges", -185],
          ["2026-03-23", "EFT-9003", "Customer receipt Globex", 15200],
          ["2026-03-28", "INT-0007", "Interest credit", 96],
          ["2026-03-30", "CHQ-4415", "Rent", -8000],
        ].map((r, i) => [...r, `=IF(COUNTIF(Ledger!$B$4:$B$12,B${4 + i})>0,"MATCHED","UNMATCHED")`]),
        ["Total per bank", "", "", "=SUM(D4:D11)", ""],
      ]),
      S("Ledger", [
        ["GENERAL LEDGER — CASH ACCOUNT"],
        [],
        ["Date", "Reference", "Description", "Amount", "Matched in bank?"],
        ...[
          ["2026-03-01", "EFT-9001", "Receipt Northwind", 12690],
          ["2026-03-04", "CHQ-4410", "Supplier payment", -67300],
          ["2026-03-10", "EFT-9002", "Receipt Acme", 8450],
          ["2026-03-15", "DD-2201", "Payroll", -47950],
          ["2026-03-22", "EFT-9003", "Receipt Globex", 15200],
          ["2026-03-27", "CHQ-4414", "Unpresented cheque — supplier B", -5400],
          ["2026-03-29", "DEP-0012", "Deposit in transit", 4300],
          ["2026-03-30", "CHQ-4415", "Rent", -8000],
          ["2026-03-31", "JE-0044", "Accrual reversal", -250],
        ].map((r, i) => [
          ...r,
          `=IF(COUNTIF('Bank Statement'!$B$4:$B$11,B${4 + i})>0,"MATCHED","UNMATCHED")`,
        ]),
        ["Total per ledger", "", "", "=SUM(D4:D12)", ""],
      ]),
      S("Reconciliation", [
        ["BANK RECONCILIATION STATEMENT"],
        [],
        ["Balance per bank statement", "='Bank Statement'!D12"],
        ["Add: deposits in transit", "=SUMIFS(Ledger!$D$4:$D$12,Ledger!$E$4:$E$12,\"UNMATCHED\",Ledger!$D$4:$D$12,\">0\")"],
        ["Less: unpresented cheques", "=SUMIFS(Ledger!$D$4:$D$12,Ledger!$E$4:$E$12,\"UNMATCHED\",Ledger!$D$4:$D$12,\"<0\")"],
        ["Adjusted bank balance", "=B3+B4+B5"],
        [],
        ["Balance per general ledger", "=Ledger!D13"],
        ["Add: bank charges not recorded", "=-SUMIFS('Bank Statement'!$D$4:$D$11,'Bank Statement'!$E$4:$E$11,\"UNMATCHED\",'Bank Statement'!$D$4:$D$11,\"<0\")"],
        ["Less: interest not recorded", "=-SUMIFS('Bank Statement'!$D$4:$D$11,'Bank Statement'!$E$4:$E$11,\"UNMATCHED\",'Bank Statement'!$D$4:$D$11,\">0\")"],
        ["Adjusted ledger balance", "=B8-B9-B10"],
        [],
        ["VARIANCE (must be 0)", "=ROUND(B6-B11,2)"],
        ["Status", '=IF(ABS(B13)<0.01,"RECONCILED","INVESTIGATE")'],
        [],
        ["Unmatched bank items", '=COUNTIF(\'Bank Statement\'!$E$4:$E$11,"UNMATCHED")'],
        ["Unmatched ledger items", '=COUNTIF(Ledger!$E$4:$E$12,"UNMATCHED")'],
      ]),
    ],
  },
  {
    id: "ar-ap-aging",
    name: "A/R & A/P Aging with DSO / DPO",
    tier: "Intermediate",
    blurb: "Aging schedules bucketed Current / 30 / 60 / 90+ with calculated DSO and DPO metrics.",
    features: ["Aging buckets", "DSO & DPO", "Collection risk flags", "Cash conversion cycle"],
    prompt: "Add a collections priority list and forecast cash receipts for the next 30 days.",
    build: () => {
      const bucket = (r: number) =>
        `=IF(H${r}<=0,"Current",IF(H${r}<=30,"1-30",IF(H${r}<=60,"31-60",IF(H${r}<=90,"61-90","90+"))))`;
      const ar = [
        ["ACCOUNTS RECEIVABLE AGING"],
        ["As-of", "2026-04-30"],
        [],
        ["Invoice", "Customer", "Invoice date", "Due date", "Amount", "Terms", "Outstanding", "Days past due", "Bucket", "Risk"],
        ...[
          ["INV-3001", "Northwind Ltd", "2026-03-01", "2026-03-31", 12690, 30, 6690],
          ["INV-3002", "Acme Retail", "2026-02-10", "2026-03-12", 8450, 30, 8450],
          ["INV-3003", "Globex", "2026-04-05", "2026-05-05", 15200, 30, 15200],
          ["INV-3004", "Initech", "2026-01-22", "2026-02-21", 6300, 30, 6300],
          ["INV-3005", "Umbrella Co", "2025-12-14", "2026-01-13", 9800, 30, 7800],
          ["INV-3006", "Stark Ind", "2026-04-18", "2026-05-18", 22400, 30, 22400],
        ].map((r, i) => [
          ...r,
          `=MAX(0,$B$2-D${5 + i})`,
          bucket(5 + i),
          `=IF(H${5 + i}>90,"HIGH",IF(H${5 + i}>30,"MEDIUM","LOW"))`,
        ]),
        ["Total", "", "", "", "=SUM(E5:E10)", "", "=SUM(G5:G10)", "", "", ""],
        [],
        ["Bucket", "Amount", "% of A/R"],
        ...["Current", "1-30", "31-60", "61-90", "90+"].map((b, i) => [
          b,
          `=SUMIF($I$5:$I$10,A${14 + i},$G$5:$G$10)`,
          `=IFERROR(B${14 + i}/$G$11,0)`,
        ]),
        ["Total", "=SUM(B14:B18)", "=SUM(C14:C18)"],
      ];
      const ap = [
        ["ACCOUNTS PAYABLE AGING"],
        ["As-of", "2026-04-30"],
        [],
        ["Bill", "Vendor", "Bill date", "Due date", "Amount", "Terms", "Outstanding", "Days past due", "Bucket", "Action"],
        ...[
          ["BILL-201", "Supplier A", "2026-03-08", "2026-04-07", 34200, 30, 34200],
          ["BILL-202", "CloudHost", "2026-04-01", "2026-05-01", 6450, 30, 6450],
          ["BILL-203", "Landlord LLC", "2026-02-01", "2026-03-03", 8000, 30, 0],
          ["BILL-204", "Legal Partners", "2026-01-19", "2026-02-18", 9600, 30, 9600],
          ["BILL-205", "Travel Inc", "2026-04-21", "2026-05-21", 5300, 30, 5300],
        ].map((r, i) => [
          ...r,
          `=MAX(0,$B$2-D${5 + i})`,
          bucket(5 + i),
          `=IF(G${5 + i}=0,"Settled",IF(H${5 + i}>30,"PAY NOW","Schedule"))`,
        ]),
        ["Total", "", "", "", "=SUM(E5:E9)", "", "=SUM(G5:G9)", "", "", ""],
      ];
      return [
        S("AR Aging", ar),
        S("AP Aging", ap),
        S("Metrics", [
          ["WORKING CAPITAL METRICS"],
          [],
          ["Annual revenue (input)", 12000000],
          ["Annual COGS (input)", 5040000],
          ["Average inventory (input)", 620000],
          ["Total A/R", "='AR Aging'!G11"],
          ["Total A/P", "='AP Aging'!G10"],
          [],
          ["DSO (days)", "=B6/B3*365"],
          ["DPO (days)", "=B7/B4*365"],
          ["DIO (days)", "=B5/B4*365"],
          ["Cash conversion cycle", "=B9+B11-B10"],
          [],
          ["A/R over 60 days", "='AR Aging'!B16+'AR Aging'!B17+'AR Aging'!B18"],
          ["% of A/R over 60 days", "=B14/B6"],
          ["Collection risk", '=IF(B15>0.2,"ELEVATED","NORMAL")'],
        ]),
      ];
    },
  },
  {
    id: "working-capital",
    name: "Working Capital & Inventory Planning",
    tier: "Intermediate",
    blurb: "Inventory turnover forecasting with EOQ equations and dynamic safety-stock alerts.",
    features: ["EOQ formula", "Safety stock", "Reorder point", "Turnover forecast"],
    prompt: "Add a supplier lead-time sensitivity table and a 12-month reorder calendar.",
    build: () => [
      S("EOQ Planner", [
        ["INVENTORY & EOQ PLANNING"],
        [],
        ["Assumptions (blue = input)"],
        ["Annual demand (units)", 48000],
        ["Ordering cost per order", 240],
        ["Unit cost", 18.5],
        ["Holding cost % of unit cost", 0.22],
        ["Holding cost per unit", "=B6*B7"],
        ["Lead time (days)", 14],
        ["Service level Z-score", 1.65],
        ["Demand std dev (daily)", 22],
        [],
        ["Economic order quantity (EOQ)", "=SQRT(2*B4*B5/B8)"],
        ["Average daily demand", "=B4/365"],
        ["Safety stock", "=B10*B11*SQRT(B9)"],
        ["Reorder point", "=B14*B9+B15"],
        ["Orders per year", "=B4/B13"],
        ["Annual ordering cost", "=B17*B5"],
        ["Annual holding cost", "=B13/2*B8"],
        ["Total inventory cost", "=B18+B19"],
        ["Inventory turnover", "=B4/(B13/2+B15)"],
        ["Days inventory outstanding", "=365/B21"],
      ]),
      S("SKU Plan", [
        ["SKU-LEVEL PLAN"],
        [],
        ["SKU", "Annual demand", "Unit cost", "On hand", "Lead time", "Safety stock", "Reorder point", "EOQ", "Alert"],
        ...[
          ["SKU-100", 14400, 18.5, 900, 14],
          ["SKU-101", 9600, 26.0, 240, 21],
          ["SKU-102", 7200, 11.75, 1500, 10],
          ["SKU-103", 12000, 32.4, 410, 28],
          ["SKU-104", 4800, 9.2, 95, 7],
        ].map((r, i) => {
          const row = 4 + i;
          return [
            ...r,
            `=ROUND('EOQ Planner'!$B$10*'EOQ Planner'!$B$11*SQRT(E${row}),0)`,
            `=ROUND(B${row}/365*E${row}+F${row},0)`,
            `=ROUND(SQRT(2*B${row}*'EOQ Planner'!$B$5/(C${row}*'EOQ Planner'!$B$7)),0)`,
            `=IF(D${row}<F${row},"STOCKOUT RISK",IF(D${row}<=G${row},"REORDER NOW","OK"))`,
          ];
        }),
        ["Total", "=SUM(B4:B8)", "", "=SUM(D4:D8)", "", "=SUM(F4:F8)", "", "=SUM(H4:H8)", ""],
        [],
        ["SKUs needing reorder", '=COUNTIF(I4:I8,"REORDER NOW")+COUNTIF(I4:I8,"STOCKOUT RISK")'],
        ["Inventory value on hand", "=SUMPRODUCT(C4:C8,D4:D8)"],
      ]),
    ],
  },
  {
    id: "payroll-headcount",
    name: "Payroll & Headcount Model",
    tier: "Intermediate",
    blurb: "Department staffing planner calculating base salaries, taxes, benefits and bonus pools.",
    features: ["Department tiers", "Employer taxes", "Benefits load", "Bonus pool"],
    prompt: "Add a hiring plan by quarter with fully-loaded cost per new hire.",
    build: () => [
      S("Headcount", [
        ["PAYROLL & HEADCOUNT MODEL"],
        [],
        ["Assumptions"],
        ["Employer payroll tax %", 0.0765],
        ["Benefits % of base", 0.14],
        ["Bonus pool % of base", 0.1],
        ["Annual merit increase", 0.035],
        [],
        ["Employee", "Department", "Level", "Base salary", "Payroll tax", "Benefits", "Bonus", "Fully loaded"],
        ...[
          ["A. Patel", "Engineering", "Senior", 158000],
          ["J. Kim", "Engineering", "Mid", 122000],
          ["S. Novak", "Engineering", "Junior", 92000],
          ["M. Chen", "Sales", "Director", 175000],
          ["L. Gomez", "Sales", "Mid", 104000],
          ["R. Diaz", "G&A", "Manager", 118000],
          ["T. Osei", "Marketing", "Mid", 98000],
          ["K. Aluko", "Support", "Junior", 74000],
        ].map((r, i) => {
          const row = 10 + i;
          return [
            ...r,
            `=D${row}*$B$4`,
            `=D${row}*$B$5`,
            `=D${row}*$B$6`,
            `=SUM(D${row}:G${row})`,
          ];
        }),
        ["Total", "", "", "=SUM(D10:D17)", "=SUM(E10:E17)", "=SUM(F10:F17)", "=SUM(G10:G17)", "=SUM(H10:H17)"],
        [],
        ["Department", "Headcount", "Base", "Fully loaded", "% of total cost"],
        ...["Engineering", "Sales", "G&A", "Marketing", "Support"].map((d, i) => {
          const row = 21 + i;
          return [
            d,
            `=COUNTIF($B$10:$B$17,A${row})`,
            `=SUMIF($B$10:$B$17,A${row},$D$10:$D$17)`,
            `=SUMIF($B$10:$B$17,A${row},$H$10:$H$17)`,
            `=IFERROR(D${row}/$H$18,0)`,
          ];
        }),
        ["Total", "=SUM(B21:B25)", "=SUM(C21:C25)", "=SUM(D21:D25)", "=SUM(E21:E25)"],
        [],
        ["Next-year payroll (with merit)", "=D26*(1+B7)"],
        ["Average fully loaded cost", "=D26/B26"],
      ]),
    ],
  },
  {
    id: "budget-vs-actual",
    name: "Budget vs Actual Variance Dashboard",
    tier: "Intermediate",
    blurb: "Forecast vs actual comparison with dollar / percent deviation and conditional alert tags.",
    features: ["$ and % variance", "Favourable/unfavourable", "Alert tags", "Department roll-up"],
    prompt: "Add a driver-based explanation of the three largest unfavourable variances.",
    build: () => [
      S("Variance", [
        ["BUDGET VS ACTUAL — YTD 2026 ($)"],
        [],
        ["Account", "Type", "Department", "Budget", "Actual", "Variance $", "Variance %", "F/U", "Alert"],
        ...[
          ["Product revenue", "Revenue", "Sales", 1850000, 1712000],
          ["Service revenue", "Revenue", "Sales", 420000, 486000],
          ["COGS", "Cost", "Ops", 812000, 861000],
          ["Salaries", "Cost", "G&A", 560000, 548000],
          ["Marketing", "Cost", "Marketing", 185000, 233000],
          ["Rent", "Cost", "G&A", 96000, 96000],
          ["Software & IT", "Cost", "Engineering", 74000, 91500],
          ["Travel", "Cost", "Sales", 42000, 31800],
        ].map((r, i) => {
          const row = 4 + i;
          return [
            ...r,
            `=E${row}-D${row}`,
            `=IFERROR(F${row}/D${row},0)`,
            `=IF(B${row}="Revenue",IF(F${row}>=0,"Favourable","Unfavourable"),IF(F${row}<=0,"Favourable","Unfavourable"))`,
            `=IF(ABS(G${row})>0.1,IF(H${row}="Unfavourable","INVESTIGATE","OUTPERFORM"),"")`,
          ];
        }),
        [],
        ["Total revenue", "", "", "=SUMIF($B$4:$B$11,\"Revenue\",$D$4:$D$11)", "=SUMIF($B$4:$B$11,\"Revenue\",$E$4:$E$11)", "=E13-D13", "=F13/D13", "", ""],
        ["Total cost", "", "", "=SUMIF($B$4:$B$11,\"Cost\",$D$4:$D$11)", "=SUMIF($B$4:$B$11,\"Cost\",$E$4:$E$11)", "=E14-D14", "=F14/D14", "", ""],
        ["Operating income", "", "", "=D13-D14", "=E13-E14", "=E15-D15", "=F15/D15", '=IF(F15>=0,"Favourable","Unfavourable")', ""],
        [],
        ["Department", "Budget", "Actual", "Variance $", "Variance %", "Flag"],
        ...["Sales", "Ops", "G&A", "Marketing", "Engineering"].map((d, i) => {
          const row = 18 + i;
          return [
            d,
            `=SUMIF($C$4:$C$11,A${row},$D$4:$D$11)`,
            `=SUMIF($C$4:$C$11,A${row},$E$4:$E$11)`,
            `=C${row}-B${row}`,
            `=IFERROR(D${row}/B${row},0)`,
            `=IF(ABS(E${row})>0.1,"REVIEW","")`,
          ];
        }),
      ]),
    ],
  },
  {
    id: "capex-depreciation",
    name: "CapEx & Depreciation Schedule",
    tier: "Intermediate",
    blurb:
      "Fixed asset register with a method toggle for Straight-Line, Double Declining and MACRS.",
    features: ["Method toggle", "SL / DDB / MACRS", "Net book value", "Asset register"],
    prompt: "Add asset disposals with gain/loss on sale and a deferred tax impact schedule.",
    build: () => [
      S("Asset Register", [
        ["FIXED ASSET REGISTER & DEPRECIATION"],
        [],
        ["Depreciation method (Straight-Line / Double Declining / MACRS)", "Straight-Line"],
        ["MACRS 5-year rates", 0.2, 0.32, 0.192, 0.1152, 0.1152, 0.0576],
        [],
        ["Asset", "Category", "In service", "Cost", "Salvage", "Life (yrs)", "Yr 1", "Yr 2", "Yr 3", "Yr 4", "Yr 5", "Accum. dep.", "Net book value"],
        ...[
          ["Server cluster", "IT", "2026-01-15", 240000, 20000, 5],
          ["Delivery vans", "Vehicles", "2026-02-01", 165000, 25000, 5],
          ["CNC machine", "Plant", "2026-03-10", 420000, 40000, 5],
          ["Office fit-out", "Leasehold", "2026-04-01", 96000, 0, 5],
          ["Laptops", "IT", "2026-05-20", 58000, 4000, 5],
        ].map((r, i) => {
          const row = 7 + i;
          const yr = (y: number) =>
            `=IF($B$3="Straight-Line",($D${row}-$E${row})/$F${row},IF($B$3="MACRS",$D${row}*${String.fromCharCode(
              66 + y - 1,
            )}$4,MIN(MAX(0,$D${row}-$E${row}-SUM($G${row}:${String.fromCharCode(
              71 + y - 1,
            )}${row})),($D${row}-SUM($G${row}:${String.fromCharCode(71 + y - 1)}${row}))*2/$F${row})))`;
          return [
            ...r,
            ...[1, 2, 3, 4, 5].map((y) => yr(y)),
            `=SUM(G${row}:K${row})`,
            `=D${row}-L${row}`,
          ];
        }),
        ["Total", "", "", "=SUM(D7:D11)", "=SUM(E7:E11)", "", "=SUM(G7:G11)", "=SUM(H7:H11)", "=SUM(I7:I11)", "=SUM(J7:J11)", "=SUM(K7:K11)", "=SUM(L7:L11)", "=SUM(M7:M11)"],
        [],
        ["Total CapEx", "=D12"],
        ["Year 1 depreciation expense", "=G12"],
        ["5-year accumulated depreciation", "=L12"],
        ["Closing net book value", "=M12"],
        ["Check: NBV >= salvage", '=IF(M12>=E12,"OK","REVIEW")'],
      ]),
    ],
  },
];

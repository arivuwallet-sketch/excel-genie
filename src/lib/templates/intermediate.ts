import { S, type FinancialTemplate } from "./types.ts";

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
        [
          "Inventory",
          ...cols.map((c) => `=-'Income Statement'!${c}4*'Income Statement'!$B$28/365`),
        ],
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
            i === 0
              ? `=3200+'Income Statement'!${c}13`
              : `=${COL(i - 1)}17+'Income Statement'!${c}13`,
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
            i === 0
              ? `=-'Balance Sheet'!${c}3`
              : `=-('Balance Sheet'!${c}3-'Balance Sheet'!${COL(i - 1)}3)`,
          ),
        ],
        [
          "(Increase) in inventory",
          ...cols.map((c, i) =>
            i === 0
              ? `=-'Balance Sheet'!${c}4`
              : `=-('Balance Sheet'!${c}4-'Balance Sheet'!${COL(i - 1)}4)`,
          ),
        ],
        [
          "Increase in payables",
          ...cols.map((c, i) =>
            i === 0
              ? `='Balance Sheet'!${c}11`
              : `='Balance Sheet'!${c}11-'Balance Sheet'!${COL(i - 1)}11`,
          ),
        ],
        [
          "Increase in accruals",
          ...cols.map((c, i) =>
            i === 0
              ? `='Balance Sheet'!${c}12`
              : `='Balance Sheet'!${c}12-'Balance Sheet'!${COL(i - 1)}12`,
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
  (() => {
    // Layout constants: every list formula covers rows 10-500 so users can paste a full month's
    // statement or GL export below the header without editing a single formula.
    const FIRST = 10;
    const LAST = 500;
    const rng = (sheet: string, col: string) => `${sheet}!$${col}$${FIRST}:$${col}$${LAST}`;
    const BS = "'Bank Statement'";
    const CB = "'Cash Book'";
    const BANK_CATEGORIES = [
      "Bank charge",
      "Interest received",
      "Direct credit not in GL",
      "Direct debit not in GL",
      "Dishonoured cheque",
      "Bank error",
      "Book error",
    ];
    const BOOK_CATEGORIES = ["Deposit in transit", "Outstanding cheque", "Book error"];
    const sumCat = (sheet: string, cat: string) =>
      `SUMIFS(${rng(sheet, "F")},${rng(sheet, "J")},"${cat}")`;
    const cntCat = (sheet: string, cat: string) => `COUNTIF(${rng(sheet, "J")},"${cat}")`;
    const matchStatus = (other: string, r: number) =>
      `=IF(COUNTIFS(${rng(other, "B")},B${r},${rng(other, "F")},F${r})>0,"Matched",IF(COUNTIF(${rng(other, "B")},B${r})>0,"Amount mismatch","Unmatched"))`;

    // Illustrative March 2026 activity for a wholesale distributor (clearly labelled sample).
    // [date, reference, description, withdrawal, deposit, category override]
    const bankLines: [string, string, string, number, number, string][] = [
      ["2026-03-02", "DEP-0228", "Counter deposit lodged 28 Feb", 0, 18615.4, ""],
      ["2026-03-03", "CHQ-10388", "Cheque 10388 presented", 12480, 0, ""],
      ["2026-03-03", "ACH-55102", "ACH credit Harbor Foods Inc", 0, 42350, ""],
      ["2026-03-05", "CHQ-10401", "Cheque 10401 presented", 9875.25, 0, ""],
      ["2026-03-06", "WIR-77310", "Outgoing wire Pacific Steel Supply", 64200, 0, ""],
      ["2026-03-09", "ACH-55117", "ACH credit Lakeside Grocers", 0, 27918.6, ""],
      ["2026-03-13", "PAY-0313", "Payroll batch net pay", 58742.18, 0, ""],
      ["2026-03-13", "TAX-0313", "Federal payroll tax deposit", 17436.92, 0, ""],
      ["2026-03-16", "DEP-0316", "Branch deposit", 0, 15240, ""],
      ["2026-03-17", "CHQ-10404", "Cheque 10404 presented", 4530, 0, ""],
      ["2026-03-19", "ACH-55140", "ACH credit Midtown Hospitality", 0, 33605.75, ""],
      ["2026-03-20", "CC-0320", "Merchant card settlement", 0, 11872.4, ""],
      ["2026-03-20", "MFEE-0320", "Merchant processing fees", 356.17, 0, "Bank charge"],
      [
        "2026-03-24",
        "RTN-0324",
        "Returned item - NSF cheque Corner Deli",
        2480,
        0,
        "Dishonoured cheque",
      ],
      ["2026-03-25", "DD-0325", "Direct debit equipment lease", 3215, 0, ""],
      ["2026-03-27", "PAY-0327", "Payroll batch net pay", 59104.66, 0, ""],
      ["2026-03-27", "TAX-0327", "Federal payroll tax deposit", 17598.31, 0, ""],
      ["2026-03-30", "ACH-55188", "ACH credit Harbor Foods Inc", 0, 38940, ""],
      ["2026-03-31", "SVC-0331", "Account analysis service charge", 145, 0, "Bank charge"],
      ["2026-03-31", "INT-0331", "Interest credit", 0, 61.84, "Interest received"],
      ["2026-03-31", "ACH-90011", "ACH debit - policy not held by company", 1250, 0, "Bank error"],
    ];
    // [date, reference, description, receipt, payment, source, category override]
    const bookLines: [string, string, string, number, number, string, string][] = [
      [
        "2026-02-28",
        "DEP-0228",
        "Counter deposit 28 Feb (prior period)",
        18615.4,
        0,
        "Prior period O/S",
        "",
      ],
      [
        "2026-02-26",
        "CHQ-10388",
        "Southern Tool Co (prior period)",
        0,
        12480,
        "Prior period O/S",
        "",
      ],
      ["2026-03-02", "ACH-55102", "Harbor Foods - INV 22841-22847", 42350, 0, "Current period", ""],
      ["2026-03-03", "CHQ-10401", "Delta Packaging - bill 7781", 0, 9875.25, "Current period", ""],
      ["2026-03-05", "WIR-77310", "Pacific Steel Supply - PO 4410", 0, 64200, "Current period", ""],
      ["2026-03-09", "ACH-55117", "Lakeside Grocers - INV 22852", 27918.6, 0, "Current period", ""],
      ["2026-03-13", "PAY-0313", "Payroll 13 Mar - net pay", 0, 58742.18, "Current period", ""],
      ["2026-03-13", "TAX-0313", "Payroll taxes 13 Mar", 0, 17436.92, "Current period", ""],
      ["2026-03-16", "DEP-0316", "Branch deposit", 15240, 0, "Current period", ""],
      ["2026-03-16", "CHQ-10404", "Metro Electric - bill 0392", 0, 4350, "Current period", ""],
      [
        "2026-03-18",
        "ACH-55140",
        "Midtown Hospitality - INV 22860",
        33605.75,
        0,
        "Current period",
        "",
      ],
      ["2026-03-20", "CC-0320", "Card settlement 20 Mar", 11872.4, 0, "Current period", ""],
      ["2026-03-23", "CHQ-10405", "Allied Freight - bill 5521", 0, 6812.5, "Current period", ""],
      ["2026-03-25", "DD-0325", "Equipment lease - March", 0, 3215, "Current period", ""],
      ["2026-03-26", "CHQ-10406", "City Water Utility - March", 0, 1148.33, "Current period", ""],
      ["2026-03-27", "PAY-0327", "Payroll 27 Mar - net pay", 0, 59104.66, "Current period", ""],
      ["2026-03-27", "TAX-0327", "Payroll taxes 27 Mar", 0, 17598.31, "Current period", ""],
      ["2026-03-30", "ACH-55188", "Harbor Foods - INV 22871", 38940, 0, "Current period", ""],
      ["2026-03-31", "DEP-0331", "Counter deposit 31 Mar", 21486.9, 0, "Current period", ""],
      ["2026-03-31", "CHQ-10407", "Northside Realty - April rent", 0, 12500, "Current period", ""],
    ];

    const setup = () =>
      S("Setup", [
        ["BANK RECONCILIATION - SETUP & SIGN-OFF"],
        [
          "Sample figures for illustration only - replace every blue cell with your own statement, ledger and sign-off details.",
        ],
        ["Field", "Value", "Guidance"],
        ["Entity", "Harborview Distribution LLC (sample)", "Legal entity that owns the account"],
        [
          "Bank & account",
          "First National Bank - Operating ****4821",
          "Mask all but the last 4 digits",
        ],
        [
          "GL cash account",
          "1010 Cash at bank - Operating",
          "Account code and name from the chart of accounts",
        ],
        ["Currency", "USD", "Statement currency"],
        ["Period start", "2026-03-01", "First day covered by the statement"],
        ["Period end", "2026-03-31", "Statement date / reconciliation date"],
        ["Opening balance per bank statement", 248316.72, "From the statement header"],
        ["Closing balance per bank statement", 185507.22, "From the statement footer, as printed"],
        ["Opening balance per GL", 254452.12, "Must equal last month's reconciled GL balance"],
        ["Closing balance per GL trial balance", 190882.62, "From the period-end trial balance"],
        ["Rounding tolerance ($)", 0.01, "Differences at or below this are treated as nil"],
        ["Stale cheque threshold (days)", 180, "Cheques outstanding longer than this are flagged"],
        [
          "Deposit in transit alert (days)",
          5,
          "Deposits not credited after this many days are flagged",
        ],
        ["Prepared by", "", "Name of preparer"],
        ["Prepared date", "", "YYYY-MM-DD"],
        ["Reviewed by", "", "Name of reviewer (must differ from preparer)"],
        ["Review date", "", "YYYY-MM-DD"],
        [],
        ["Bank-side categories", "Book-side categories"],
        ...BANK_CATEGORIES.map((c, i) => [c, BOOK_CATEGORIES[i] ?? ""]),
      ]);

    const bank = () =>
      S("Bank Statement", [
        ["BANK STATEMENT - OPERATING ACCOUNT"],
        ["Opening balance per statement", "=Setup!B10"],
        ["Total deposits", `=SUM(E${FIRST}:E${LAST})`],
        ["Total withdrawals", `=SUM(D${FIRST}:D${LAST})`],
        ["Closing balance (computed)", "=B2+B3-B4"],
        ["Closing balance (as printed)", "=Setup!B11"],
        ["Statement ties to printed balance?", "=ABS(B5-B6)<=Setup!$B$14"],
        [],
        [
          "Date",
          "Reference",
          "Description",
          "Withdrawals",
          "Deposits",
          "Net amount",
          "Running balance",
          "Match status",
          "Category override",
          "Rec category",
          "Flag",
        ],
        ...bankLines.map(([date, ref, desc, wd, dep, cat], i) => {
          const r = FIRST + i;
          return [
            date,
            ref,
            desc,
            wd,
            dep,
            `=E${r}-D${r}`,
            i === 0 ? `=$B$2+F${r}` : `=G${r - 1}+F${r}`,
            matchStatus(CB, r),
            cat,
            `=IF(H${r}="Matched","",IF(I${r}<>"",I${r},IF(H${r}="Amount mismatch","Book error",IF(F${r}<0,"Direct debit not in GL","Direct credit not in GL"))))`,
            `=IF(OR(A${r}<Setup!$B$8,A${r}>Setup!$B$9),"Outside period",IF(COUNTIF($B$${FIRST}:$B$${LAST},B${r})>1,"Duplicate reference",IF(H${r}="Amount mismatch","Amount differs from GL","")))`,
          ];
        }),
      ]);

    const book = () =>
      S("Cash Book", [
        ["CASH BOOK - GL CASH ACCOUNT"],
        ["Opening balance per GL", "=Setup!B12"],
        ["Receipts this period", `=SUMIFS(D${FIRST}:D${LAST},G${FIRST}:G${LAST},"Current period")`],
        ["Payments this period", `=SUMIFS(E${FIRST}:E${LAST},G${FIRST}:G${LAST},"Current period")`],
        ["Closing balance (computed)", "=B2+B3-B4"],
        ["Closing balance per trial balance", "=Setup!B13"],
        ["Ledger ties to trial balance?", "=ABS(B5-B6)<=Setup!$B$14"],
        [],
        [
          "Date",
          "Reference",
          "Description",
          "Receipts",
          "Payments",
          "Net amount",
          "Source",
          "Match status",
          "Category override",
          "Rec category",
          "Days outstanding",
          "Flag",
        ],
        ...bookLines.map(([date, ref, desc, rec, pay, src, cat], i) => {
          const r = FIRST + i;
          return [
            date,
            ref,
            desc,
            rec,
            pay,
            `=D${r}-E${r}`,
            src,
            matchStatus(BS, r),
            cat,
            `=IF(H${r}="Matched","",IF(I${r}<>"",I${r},IF(H${r}="Amount mismatch","Book error",IF(F${r}>0,"Deposit in transit","Outstanding cheque"))))`,
            `=IF(H${r}="Matched",0,MAX(0,Setup!$B$9-A${r}))`,
            `=IF(AND(G${r}="Current period",OR(A${r}<Setup!$B$8,A${r}>Setup!$B$9)),"Outside period",IF(H${r}="Matched",IF(G${r}="Prior period O/S","Cleared from prior period",""),IF(AND(J${r}="Outstanding cheque",K${r}>Setup!$B$15),"Stale cheque - review",IF(AND(J${r}="Deposit in transit",K${r}>Setup!$B$16),"Late deposit - investigate",IF(H${r}="Amount mismatch","Amount differs from bank",IF(G${r}="Prior period O/S","Still outstanding from prior period",""))))))`,
          ];
        }),
      ]);

    const rec = () =>
      S("Reconciliation", [
        ["BANK RECONCILIATION STATEMENT"],
        ["Entity", "=Setup!B4"],
        ["Account", "=Setup!B5"],
        ["As at", "=Setup!B9"],
        [],
        ["Bank side", "Amount", "Items"],
        ["Balance per bank statement", `=${BS}!B5`, ""],
        [
          "Add: deposits in transit",
          `=${sumCat(CB, "Deposit in transit")}`,
          `=${cntCat(CB, "Deposit in transit")}`,
        ],
        [
          "Less: outstanding cheques",
          `=${sumCat(CB, "Outstanding cheque")}`,
          `=${cntCat(CB, "Outstanding cheque")}`,
        ],
        [
          "Add/(less): bank errors to be reversed by bank",
          `=-${sumCat(BS, "Bank error")}`,
          `=${cntCat(BS, "Bank error")}`,
        ],
        ["Adjusted bank balance", "=SUM(B7:B10)", "=SUM(C8:C10)"],
        [],
        ["Book side", "Amount", "Items"],
        ["Balance per general ledger", `=${CB}!B5`, ""],
        [
          "Add: interest received not recorded",
          `=${sumCat(BS, "Interest received")}`,
          `=${cntCat(BS, "Interest received")}`,
        ],
        [
          "Add: direct credits not recorded",
          `=${sumCat(BS, "Direct credit not in GL")}`,
          `=${cntCat(BS, "Direct credit not in GL")}`,
        ],
        [
          "Less: bank charges not recorded",
          `=${sumCat(BS, "Bank charge")}`,
          `=${cntCat(BS, "Bank charge")}`,
        ],
        [
          "Less: direct debits not recorded",
          `=${sumCat(BS, "Direct debit not in GL")}`,
          `=${cntCat(BS, "Direct debit not in GL")}`,
        ],
        [
          "Less: dishonoured cheques",
          `=${sumCat(BS, "Dishonoured cheque")}`,
          `=${cntCat(BS, "Dishonoured cheque")}`,
        ],
        [
          "Add/(less): book errors",
          `=${sumCat(BS, "Book error")}-${sumCat(CB, "Book error")}`,
          `=${cntCat(BS, "Book error")}+${cntCat(CB, "Book error")}`,
        ],
        ["Adjusted book balance", "=SUM(B14:B20)", "=SUM(C15:C20)"],
        [],
        ["Unreconciled difference", "=ROUND(B11-B21,2)"],
        ["Status", '=IF(ABS(B23)<=Setup!B14,"RECONCILED","UNRECONCILED - INVESTIGATE")'],
        [
          "Review status",
          '=IF(AND(Setup!B17<>"",Setup!B19<>""),IF(Setup!B17=Setup!B19,"Preparer and reviewer must differ","Signed off"),"Awaiting preparer and reviewer sign-off")',
        ],
        [],
        ["Prepared by", '=IF(Setup!B17="","",Setup!B17)', '=IF(Setup!B18="","",Setup!B18)'],
        ["Reviewed by", '=IF(Setup!B19="","",Setup!B19)', '=IF(Setup!B20="","",Setup!B20)'],
      ]);

    // Book-side items need journals so the GL agrees to the adjusted balance next month.
    const R = "Reconciliation";
    const aje: [string, string, string, string][] = [
      ["AJE-1", "Interest received", "7010 Interest income", `${R}!B15`],
      ["AJE-2", "Direct credits not recorded", "2190 Unidentified receipts (suspense)", `${R}!B16`],
      ["AJE-3", "Bank charges", "6810 Bank service charges", `${R}!B17`],
      ["AJE-4", "Direct debits not recorded", "2195 Unidentified payments (suspense)", `${R}!B18`],
      ["AJE-5", "Dishonoured cheques", "1200 Accounts receivable", `${R}!B19`],
      ["AJE-6", "Book error correction", "2000 Accounts payable", `${R}!B20`],
    ];
    const journals = () =>
      S("Adjusting Entries", [
        ["PROPOSED ADJUSTING JOURNAL ENTRIES - BOOK SIDE"],
        [
          "Post these in the GL so next month's opening balance agrees to the adjusted book balance.",
        ],
        ["Entry", "Purpose", "Account", "Debit", "Credit"],
        ...aje.flatMap(([id, purpose, account, cell], i) => {
          const r = 4 + i * 2;
          return [
            [id, purpose, account, `=MAX(0,-${cell})`, `=MAX(0,${cell})`],
            [id, purpose, "=Setup!B6", `=E${r}`, `=D${r}`],
          ];
        }),
        [],
        ["Total debits", "", "", "=SUM(D4:D15)"],
        ["Total credits", "", "", "=SUM(E4:E15)"],
        [
          "Net change to GL cash",
          "",
          "",
          `=SUMIFS(D4:D15,C4:C15,Setup!B6)-SUMIFS(E4:E15,C4:C15,Setup!B6)`,
        ],
        ["GL cash after entries", "", "", `=${CB}!B5+D19`],
      ]);

    const unmatched = (sheet: string) =>
      `COUNTIF(${rng(sheet, "H")},"Unmatched")+COUNTIF(${rng(sheet, "H")},"Amount mismatch")`;
    const checks = () =>
      S("Checks", [
        ["CONTROL CHECKS"],
        [],
        ["Check", "Pass?"],
        ["Bank statement lines tie to the printed closing balance", `=${BS}!B7`],
        ["Cash book ties to the trial balance", `=${CB}!B7`],
        [
          "Opening GL = opening bank + prior-period outstanding items",
          `=ABS(Setup!B12-(Setup!B10+SUMIFS(${rng(CB, "F")},${rng(CB, "G")},"Prior period O/S")))<=Setup!B14`,
        ],
        ["Reconciliation difference within tolerance", `=ABS(${R}!B23)<=Setup!B14`],
        [
          "Every unmatched bank line has a valid category",
          `=${unmatched(BS)}=${BANK_CATEGORIES.map((c) => cntCat(BS, c)).join("+")}`,
        ],
        [
          "Every unmatched ledger line has a valid category",
          `=${unmatched(CB)}=${BOOK_CATEGORIES.map((c) => cntCat(CB, c)).join("+")}`,
        ],
        ["No stale outstanding cheques", `=COUNTIF(${rng(CB, "L")},"Stale cheque - review")=0`],
        ["No late deposits in transit", `=COUNTIF(${rng(CB, "L")},"Late deposit - investigate")=0`],
        ["No duplicate bank references", `=COUNTIF(${rng(BS, "K")},"Duplicate reference")=0`],
        [
          "No transactions dated outside the period",
          `=COUNTIF(${rng(BS, "K")},"Outside period")+COUNTIF(${rng(CB, "L")},"Outside period")=0`,
        ],
        [
          "Adjusting entries balance (debits = credits)",
          "=ABS('Adjusting Entries'!D17-'Adjusting Entries'!D18)<0.005",
        ],
        [
          "Adjusting entries bring GL to the adjusted book balance",
          `=ABS('Adjusting Entries'!D20-${R}!B21)<=Setup!B14`,
        ],
        [],
        ["MASTER CHECK", "=AND(B4:B15)"],
      ]);

    return {
      id: "bank-reconciliation",
      name: "Bank Reconciliation Statement",
      tier: "Intermediate",
      blurb:
        "Month-end bank-to-ledger reconciliation: reference + amount matching, deposits in transit, outstanding cheques, bank and book errors, aging flags, adjusting journals and 12 control checks.",
      features: [
        "Reference + amount matching",
        "Prior-period items roll forward",
        "Bank vs book error handling",
        "Stale cheque & late deposit flags",
        "Adjusting journal entries",
        "Preparer / reviewer sign-off",
      ],
      prompt:
        "Paste my bank statement and GL cash export into this reconciliation, match every line, categorise anything unmatched and explain each reconciling item.",
      build: () => [setup(), bank(), book(), rec(), journals(), checks()],
    } satisfies FinancialTemplate;
  })(),
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
        [
          "Invoice",
          "Customer",
          "Invoice date",
          "Due date",
          "Amount",
          "Terms",
          "Outstanding",
          "Days past due",
          "Bucket",
          "Risk",
        ],
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
        [
          "Bill",
          "Vendor",
          "Bill date",
          "Due date",
          "Amount",
          "Terms",
          "Outstanding",
          "Days past due",
          "Bucket",
          "Action",
        ],
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
        [
          "SKU",
          "Annual demand",
          "Unit cost",
          "On hand",
          "Lead time",
          "Safety stock",
          "Reorder point",
          "EOQ",
          "Alert",
        ],
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
    blurb:
      "Department staffing planner calculating base salaries, taxes, benefits and bonus pools.",
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
        [
          "Employee",
          "Department",
          "Level",
          "Base salary",
          "Payroll tax",
          "Benefits",
          "Bonus",
          "Fully loaded",
        ],
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
          return [...r, `=D${row}*$B$4`, `=D${row}*$B$5`, `=D${row}*$B$6`, `=SUM(D${row}:G${row})`];
        }),
        [
          "Total",
          "",
          "",
          "=SUM(D10:D17)",
          "=SUM(E10:E17)",
          "=SUM(F10:F17)",
          "=SUM(G10:G17)",
          "=SUM(H10:H17)",
        ],
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
    blurb:
      "Forecast vs actual comparison with dollar / percent deviation and conditional alert tags.",
    features: ["$ and % variance", "Favourable/unfavourable", "Alert tags", "Department roll-up"],
    prompt: "Add a driver-based explanation of the three largest unfavourable variances.",
    build: () => [
      S("Variance", [
        ["BUDGET VS ACTUAL — YTD 2026 ($)"],
        [],
        [
          "Account",
          "Type",
          "Department",
          "Budget",
          "Actual",
          "Variance $",
          "Variance %",
          "F/U",
          "Alert",
        ],
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
        [
          "Total revenue",
          "",
          "",
          '=SUMIF($B$4:$B$11,"Revenue",$D$4:$D$11)',
          '=SUMIF($B$4:$B$11,"Revenue",$E$4:$E$11)',
          "=E13-D13",
          "=F13/D13",
          "",
          "",
        ],
        [
          "Total cost",
          "",
          "",
          '=SUMIF($B$4:$B$11,"Cost",$D$4:$D$11)',
          '=SUMIF($B$4:$B$11,"Cost",$E$4:$E$11)',
          "=E14-D14",
          "=F14/D14",
          "",
          "",
        ],
        [
          "Operating income",
          "",
          "",
          "=D13-D14",
          "=E13-E14",
          "=E15-D15",
          "=F15/D15",
          '=IF(F15>=0,"Favourable","Unfavourable")',
          "",
        ],
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
        [
          "Asset",
          "Category",
          "In service",
          "Cost",
          "Salvage",
          "Life (yrs)",
          "Yr 1",
          "Yr 2",
          "Yr 3",
          "Yr 4",
          "Yr 5",
          "Accum. dep.",
          "Net book value",
        ],
        ...[
          ["Server cluster", "IT", "2026-01-15", 240000, 20000, 5],
          ["Delivery vans", "Vehicles", "2026-02-01", 165000, 25000, 5],
          ["CNC machine", "Plant", "2026-03-10", 420000, 40000, 5],
          ["Office fit-out", "Leasehold", "2026-04-01", 96000, 0, 5],
          ["Laptops", "IT", "2026-05-20", 58000, 4000, 5],
        ].map((r, i) => {
          const row = 7 + i;
          const yr = (y: number) => {
            // Prior-years-only accumulated depreciation for the declining-balance branch — year 1 has no
            // prior years (0), year y sums columns G..(one before the current year's column).
            const priorSum = y === 1 ? "0" : `SUM($G${row}:${String.fromCharCode(69 + y)}${row})`;
            return `=IF($B$3="Straight-Line",($D${row}-$E${row})/$F${row},IF($B$3="MACRS",$D${row}*${String.fromCharCode(
              66 + y - 1,
            )}$4,MIN(MAX(0,$D${row}-$E${row}-${priorSum}),($D${row}-${priorSum})*2/$F${row})))`;
          };
          return [
            ...r,
            ...[1, 2, 3, 4, 5].map((y) => yr(y)),
            `=SUM(G${row}:K${row})`,
            `=D${row}-L${row}`,
          ];
        }),
        [
          "Total",
          "",
          "",
          "=SUM(D7:D11)",
          "=SUM(E7:E11)",
          "",
          "=SUM(G7:G11)",
          "=SUM(H7:H11)",
          "=SUM(I7:I11)",
          "=SUM(J7:J11)",
          "=SUM(K7:K11)",
          "=SUM(L7:L11)",
          "=SUM(M7:M11)",
        ],
        [],
        ["Total CapEx", "=D12"],
        ["Year 1 depreciation expense", "=G12"],
        ["5-year accumulated depreciation", "=L12"],
        ["Closing net book value", "=M12"],
        ["Check: NBV >= salvage", '=IF(M12>=E12,"OK","REVIEW")'],
      ]),
    ],
  },
  {
    id: "inventory-cogs-tracker",
    name: "Inventory & COGS Tracker",
    tier: "Intermediate",
    blurb: "Stock levels with reorder alerts, monthly cost of goods sold, and inventory turnover.",
    features: ["Reorder-point alerts", "Monthly COGS", "Gross margin %", "Inventory turnover"],
    prompt: "Extend this inventory tracker with a FIFO cost layer table for one SKU.",
    build: () => [
      S("Inventory", [
        ["INVENTORY & COGS TRACKER"],
        ["Blue cells are inputs. Reorder point triggers the Status flag."],
        [],
        [
          "SKU",
          "Item",
          "On Hand",
          "Reorder Point",
          "Unit Cost",
          "Unit Price",
          "Inventory Value",
          "Status",
        ],
        ["SK-001", "Ceramic Mug", 140, 50, 4.2, 12.99, "=C5*E5", '=IF(C5<=D5,"REORDER","OK")'],
        ["SK-002", "Tote Bag", 60, 40, 6.5, 18.5, "=C6*E6", '=IF(C6<=D6,"REORDER","OK")'],
        ["SK-003", "Candle - Vanilla", 25, 30, 3.1, 9.99, "=C7*E7", '=IF(C7<=D7,"REORDER","OK")'],
        ["SK-004", "Notebook", 210, 75, 1.8, 6.5, "=C8*E8", '=IF(C8<=D8,"REORDER","OK")'],
        ["Total", "", "=SUM(C5:C8)", "", "", "", "=SUM(G5:G8)", ""],
      ]),
      S("COGS", [
        ["MONTHLY COST OF GOODS SOLD"],
        [],
        ["Month", "Units Sold", "Avg Unit Cost", "COGS", "Revenue", "Gross Margin %"],
        [
          "Jan",
          180,
          "=IFERROR(Inventory!$G$9/Inventory!$C$9,0)",
          "=B4*C4",
          3240,
          "=IFERROR((E4-D4)/E4,0)",
        ],
        [
          "Feb",
          205,
          "=IFERROR(Inventory!$G$9/Inventory!$C$9,0)",
          "=B5*C5",
          3690,
          "=IFERROR((E5-D5)/E5,0)",
        ],
        [
          "Mar",
          190,
          "=IFERROR(Inventory!$G$9/Inventory!$C$9,0)",
          "=B6*C6",
          3420,
          "=IFERROR((E6-D6)/E6,0)",
        ],
        ["Total", "=SUM(B4:B6)", "", "=SUM(D4:D6)", "=SUM(E4:E6)", "=IFERROR((E7-D7)/E7,0)"],
        [],
        ["Inventory turnover (annualized)", "=IFERROR((D7*4)/Inventory!$G$9,0)"],
      ]),
    ],
  },
  {
    id: "freelance-time-billing",
    name: "Freelance Time & Billing Tracker",
    tier: "Intermediate",
    blurb:
      "Log billable hours per client/project, roll up into a client summary, and track what's invoiced vs outstanding.",
    features: ["Time log", "Per-client summary", "Invoiced vs outstanding", "Utilization check"],
    prompt: "Extend this time & billing tracker with a weekly capacity view across all clients.",
    build: () => [
      S("Time Log", [
        ["FREELANCE TIME & BILLING TRACKER"],
        ["Log hours per client/project. Blue cells are inputs."],
        [],
        ["Date", "Client", "Project", "Hours", "Rate", "Billable Amount", "Invoiced?"],
        ["2027-01-06", "Acme Co", "Website redesign", 4.5, 85, "=D5*E5", "Yes"],
        ["2027-01-07", "Acme Co", "Website redesign", 3, 85, "=D6*E6", "Yes"],
        ["2027-01-08", "Brightline", "Brand refresh", 6, 95, "=D7*E7", "No"],
        ["2027-01-09", "Acme Co", "Website redesign", 2.5, 85, "=D8*E8", "No"],
        ["2027-01-10", "Brightline", "Brand refresh", 4, 95, "=D9*E9", "No"],
        ["Total", "", "", "=SUM(D5:D9)", "", "=SUM(F5:F9)", ""],
      ]),
      S("Summary", [
        ["CLIENT SUMMARY"],
        [],
        ["Client", "Hours Logged", "Billable Total", "Invoiced", "Outstanding"],
        [
          "Acme Co",
          "=SUMIF('Time Log'!$B$5:$B$9,A4,'Time Log'!$D$5:$D$9)",
          "=SUMIF('Time Log'!$B$5:$B$9,A4,'Time Log'!$F$5:$F$9)",
          "=SUMIFS('Time Log'!$F$5:$F$9,'Time Log'!$B$5:$B$9,A4,'Time Log'!$G$5:$G$9,\"Yes\")",
          "=C4-D4",
        ],
        [
          "Brightline",
          "=SUMIF('Time Log'!$B$5:$B$9,A5,'Time Log'!$D$5:$D$9)",
          "=SUMIF('Time Log'!$B$5:$B$9,A5,'Time Log'!$F$5:$F$9)",
          "=SUMIFS('Time Log'!$F$5:$F$9,'Time Log'!$B$5:$B$9,A5,'Time Log'!$G$5:$G$9,\"Yes\")",
          "=C5-D5",
        ],
        ["Total", "=SUM(B4:B5)", "=SUM(C4:C5)", "=SUM(D4:D5)", "=SUM(E4:E5)"],
        [],
        ["Utilization vs 2-week capacity (80 hrs)", "=IFERROR('Time Log'!$D$10/80,0)"],
      ]),
    ],
  },
  {
    id: "recruiting-pipeline",
    name: "Recruiting Pipeline Tracker",
    tier: "Intermediate",
    blurb:
      "Candidate-by-candidate pipeline with a stage funnel and conversion rates from applied through offer.",
    features: ["Candidate tracker", "Stage funnel", "Conversion %", "Offer tracking"],
    prompt: "Extend this recruiting pipeline with average days-in-stage per role.",
    build: () => [
      S("Pipeline", [
        ["RECRUITING PIPELINE TRACKER"],
        ["One row per candidate. Blue cells are inputs."],
        [],
        ["Candidate", "Role", "Stage", "Applied Date", "Offer $"],
        ["A. Kumar", "Backend Engineer", "Offer", "2027-01-05", 128000],
        ["J. Silva", "Backend Engineer", "Onsite", "2027-01-10", ""],
        ["M. Chen", "Product Designer", "Screen", "2027-01-12", ""],
        ["R. Osei", "Backend Engineer", "Rejected", "2027-01-03", ""],
        ["T. Novak", "Product Designer", "Applied", "2027-01-15", ""],
      ]),
      S("Funnel", [
        ["STAGE FUNNEL & CONVERSION"],
        [],
        ["Stage", "Count", "% of Applied"],
        ["Applied", "=COUNTA(Pipeline!$A$5:$A$9)", "=B4/$B$4"],
        [
          "Screen",
          '=COUNTIF(Pipeline!$C$5:$C$9,"Screen")+COUNTIF(Pipeline!$C$5:$C$9,"Onsite")+COUNTIF(Pipeline!$C$5:$C$9,"Offer")',
          "=B5/$B$4",
        ],
        [
          "Onsite",
          '=COUNTIF(Pipeline!$C$5:$C$9,"Onsite")+COUNTIF(Pipeline!$C$5:$C$9,"Offer")',
          "=B6/$B$4",
        ],
        ["Offer", '=COUNTIF(Pipeline!$C$5:$C$9,"Offer")', "=B7/$B$4"],
      ]),
    ],
  },
];

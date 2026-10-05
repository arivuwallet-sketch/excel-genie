/**
 * ExcelGPT v2 — extended formula engine ("beyond core").
 *
 * A superset of ./evaluate.ts: every function of the original bounded scalar
 * engine is preserved verbatim, plus ~95 additional functions that accountants
 * and analysts use daily: financial (PMT/IPMT/PPMT/FV/PV/RATE/NPER/NPV/IRR/
 * XNPV/XIRR/depreciation), date/time (DATE/EDATE/EOMONTH/DATEDIF/NETWORKDAYS/
 * WORKDAY/YEARFRAC...), text (TEXTJOIN/SUBSTITUTE/XLOOKUP-era text), statistics
 * (MEDIAN/STDEV/PERCENTILE/LARGE/SMALL/SLOPE/FORECAST...), modern lookups
 * (XLOOKUP/XMATCH/CHOOSE/HLOOKUP), logical (IFS/SWITCH/XOR/IFNA) and dynamic
 * arrays (FILTER/UNIQUE/SORT/SORTBY/SEQUENCE/TRANSPOSE/TEXTSPLIT/VSTACK/
 * HSTACK/TOCOL/TOROW/CHOOSECOLS/CHOOSEROWS/TAKE/DROP/SUMPRODUCT).
 *
 * Safety invariants identical to the base engine: no eval, no code generation,
 * no network, no nondeterminism (RAND/NOW/TODAY stay unsupported), explicit
 * #ERROR!-style codes, bounded output, and array results are returned as
 * Scalar[][] so the caller can spill them (see ../calculation-v2.ts).
 */
import { CalcError, type Node, type Scalar } from "./parser.ts";
import { SUPPORTED_FUNCTIONS } from "./evaluate.ts";

export type Value = Scalar | Scalar[][];
export type RefNode = Extract<Node, { kind: "ref" }>;
const unsupported = () => {
  throw new CalcError("#UNSUPPORTED!");
};
const scalar = (value: Value): Scalar => {
  if (Array.isArray(value)) return unsupported();
  return value;
};
function number(value: Value): number {
  const v = scalar(value);
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return Number(v);
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim())) return Number(v);
  throw new CalcError("#VALUE!");
}
const text = (v: Value) => {
  const s = scalar(v);
  return s === null ? "" : typeof s === "boolean" ? String(s).toUpperCase() : String(s);
};
const truth = (v: Value) => {
  const s = scalar(v);
  if (typeof s === "string" && !/^(TRUE|FALSE)$/i.test(s)) throw new CalcError("#VALUE!");
  return typeof s === "string" ? s.toUpperCase() === "TRUE" : !!s;
};
function compare(a: Scalar, b: Scalar): number {
  if (a === null) a = typeof b === "string" ? "" : 0;
  if (b === null) b = typeof a === "string" ? "" : 0;
  if (typeof a === "string" && typeof b === "string") {
    a = a.toLowerCase();
    b = b.toLowerCase();
  }
  if (a === b) return 0;
  if (typeof a !== typeof b) {
    const rank = (v: Scalar) => (typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2);
    return rank(a) - rank(b);
  }
  return a < b ? -1 : 1;
}
function criterion(criteria: Value) {
  const raw = scalar(criteria);
  if (typeof raw !== "string") return (v: Scalar) => compare(v, raw) === 0;
  const match = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(raw)!;
  const op = match[1] || "=",
    target = match[2]!;
  if ((op === "=" || op === "<>") && /[?*~]/.test(target)) {
    let source = "";
    for (let i = 0; i < target.length; i++) {
      const c = target[i]!;
      if (c === "~" && i + 1 < target.length)
        source += target[++i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      else source += c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    const regex = new RegExp(`^${source}$`, "i");
    return (v: Scalar) => (typeof v === "string" && regex.test(v)) === (op === "=");
  }
  const numeric = target.trim() !== "" && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(target);
  const expected = numeric ? Number(target) : target;
  return (v: Scalar) => {
    if (numeric && typeof v !== "number") return op === "<>";
    const cmp = compare(v, expected);
    return op === "="
      ? cmp === 0
      : op === "<>"
        ? cmp !== 0
        : op === "<"
          ? cmp < 0
          : op === ">"
            ? cmp > 0
            : op === "<="
              ? cmp <= 0
              : cmp >= 0;
  };
}

/* ---------------------------------- dates --------------------------------- */
const MS_PER_DAY = 86400 * 1000;
const EPOCH = 25569; // Excel serial of 1970-01-01T00:00:00Z (1900 date system, 1899-12-30 base)
const utcToSerial = (ms: number) => ms / MS_PER_DAY + EPOCH;
const serialToUtc = (serial: number) => new Date(Math.round((serial - EPOCH) * MS_PER_DAY));
const DATE_TEXT =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?)?$/;
function dateSerial(v: Value): number | null {
  const s = scalar(v);
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s === "string") {
    const m = DATE_TEXT.exec(s.trim());
    if (m)
      return utcToSerial(
        Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)),
      );
  }
  return null;
}
const requireDate = (v: Value): number => {
  const serial = dateSerial(v);
  if (serial === null) throw new CalcError("#VALUE!");
  return serial;
};
function shiftMonths(serial: number, months: number, keepDay: boolean): number {
  const d = serialToUtc(serial);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + Math.trunc(months);
  const year = Math.floor(total / 12),
    month = total - year * 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = keepDay ? Math.min(d.getUTCDate(), last) : last;
  return utcToSerial(Date.UTC(year, month, day));
}
const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
const addYearsClamped = (d: Date, years: number) => {
  const y = d.getUTCFullYear() + years;
  return new Date(Date.UTC(y, d.getUTCMonth(), Math.min(d.getUTCDate(), daysInMonth(y, d.getUTCMonth()))));
};

/* ------------------------------- financial ------------------------------- */
const pmtCompute = (rate: number, nper: number, pv: number, fv: number, type: number) => {
  if (!Number.isFinite(nper) || nper <= 0) throw new CalcError("#NUM!");
  if (rate === 0) return -(pv + fv) / nper;
  const grown = Math.pow(1 + rate, nper);
  return (-(rate * (fv + pv * grown)) / ((1 + rate * type) * (grown - 1))) as number;
};
/** Iterative amortization walk shared by IPMT/PPMT/CUMIPMT/CUMPRINC. */
function amortize(
  rate: number,
  nper: number,
  pv: number,
  fv: number,
  type: number,
): { interest: number[]; principal: number[] } {
  const payment = pmtCompute(rate, nper, pv, fv, type);
  const interest: number[] = [],
    principal: number[] = [];
  let balance = pv;
  for (let k = 1; k <= nper; k++) {
    const i = type === 1 && k === 1 ? 0 : balance * rate;
    const p = -payment - i;
    interest.push(i);
    principal.push(p);
    balance -= p;
  }
  return { interest, principal };
}
/** Bisection root find over a bounded interval; used by RATE/IRR/XIRR. */
function solveRate(f: (r: number) => number): number {
  const lo = -0.999999,
    hi = 10;
  const STEPS = 400;
  let prevR = lo,
    prevY = f(prevR);
  if (!Number.isFinite(prevY)) prevY = f(lo + 1e-9);
  for (let i = 1; i <= STEPS; i++) {
    const r = lo + ((hi - lo) * i) / STEPS;
    const y = f(r);
    if (!Number.isFinite(y)) continue;
    if (y === 0) return r;
    if (prevY * y < 0) {
      let a = prevR,
        b = r,
        ya = prevY;
      for (let k = 0; k < 100; k++) {
        const mid = (a + b) / 2,
          ym = f(mid);
        if (!Number.isFinite(ym)) break;
        if (ya * ym <= 0) b = mid;
        else {
          a = mid;
          ya = ym;
        }
      }
      return (a + b) / 2;
    }
    prevR = r;
    prevY = y;
  }
  throw new CalcError("#NUM!");
}

/* --------------------------------- arrays --------------------------------- */
const toArray = (v: Value): Scalar[][] => (Array.isArray(v) ? v : [[v]]);
const flat = (v: Value): Scalar[] => (Array.isArray(v) ? v.flat() : [v]);
const numbers = (v: Value): number[] => flat(v).filter((n): n is number => typeof n === "number");
const CELL_CAP = 10000;
const capCheck = (rows: number, cols: number) => {
  if (rows * cols > CELL_CAP) throw new CalcError("#LIMIT!");
};
const CELL_JOIN = (v: Scalar) => `${typeof v}:${String(v)}`;
const rowKey = (row: Scalar[]) => row.map(CELL_JOIN).join("");

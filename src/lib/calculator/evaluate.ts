import { CalcError, type Node, type Scalar } from "./parser.ts";
type Value = Scalar | Scalar[][];
export const SUPPORTED_FUNCTIONS = [
  "SUM",
  "AVERAGE",
  "MIN",
  "MAX",
  "COUNT",
  "COUNTA",
  "COUNTBLANK",
  "IF",
  "IFERROR",
  "AND",
  "OR",
  "NOT",
  "SUMIF",
  "COUNTIF",
  "SUMIFS",
  "COUNTIFS",
  "VLOOKUP",
  "INDEX",
  "MATCH",
  "ROUND",
  "ROUNDUP",
  "ROUNDDOWN",
  "ABS",
  "INT",
  "LEN",
  "LEFT",
  "RIGHT",
  "MID",
  "TRIM",
  "UPPER",
  "LOWER",
  "CONCATENATE",
  "ISNUMBER",
  "ISTEXT",
  "ISBLANK",
] as const;
const unsupported = () => {
  throw new CalcError("#UNSUPPORTED!");
};
function scalar(value: Value): Scalar {
  if (Array.isArray(value)) return unsupported();
  return value;
}
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
    // Text and numbers are distinct in ranges; blank criteria match empty cells.
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

export function evaluate(tree: Node, read: (ref: Extract<Node, { kind: "ref" }>) => Value): Value {
  const rawVisit = (node: Node): Value => {
    if (node.kind === "literal") return node.value;
    if (node.kind === "ref") return read(node);
    if (node.kind === "unary") {
      const n = number(visit(node.arg));
      return node.op === "%" ? n / 100 : node.op === "-" ? -n : n;
    }
    if (node.kind === "binary") {
      const a = visit(node.left),
        b = visit(node.right);
      if (node.op === "&") return text(a) + text(b);
      if (["=", "<>", "<", ">", "<=", ">="].includes(node.op)) {
        const cmp = compare(scalar(a), scalar(b));
        return node.op === "="
          ? cmp === 0
          : node.op === "<>"
            ? cmp !== 0
            : node.op === "<"
              ? cmp < 0
              : node.op === ">"
                ? cmp > 0
                : node.op === "<="
                  ? cmp <= 0
                  : cmp >= 0;
      }
      const x = number(a),
        y = number(b);
      if (node.op === "/" && y === 0) throw new CalcError("#DIV/0!");
      return node.op === "+"
        ? x + y
        : node.op === "-"
          ? x - y
          : node.op === "*"
            ? x * y
            : node.op === "/"
              ? x / y
              : x ** y;
    }
    const name = node.name;
    if (name.startsWith("#")) throw new CalcError(name);
    if (!(SUPPORTED_FUNCTIONS as readonly string[]).includes(name)) return unsupported();
    const arity = (min: number, max = min) => {
      if (node.args.length < min || node.args.length > max) throw new CalcError("#VALUE!");
    };
    // Lazy conditionals prevent unused branches from creating false errors.
    if (name === "IF") {
      arity(2, 3);
      return truth(visit(node.args[0]!))
        ? visit(node.args[1]!)
        : node.args[2]
          ? visit(node.args[2])
          : false;
    }
    if (name === "IFERROR") {
      arity(2);
      try {
        return visit(node.args[0]!);
      } catch (e) {
        if (!(e instanceof CalcError) || ["#UNSUPPORTED!", "#LIMIT!", "#CYCLE!"].includes(e.code))
          throw e;
        return visit(node.args[1]!);
      }
    }
    const args = node.args.map(visit),
      first = args[0] ?? null;
    const range = (v: Value): Scalar[][] => (Array.isArray(v) ? v : [[v]]);
    const flat = args.flatMap((a) => (Array.isArray(a) ? a.flat() : [a]));
    if (["SUM", "AVERAGE", "MIN", "MAX", "COUNT"].includes(name)) {
      arity(1, 255);
      const nums: number[] = [];
      args.forEach((a, i) => {
        if (Array.isArray(a) || node.args[i]!.kind === "ref") {
          for (const v of range(a).flat()) if (typeof v === "number") nums.push(v);
        } else if (name === "COUNT") {
          if (a !== null) {
            try {
              nums.push(number(a));
            } catch {
              /* COUNT ignores nonnumeric literals. */
            }
          }
        } else nums.push(number(a));
      });
      if (name === "COUNT") return nums.length;
      if (name === "AVERAGE" && !nums.length) throw new CalcError("#DIV/0!");
      if (name === "MIN" || name === "MAX")
        return nums.length
          ? nums.reduce((a, b) => (name === "MIN" ? Math.min(a, b) : Math.max(a, b)))
          : 0;
      const sum = nums.reduce((a, b) => a + b, 0);
      return name === "SUM" ? sum : sum / nums.length;
    }
    if (name === "COUNTA") {
      arity(1, 255);
      return flat.filter((v) => v !== null).length;
    }
    if (name === "COUNTBLANK") {
      arity(1);
      return flat.filter((v) => v === null || v === "").length;
    }
    if (name === "AND" || name === "OR") {
      arity(1, 255);
      const bools = flat.filter((v) => typeof v !== "string" && v !== null).map(truth);
      if (!bools.length) throw new CalcError("#VALUE!");
      return name === "AND" ? bools.every(Boolean) : bools.some(Boolean);
    }
    if (name === "NOT") {
      arity(1);
      return !truth(first);
    }
    if (["SUMIF", "COUNTIF", "SUMIFS", "COUNTIFS"].includes(name)) {
      const sum = name.startsWith("SUM");
      if (name.endsWith("IFS")) {
        if (args.length < (sum ? 3 : 2) || args.length % 2 !== (sum ? 1 : 0))
          throw new CalcError("#VALUE!");
      } else arity(2, sum ? 3 : 2);
      const values = range(name === "SUMIF" ? (args[2] ?? first) : first);
      const pairs: [Scalar[][], ReturnType<typeof criterion>][] = [];
      if (name.endsWith("IFS")) {
        for (let i = sum ? 1 : 0; i < args.length; i += 2)
          pairs.push([range(args[i]!), criterion(args[i + 1]!)]);
      } else pairs.push([range(first), criterion(args[1]!)]);
      if (
        pairs.some(
          ([r]) =>
            r.length !== values.length || r.some((row, i) => row.length !== values[i]!.length),
        )
      )
        throw new CalcError("#VALUE!");
      let output = 0;
      values.forEach((row, r) =>
        row.forEach((v, c) => {
          if (pairs.every(([data, test]) => test(data[r]![c]!)))
            output += sum ? (typeof v === "number" ? v : 0) : 1;
        }),
      );
      return output;
    }
    if (name === "VLOOKUP") {
      arity(4);
      if (truth(args[3]!)) return unsupported();
      const table = range(args[1]!);
      const col = number(args[2]!);
      if (!Number.isInteger(col) || col < 1 || col > (table[0]?.length ?? 0))
        throw new CalcError("#REF!");
      const lookup = scalar(first);
      const match =
        typeof lookup === "string" && /[*?~]/.test(lookup)
          ? criterion(`=${lookup}`)
          : (v: Scalar) => compare(v, lookup) === 0;
      const row = table.find((r) => match(r[0]!));
      if (!row) throw new CalcError("#N/A");
      return row[col - 1] ?? 0;
    }
    if (name === "MATCH") {
      arity(3);
      if (number(args[2]!) !== 0) return unsupported();
      const table = range(args[1]!);
      if (table.length > 1 && (table[0]?.length ?? 0) > 1) throw new CalcError("#N/A");
      const lookup = scalar(first);
      const match =
        typeof lookup === "string" && /[*?~]/.test(lookup)
          ? criterion(`=${lookup}`)
          : (v: Scalar) => compare(v, lookup) === 0;
      const index = table.flat().findIndex(match);
      if (index < 0) throw new CalcError("#N/A");
      return index + 1;
    }
    if (name === "INDEX") {
      arity(2, 3);
      const table = range(first),
        horizontal = args.length === 2 && table.length === 1,
        row = horizontal ? 1 : number(args[1]!),
        col = horizontal ? number(args[1]!) : args[2] === undefined ? 1 : number(args[2]);
      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 1 ||
        col < 1 ||
        !table[row - 1] ||
        col > table[row - 1]!.length
      )
        throw new CalcError("#REF!");
      return table[row - 1]![col - 1] ?? 0;
    }
    if (["ROUND", "ROUNDUP", "ROUNDDOWN"].includes(name)) {
      arity(2);
      const n = number(first),
        digits = Math.trunc(number(args[1]!));
      if (Math.abs(digits) > 15) return unsupported();
      const factor = 10 ** digits,
        scaled = Math.abs(n) * factor;
      return (
        (Math.sign(n) *
          (name === "ROUNDUP"
            ? Math.ceil(scaled)
            : name === "ROUNDDOWN"
              ? Math.floor(scaled)
              : Math.floor(scaled + 0.5 + Number.EPSILON * scaled))) /
        factor
      );
    }
    if (name === "ABS" || name === "INT") {
      arity(1);
      return name === "ABS" ? Math.abs(number(first)) : Math.floor(number(first));
    }
    if (name === "ISNUMBER" || name === "ISTEXT" || name === "ISBLANK") {
      arity(1);
      const v = scalar(first);
      return name === "ISNUMBER"
        ? typeof v === "number"
        : name === "ISTEXT"
          ? typeof v === "string"
          : v === null;
    }
    if (name === "CONCATENATE") {
      arity(1, 255);
      return args.map(text).join("");
    }
    if (name === "LEFT" || name === "RIGHT") {
      arity(1, 2);
      const n = args[1] === undefined ? 1 : Math.trunc(number(args[1]));
      if (n < 0) throw new CalcError("#VALUE!");
      return name === "LEFT" ? text(first).slice(0, n) : n === 0 ? "" : text(first).slice(-n);
    }
    if (name === "MID") {
      arity(3);
      const start = Math.trunc(number(args[1]!)),
        length = Math.trunc(number(args[2]!));
      if (start < 1 || length < 0) throw new CalcError("#VALUE!");
      return text(first).slice(start - 1, start - 1 + length);
    }
    arity(1);
    if (name === "LEN") return text(first).length;
    if (name === "TRIM")
      return text(first)
        .replace(/^ +| +$/g, "")
        .replace(/ +/g, " ");
    if (name === "UPPER") return text(first).toUpperCase();
    if (name === "LOWER") return text(first).toLowerCase();
    return unsupported();
  };
  const visit = (node: Node): Value => {
    const value = rawVisit(node);
    if (typeof value === "number" && !Number.isFinite(value)) throw new CalcError("#NUM!");
    if (typeof value === "string" && value.length > 10000) throw new CalcError("#LIMIT!");
    return value;
  };
  const value = visit(tree);
  if (typeof value === "number" && !Number.isFinite(value)) throw new CalcError("#NUM!");
  return value;
}

export type Scalar = string | number | boolean | null;
export class CalcError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
export type Node =
  | { kind: "literal"; value: Scalar }
  | {
      kind: "ref";
      sheet: string | undefined;
      row: number;
      col: number;
      endRow: number;
      endCol: number;
    }
  | { kind: "call"; name: string; args: Node[] }
  | { kind: "unary"; op: string; arg: Node }
  | { kind: "binary"; op: string; left: Node; right: Node };
type Token = { kind: string; text: string };
const cell = /^\$?([A-Za-z]{1,3})\$?([1-9]\d{0,6})$/;
const precedence: Record<string, number> = {
  "=": 1,
  "<>": 1,
  "<": 1,
  ">": 1,
  "<=": 1,
  ">=": 1,
  "&": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "^": 5,
};
function coords(text: string) {
  const match = cell.exec(text);
  if (!match) throw new CalcError("#UNSUPPORTED!");
  const col = [...match[1]!.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const row = Number(match[2]);
  if (col > 16384 || row > 1048576) throw new CalcError("#REF!");
  return { row, col };
}

/** Parses a deliberately bounded subset of Excel syntax. No eval or code generation. */
export function parseFormula(source: string): Node {
  const tokens: Token[] = [];
  const pattern =
    /\s+|"(?:[^"]|"")*"|'(?:[^']|'')*'|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|\$?[A-Za-z_][A-Za-z0-9_.$]*|#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!)|<=|>=|<>|[+\-*/^&=<>%(),:!]/gy;
  let offset = 0;
  while (offset < source.length) {
    pattern.lastIndex = offset;
    const m = pattern.exec(source);
    if (!m) throw new CalcError("#UNSUPPORTED!");
    offset = pattern.lastIndex;
    const text = m[0];
    if (/^\s/.test(text)) continue;
    tokens.push({
      kind: text.startsWith('"')
        ? "string"
        : text.startsWith("'")
          ? "sheet"
          : /^\d|^\.\d/.test(text)
            ? "number"
            : text.startsWith("#")
              ? "error"
              : /^[A-Za-z_$]/.test(text)
                ? "word"
                : text,
      text,
    });
    if (tokens.length > 2000) throw new CalcError("#LIMIT!");
  }
  let index = 0,
    depth = 0;
  const peek = () => tokens[index];
  const take = () => {
    const token = tokens[index++];
    if (!token) throw new CalcError("#ERROR!");
    return token;
  };
  const expect = (kind: string) => {
    if (take().kind !== kind) throw new CalcError("#ERROR!");
  };
  const expression = (minimum = 0): Node => {
    if (++depth > 100) throw new CalcError("#LIMIT!");
    let left: Node;
    const token = take();
    if (token.kind === "+" || token.kind === "-")
      left = { kind: "unary", op: token.kind, arg: expression(6) };
    else if (token.kind === "(") {
      left = expression();
      expect(")");
    } else if (token.kind === "string")
      left = { kind: "literal", value: token.text.slice(1, -1).replace(/""/g, '"') };
    else if (token.kind === "number" && peek()?.kind !== "!")
      left = { kind: "literal", value: Number(token.text) };
    else if (token.kind === "error") left = { kind: "call", name: token.text, args: [] };
    else if (token.kind === "word" || token.kind === "sheet" || token.kind === "number") {
      if (peek()?.kind === "(" && token.kind === "word") {
        take();
        const args: Node[] = [];
        while (peek()?.kind !== ")") {
          if (peek()?.kind === ",") args.push({ kind: "literal", value: null });
          else args.push(expression());
          if (peek()?.kind !== ",") break;
          take();
          if (peek()?.kind === ")") args.push({ kind: "literal", value: null });
        }
        expect(")");
        left = { kind: "call", name: token.text.toUpperCase(), args };
      } else if (/^(TRUE|FALSE)$/i.test(token.text) && peek()?.kind !== "!")
        left = { kind: "literal", value: token.text.toUpperCase() === "TRUE" };
      else {
        let sheet: string | undefined,
          address = token.text;
        if (peek()?.kind === "!") {
          take();
          sheet = token.kind === "sheet" ? token.text.slice(1, -1).replace(/''/g, "'") : token.text;
          address = take().text;
        }
        const from = coords(address);
        let to = from;
        if (peek()?.kind === ":") {
          take();
          to = coords(take().text);
        }
        left = {
          kind: "ref",
          sheet,
          row: Math.min(from.row, to.row),
          col: Math.min(from.col, to.col),
          endRow: Math.max(from.row, to.row),
          endCol: Math.max(from.col, to.col),
        };
      }
    } else throw new CalcError("#ERROR!");
    while (peek()) {
      if (peek()!.kind === "%") {
        take();
        left = { kind: "unary", op: "%", arg: left };
        continue;
      }
      const op = peek()!.kind,
        priority = precedence[op];
      if (priority === undefined || priority < minimum) break;
      take();
      left = { kind: "binary", op, left, right: expression(priority + 1) };
    }
    depth--;
    return left;
  };
  const tree = expression();
  if (index !== tokens.length) throw new CalcError("#UNSUPPORTED!");
  return tree;
}

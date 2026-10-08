// Small, safe expression language for formula columns (no eval).
// Examples:
//   Length * Qty * PLF([Member Size])
//   IF(Area > 0, Area * PSF([Member Size]), Length * PLF([Member Size])) * Qty
//   ROUNDUP(Area / 32, 0)

import { plf, psf } from './steelShapes';

export type FValue = number | string;

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; name: string }
  | { t: 'call'; name: string; args: Node[] }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'neg'; a: Node };

export class FormulaError extends Error {}

interface Tok {
  k: 'num' | 'str' | 'id' | 'op' | 'eof';
  v: string;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      if (!m) throw new FormulaError(`Bad number at ${i + 1}`);
      out.push({ k: 'num', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new FormulaError('Unterminated string');
      out.push({ k: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (c === '[') {
      const end = src.indexOf(']', i + 1);
      if (end < 0) throw new FormulaError('Missing ]');
      out.push({ k: 'id', v: src.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      out.push({ k: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '<>', '!=', '=='].includes(two)) {
      out.push({ k: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/^(),<>=&'.includes(c)) {
      out.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected character "${c}"`);
  }
  out.push({ k: 'eof', v: '' });
  return out;
}

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expectOp = (v: string) => {
    const t = next();
    if (t.k !== 'op' || t.v !== v) throw new FormulaError(`Expected "${v}"`);
  };

  const primary = (): Node => {
    const t = next();
    if (t.k === 'num') return { t: 'num', v: parseFloat(t.v) };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'id') {
      if (peek().k === 'op' && peek().v === '(') {
        next();
        const args: Node[] = [];
        if (!(peek().k === 'op' && peek().v === ')')) {
          args.push(expr());
          while (peek().k === 'op' && peek().v === ',') {
            next();
            args.push(expr());
          }
        }
        expectOp(')');
        return { t: 'call', name: t.v.toUpperCase(), args };
      }
      return { t: 'ref', name: t.v };
    }
    if (t.k === 'op' && t.v === '(') {
      const e = expr();
      expectOp(')');
      return e;
    }
    throw new FormulaError(t.k === 'eof' ? 'Unexpected end of formula' : `Unexpected "${t.v}"`);
  };
  const unary = (): Node => {
    const t = peek();
    if (t.k === 'op' && (t.v === '-' || t.v === '+')) {
      next();
      const a = unary();
      return t.v === '-' ? { t: 'neg', a } : a;
    }
    return power();
  };
  const power = (): Node => {
    const a = primary();
    if (peek().k === 'op' && peek().v === '^') {
      next();
      return { t: 'bin', op: '^', a, b: unary() };
    }
    return a;
  };
  const mult = (): Node => {
    let a = unary();
    while (peek().k === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = next().v;
      a = { t: 'bin', op, a, b: unary() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mult();
    while (peek().k === 'op' && ['+', '-', '&'].includes(peek().v)) {
      const op = next().v;
      a = { t: 'bin', op, a, b: mult() };
    }
    return a;
  };
  const expr = (): Node => {
    const a = add();
    const t = peek();
    if (t.k === 'op' && ['=', '==', '<>', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      next();
      return { t: 'bin', op: t.v, a, b: add() };
    }
    return a;
  };

  const root = expr();
  if (peek().k !== 'eof') throw new FormulaError(`Unexpected "${peek().v}"`);
  return root;
}

const cache = new Map<string, Node | FormulaError>();

export function compile(src: string): Node {
  const hit = cache.get(src);
  if (hit instanceof FormulaError) throw hit;
  if (hit) return hit;
  try {
    const n = parse(src);
    cache.set(src, n);
    return n;
  } catch (e) {
    const err = e instanceof FormulaError ? e : new FormulaError(String(e));
    cache.set(src, err);
    throw err;
  }
}

/** Returns an error message, or null when the formula parses. */
export function validateFormula(src: string): string | null {
  try {
    compile(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function referencedNames(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node) => {
    if (n.t === 'ref') out.add(n.name);
    else if (n.t === 'call') n.args.forEach(walk);
    else if (n.t === 'bin') {
      walk(n.a);
      walk(n.b);
    } else if (n.t === 'neg') walk(n.a);
  };
  try {
    walk(compile(src));
  } catch {
    /* ignore */
  }
  return [...out];
}

export const toNum = (v: FValue | undefined | null): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
};

const toStr = (v: FValue): string => (typeof v === 'number' ? String(v) : v);
const truthy = (v: FValue) => (typeof v === 'number' ? v !== 0 : v !== '' && v.toLowerCase() !== 'false');

function roundTo(x: number, n: number, mode: 'round' | 'up' | 'down') {
  const f = Math.pow(10, n);
  const y = x * f;
  const r = mode === 'round' ? Math.round(y) : mode === 'up' ? Math.sign(y) * Math.ceil(Math.abs(y) - 1e-9) : Math.sign(y) * Math.floor(Math.abs(y) + 1e-9);
  return r / f;
}

export const FUNCTIONS: Record<string, string> = {
  IF: 'IF(condition, then, else)',
  ROUND: 'ROUND(x, digits)',
  ROUNDUP: 'ROUNDUP(x, digits)',
  ROUNDDOWN: 'ROUNDDOWN(x, digits)',
  CEILING: 'CEILING(x, step)',
  FLOOR: 'FLOOR(x, step)',
  MIN: 'MIN(a, b, …)',
  MAX: 'MAX(a, b, …)',
  ABS: 'ABS(x)',
  SQRT: 'SQRT(x)',
  AND: 'AND(a, b, …)',
  OR: 'OR(a, b, …)',
  NOT: 'NOT(a)',
  CONCAT: 'CONCAT(a, b, …)',
  PLF: 'PLF(shape) – steel weight lb/ft, e.g. PLF("W18x35") = 35',
  PSF: 'PSF(plate) – plate weight lb/sf, e.g. PSF("PL1/2") = 20.42',
};

export function evaluate(src: string, resolve: (name: string) => FValue | undefined): FValue {
  const node = compile(src);
  const ev = (n: Node): FValue => {
    switch (n.t) {
      case 'num':
        return n.v;
      case 'str':
        return n.v;
      case 'ref': {
        const v = resolve(n.name);
        if (v === undefined) throw new FormulaError(`Unknown column "${n.name}"`);
        return v;
      }
      case 'neg':
        return -toNum(ev(n.a));
      case 'bin': {
        const a = ev(n.a);
        const b = ev(n.b);
        switch (n.op) {
          case '+':
            return toNum(a) + toNum(b);
          case '-':
            return toNum(a) - toNum(b);
          case '*':
            return toNum(a) * toNum(b);
          case '/': {
            const d = toNum(b);
            return d === 0 ? 0 : toNum(a) / d;
          }
          case '^':
            return Math.pow(toNum(a), toNum(b));
          case '&':
            return toStr(a) + toStr(b);
          default: {
            const numeric = typeof a === 'number' || typeof b === 'number';
            const x: FValue = numeric ? toNum(a) : toStr(a).toLowerCase();
            const y: FValue = numeric ? toNum(b) : toStr(b).toLowerCase();
            switch (n.op) {
              case '=':
              case '==':
                return x === y ? 1 : 0;
              case '<>':
              case '!=':
                return x !== y ? 1 : 0;
              case '<':
                return x < y ? 1 : 0;
              case '>':
                return x > y ? 1 : 0;
              case '<=':
                return x <= y ? 1 : 0;
              case '>=':
                return x >= y ? 1 : 0;
            }
          }
        }
        throw new FormulaError(`Bad operator ${n.op}`);
      }
      case 'call': {
        const args = n.args;
        const num = (i: number, d = 0) => (args[i] ? toNum(ev(args[i])) : d);
        switch (n.name) {
          case 'IF':
            if (args.length < 2) throw new FormulaError('IF needs 2 or 3 arguments');
            return truthy(ev(args[0])) ? ev(args[1]) : args[2] ? ev(args[2]) : 0;
          case 'ROUND':
            return roundTo(num(0), num(1), 'round');
          case 'ROUNDUP':
            return roundTo(num(0), num(1), 'up');
          case 'ROUNDDOWN':
            return roundTo(num(0), num(1), 'down');
          case 'CEILING': {
            const s = num(1, 1) || 1;
            return Math.ceil(num(0) / s - 1e-9) * s;
          }
          case 'FLOOR': {
            const s = num(1, 1) || 1;
            return Math.floor(num(0) / s + 1e-9) * s;
          }
          case 'MIN':
            return Math.min(...args.map((a) => toNum(ev(a))));
          case 'MAX':
            return Math.max(...args.map((a) => toNum(ev(a))));
          case 'ABS':
            return Math.abs(num(0));
          case 'SQRT':
            return Math.sqrt(Math.max(0, num(0)));
          case 'AND':
            return args.every((a) => truthy(ev(a))) ? 1 : 0;
          case 'OR':
            return args.some((a) => truthy(ev(a))) ? 1 : 0;
          case 'NOT':
            return args[0] && truthy(ev(args[0])) ? 0 : 1;
          case 'CONCAT':
            return args.map((a) => toStr(ev(a))).join('');
          case 'PLF':
            return plf(args[0] ? toStr(ev(args[0])) : '');
          case 'PSF':
            return psf(args[0] ? toStr(ev(args[0])) : '');
        }
        throw new FormulaError(`Unknown function ${n.name}()`);
      }
    }
  };
  return ev(node);
}

/** Normalise a column name for case/space-insensitive formula references. */
export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

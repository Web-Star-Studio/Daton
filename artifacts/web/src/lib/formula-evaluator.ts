export type FormulaVariable = { key: string; label: string };

export type RenamePair = { from: string; to: string };

/**
 * Detecta renames inequívocos de variável entre dois estados de
 * `formulaVariables`. Espelha a lógica do backend
 * (artifacts/api-server/src/services/kpi/formula-rename.ts) — usada só pra
 * AVISAR o usuário na UI que editar a fórmula vai recalcular lançamentos
 * antigos. A migração de fato acontece no backend (PATCH indicator).
 *
 * Política conservadora: só retorna pares quando `|removed| == |added|` E o
 * pareamento posicional cobre exatamente removidos/adicionados. Em qualquer
 * ambiguidade (reorder + rename, adição/remoção real), devolve [].
 */
export function detectVariableRenames(
  oldVars: FormulaVariable[],
  newVars: FormulaVariable[],
): RenamePair[] {
  const oldKeys = new Set(oldVars.map((v) => v.key));
  const newKeys = new Set(newVars.map((v) => v.key));
  const removed = new Set([...oldKeys].filter((k) => !newKeys.has(k)));
  const added = new Set([...newKeys].filter((k) => !oldKeys.has(k)));

  if (removed.size === 0 && added.size === 0) return [];
  if (removed.size !== added.size) return [];

  const renames: RenamePair[] = [];
  const maxLen = Math.max(oldVars.length, newVars.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldVars[i];
    const n = newVars[i];
    if (o && n && o.key !== n.key && removed.has(o.key) && added.has(n.key)) {
      renames.push({ from: o.key, to: n.key });
    }
  }

  const coveredFrom = new Set(renames.map((r) => r.from));
  const coveredTo = new Set(renames.map((r) => r.to));
  if (
    coveredFrom.size !== removed.size ||
    coveredTo.size !== added.size ||
    [...removed].some((k) => !coveredFrom.has(k)) ||
    [...added].some((k) => !coveredTo.has(k))
  ) {
    return [];
  }

  return renames;
}

type Token =
  | { type: "num"; value: number }
  | { type: "id"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" }
  | { type: "lparen" }
  | { type: "rparen" };

const OP_PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }
    if (c === "(" ) { tokens.push({ type: "lparen" }); i++; continue; }
    if (c === ")") { tokens.push({ type: "rparen" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < expr.length && ((expr[j] >= "0" && expr[j] <= "9") || expr[j] === "." || expr[j] === ",")) j++;
      const raw = expr.slice(i, j).replace(",", ".");
      const n = Number(raw);
      if (Number.isNaN(n)) throw new Error(`Número inválido: "${raw}"`);
      tokens.push({ type: "num", value: n });
      i = j;
      continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      let j = i;
      while (
        j < expr.length &&
        ((expr[j] >= "a" && expr[j] <= "z") ||
          (expr[j] >= "A" && expr[j] <= "Z") ||
          (expr[j] >= "0" && expr[j] <= "9") ||
          expr[j] === "_")
      ) j++;
      tokens.push({ type: "id", value: expr.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    throw new Error(`Caractere inválido: "${c}"`);
  }
  return tokens;
}

function toRpn(tokens: Token[]): Token[] {
  const out: Token[] = [];
  const ops: Token[] = [];
  for (const t of tokens) {
    if (t.type === "num" || t.type === "id") {
      out.push(t);
    } else if (t.type === "op") {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top.type === "op" && OP_PRECEDENCE[top.value] >= OP_PRECEDENCE[t.value]) {
          out.push(ops.pop()!);
        } else break;
      }
      ops.push(t);
    } else if (t.type === "lparen") {
      ops.push(t);
    } else if (t.type === "rparen") {
      while (ops.length > 0 && ops[ops.length - 1].type !== "lparen") {
        out.push(ops.pop()!);
      }
      if (ops.length === 0) throw new Error("Parêntese fechado sem abertura");
      ops.pop();
    }
  }
  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top.type === "lparen") throw new Error("Parêntese aberto sem fechamento");
    out.push(top);
  }
  return out;
}

function evalRpn(rpn: Token[], inputs: Record<string, number | null>): number | null {
  const stack: (number | null)[] = [];
  for (const t of rpn) {
    if (t.type === "num") {
      stack.push(t.value);
    } else if (t.type === "id") {
      const v = inputs[t.value];
      stack.push(v === undefined ? null : v);
    } else if (t.type === "op") {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Expressão malformada");
      if (a === null || b === null) {
        stack.push(null);
        continue;
      }
      if (t.value === "+") stack.push(a + b);
      else if (t.value === "-") stack.push(a - b);
      else if (t.value === "*") stack.push(a * b);
      else if (t.value === "/") stack.push(b === 0 ? null : a / b);
    }
  }
  if (stack.length !== 1) throw new Error("Expressão malformada");
  return stack[0]!;
}

export function evaluateFormula(
  expression: string,
  inputs: Record<string, number | null>,
): number | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;
  try {
    const rpn = toRpn(tokenize(trimmed));
    const normalized: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(inputs)) normalized[k.toLowerCase()] = v;
    const result = evalRpn(rpn, normalized);
    if (result === null) return null;
    if (!Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

export function extractVariableKeys(expression: string): string[] {
  try {
    const tokens = tokenize(expression);
    const keys = new Set<string>();
    for (const t of tokens) if (t.type === "id") keys.add(t.value);
    return [...keys];
  } catch {
    return [];
  }
}

/**
 * Convenience: returns true if the indicator has a usable formula —
 * at least one variable, a non-empty expression, and validateFormula passes.
 * Used to gate launch-cell rendering and surface "fórmula inválida" warnings.
 */
export function hasValidFormula(
  variables: FormulaVariable[] | null | undefined,
  expression: string | null | undefined,
): boolean {
  if (!variables || variables.length === 0) return false;
  if (!expression || !expression.trim()) return false;
  return validateFormula(expression, variables).ok;
}

const OP_GLYPH: Record<string, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

function tokenDisplay(t: Token, labelByKey: Map<string, string>): string {
  if (t.type === "num") return String(t.value);
  if (t.type === "id") return labelByKey.get(t.value) ?? t.value;
  if (t.type === "op") return OP_GLYPH[t.value] ?? t.value;
  return t.type === "lparen" ? "(" : ")";
}

/**
 * Walks the token stream checking structural validity: operandos e operadores
 * devem alternar, e parênteses devem balancear. Pega fórmulas malformadas que
 * o shunting-yard aceita em silêncio — ex. "a (b - c)" (faltou operador antes
 * do parêntese) ou "a * 100 /" (operador pendurado no fim) — que antes
 * passavam na validação mas deixavam o preview "Como será calculado" vazio.
 */
function findStructuralError(
  tokens: Token[],
  labelByKey: Map<string, string>,
): string | null {
  let depth = 0;
  let prev: Token | null = null;
  for (const t of tokens) {
    const prevIsOperand =
      prev !== null && (prev.type === "num" || prev.type === "id" || prev.type === "rparen");
    if (t.type === "lparen") {
      if (prevIsOperand) {
        return `Faltou um operador (+, −, × ou ÷) entre "${tokenDisplay(prev!, labelByKey)}" e "("`;
      }
      depth++;
    } else if (t.type === "rparen") {
      if (depth === 0) return "Parêntese fechado sem abertura";
      if (prev === null || prev.type === "lparen") return "Parênteses vazios: ()";
      if (prev.type === "op") return `Faltou um valor depois de "${tokenDisplay(prev, labelByKey)}"`;
      depth--;
    } else if (t.type === "op") {
      if (!prevIsOperand) return `Faltou um valor antes de "${tokenDisplay(t, labelByKey)}"`;
    } else if (prevIsOperand) {
      return `Faltou um operador (+, −, × ou ÷) entre "${tokenDisplay(prev!, labelByKey)}" e "${tokenDisplay(t, labelByKey)}"`;
    }
    prev = t;
  }
  if (depth > 0) return "Parêntese aberto sem fechamento";
  if (prev !== null && prev.type === "op") {
    return `Fórmula incompleta: faltou um valor depois de "${tokenDisplay(prev, labelByKey)}"`;
  }
  return null;
}

export function validateFormula(
  expression: string,
  variables: FormulaVariable[],
): { ok: true } | { ok: false; error: string } {
  const trimmed = expression.trim();
  if (!trimmed) return { ok: false, error: "Expressão vazia" };
  let tokens: Token[];
  try {
    tokens = tokenize(trimmed);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro de sintaxe" };
  }
  if (tokens.length === 0) return { ok: false, error: "Expressão vazia" };
  const labelByKey = new Map(variables.map((v) => [v.key.toLowerCase(), v.label]));
  const structuralError = findStructuralError(tokens, labelByKey);
  if (structuralError) return { ok: false, error: structuralError };
  const declaredKeys = new Set(variables.map((v) => v.key.toLowerCase()));
  for (const t of tokens) {
    if (t.type === "id" && !declaredKeys.has(t.value)) {
      return { ok: false, error: `Variável não declarada: "${t.value}"` };
    }
  }
  return { ok: true };
}

const SLUG_MAP: Record<string, string> = {
  á: "a", à: "a", ã: "a", â: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", õ: "o", ô: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

export function slugifyKey(label: string): string {
  const lowered = label.toLowerCase();
  let out = "";
  for (const ch of lowered) {
    if (SLUG_MAP[ch]) out += SLUG_MAP[ch];
    else if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) out += ch;
    else if (ch === " " || ch === "_" || ch === "-") out += "_";
  }
  out = out.replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (!out) return "var";
  if (out[0] >= "0" && out[0] <= "9") out = `var_${out}`;
  return out;
}

export function buildMeasurementLabel(
  variables: FormulaVariable[],
  expression: string,
): string {
  if (!expression.trim()) return "";
  const labelByKey = new Map(variables.map((v) => [v.key.toLowerCase(), v.label]));
  return expression.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
    const label = labelByKey.get(match.toLowerCase());
    return label ? `(${label})` : match;
  });
}

// ─── Natural-language formula parsing ─────────────────────────────────────
// Lets users type formulas like "(consumo de água / área plantada) * 100"
// without declaring variables — any text run between operators (+ - * / ( ))
// that isn't purely numeric becomes a variable automatically.

// True symbol operators — always split the token stream.
const OPERATOR_CHARS = new Set(["+", "-", "*", "/", "(", ")", "×"]);

// A position counts as a boundary when it's the string edge, whitespace, or a
// symbol operator. Used to decide whether a literal "x"/"X" is multiplication.
function isFormulaBoundary(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch) || OPERATOR_CHARS.has(ch);
}

function isNumericLiteral(s: string): boolean {
  return /^\d+([.,]\d+)?$/.test(s.trim());
}

/**
 * Parses a natural-language formula text into structured variables + a
 * key-based expression suitable for evaluation.
 *
 * Example:
 *   "(consumo de água / área plantada) * 100"
 *   → variables: [
 *       { key: "consumo_de_agua", label: "consumo de água" },
 *       { key: "area_plantada", label: "área plantada" },
 *     ]
 *     expression: "(consumo_de_agua / area_plantada) * 100"
 *
 * Pure operators (+ - * / ( )) and numeric literals are kept verbatim.
 * "x" / "X" / "×" used between numbers/labels become "*".
 */
export function parseNaturalFormula(text: string): {
  variables: FormulaVariable[];
  expression: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { variables: [], expression: "" };

  // Tokenize: walk char-by-char, split at single-char operators and parens.
  // Multi-word labels stay together (spaces inside).
  const tokens: Array<{ type: "op" | "term"; value: string }> = [];
  let buf = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    // A literal "x"/"X" is multiplication ONLY when it stands alone between
    // boundaries (e.g. "a x 100"). Inside a word like "Custos Fixos" it stays
    // part of the label instead of splitting it into "Custos Fi" × "os".
    const isMultiplyLetter =
      (ch === "x" || ch === "X") &&
      isFormulaBoundary(trimmed[i - 1]) &&
      isFormulaBoundary(trimmed[i + 1]);
    if (OPERATOR_CHARS.has(ch) || isMultiplyLetter) {
      if (buf.trim()) tokens.push({ type: "term", value: buf.trim() });
      buf = "";
      // Normalize multiplication aliases to *
      const op = ch === "×" || ch === "x" || ch === "X" ? "*" : ch;
      tokens.push({ type: "op", value: op });
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) tokens.push({ type: "term", value: buf.trim() });

  // Build variables (dedupe by slugified key, preserve first-seen label)
  const variables: FormulaVariable[] = [];
  const seenKeys = new Map<string, string>(); // key → label
  for (const t of tokens) {
    if (t.type !== "term") continue;
    if (isNumericLiteral(t.value)) continue;
    const key = slugifyKey(t.value);
    if (!seenKeys.has(key)) {
      seenKeys.set(key, t.value);
      variables.push({ key, label: t.value });
    }
  }

  // Build expression replacing terms with keys (or keep numeric literals).
  // Spacing rules: binary ops get spaces around them; parens hug the term.
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "op") {
      if (t.value === "(" || t.value === ")") parts.push(t.value);
      else parts.push(` ${t.value} `);
    } else {
      parts.push(isNumericLiteral(t.value) ? t.value.replace(",", ".") : slugifyKey(t.value));
    }
  }
  const expression = parts.join("").replace(/\s+/g, " ").trim();

  return { variables, expression };
}

/**
 * Reverse of parseNaturalFormula — reconstructs a natural-language string
 * from variables + key-based expression. Used when re-opening an indicator
 * for editing.
 *
 * Unlike buildMeasurementLabel, this does NOT wrap labels in parentheses;
 * the result is meant to be re-editable by the user.
 */
export function formulaToNaturalText(
  variables: FormulaVariable[],
  expression: string,
): string {
  if (!expression.trim()) return "";
  const labelByKey = new Map(variables.map((v) => [v.key.toLowerCase(), v.label]));
  return expression.replace(/[a-zA-Z_][a-zA-Z0-9_]*/g, (match) => {
    return labelByKey.get(match.toLowerCase()) ?? match;
  });
}

// ─── Formula AST (for visual rendering) ───────────────────────────────────

export type FormulaAst =
  | { type: "num"; value: number }
  | { type: "var"; key: string; label: string }
  | { type: "op"; op: "+" | "-" | "*" | "/"; left: FormulaAst; right: FormulaAst };

/**
 * Parses an evaluator expression into a binary AST suitable for visual
 * rendering (fractions, inline operators with proper precedence).
 *
 * Returns null on parse error / empty input.
 *
 * Grammar (recursive descent, left-associative):
 *   expr   = term (('+' | '-') term)*
 *   term   = factor (('*' | '/') factor)*
 *   factor = '(' expr ')' | NUM | IDENT
 */
export function parseFormulaAst(
  expression: string,
  variables: FormulaVariable[],
): FormulaAst | null {
  const trimmed = expression.trim();
  if (!trimmed) return null;

  let tokens: Token[];
  try {
    tokens = tokenize(trimmed);
  } catch {
    return null;
  }
  if (tokens.length === 0) return null;

  const labelByKey = new Map(variables.map((v) => [v.key.toLowerCase(), v.label]));
  let pos = 0;

  function peek(): Token | undefined {
    return tokens[pos];
  }

  function consume(): Token {
    return tokens[pos++];
  }

  function parseExpr(): FormulaAst {
    let left = parseTerm();
    while (true) {
      const t = peek();
      if (!t || t.type !== "op" || (t.value !== "+" && t.value !== "-")) break;
      consume();
      const right = parseTerm();
      left = { type: "op", op: t.value, left, right };
    }
    return left;
  }

  function parseTerm(): FormulaAst {
    let left = parseFactor();
    while (true) {
      const t = peek();
      if (!t || t.type !== "op" || (t.value !== "*" && t.value !== "/")) break;
      consume();
      const right = parseFactor();
      left = { type: "op", op: t.value, left, right };
    }
    return left;
  }

  function parseFactor(): FormulaAst {
    const t = peek();
    if (!t) throw new Error("Unexpected end");
    if (t.type === "lparen") {
      consume();
      const inner = parseExpr();
      const close = peek();
      if (!close || close.type !== "rparen") throw new Error("Expected )");
      consume();
      return inner;
    }
    if (t.type === "num") {
      consume();
      return { type: "num", value: t.value };
    }
    if (t.type === "id") {
      consume();
      const label = labelByKey.get(t.value.toLowerCase()) ?? t.value;
      return { type: "var", key: t.value.toLowerCase(), label };
    }
    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }

  try {
    const ast = parseExpr();
    if (pos !== tokens.length) return null;
    return ast;
  } catch {
    return null;
  }
}

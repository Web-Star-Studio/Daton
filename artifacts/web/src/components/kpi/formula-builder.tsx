import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormulaPreview } from "@/components/kpi/formula-preview";
import { cn } from "@/lib/utils";
import {
  evaluateFormula,
  parseFormulaAst,
  parseNaturalFormula,
  validateFormula,
  type FormulaAst,
} from "@/lib/formula-evaluator";

interface FormulaBuilderProps {
  /** Natural-language formula text — e.g. "(consumo de água / área plantada) * 100" */
  value: string;
  onChange: (next: string) => void;
}

type Op = "+" | "-" | "*" | "/";

type Pill =
  | { kind: "term"; value: string }
  | { kind: "num"; value: string }
  | { kind: "group"; text: string }
  | { kind: "op"; op: Op };

const OPS_CYCLE: Op[] = ["+", "-", "*", "/"];
const OP_GLYPH: Record<Op, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const OP_PRECEDENCE: Record<Op, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

function isNumericString(s: string): boolean {
  return /^-?\d+([.,]\d+)?$/.test(s.trim());
}

function astToNaturalString(ast: FormulaAst, minPrec = 0): string {
  if (ast.type === "var") return ast.label;
  if (ast.type === "num") return String(ast.value);
  const prec = OP_PRECEDENCE[ast.op];
  const left = astToNaturalString(ast.left, prec);
  const rightMin = ast.op === "-" || ast.op === "/" ? prec + 1 : prec;
  const right = astToNaturalString(ast.right, rightMin);
  const inner = `${left} ${ast.op} ${right}`;
  return prec < minPrec ? `(${inner})` : inner;
}

function astToPills(ast: FormulaAst): Pill[] {
  if (ast.type === "var") return [{ kind: "term", value: ast.label }];
  if (ast.type === "num") return [{ kind: "num", value: String(ast.value) }];

  const prec = OP_PRECEDENCE[ast.op];

  let leftPills: Pill[];
  if (ast.left.type === "op" && OP_PRECEDENCE[ast.left.op] < prec) {
    leftPills = [{ kind: "group", text: astToNaturalString(ast.left) }];
  } else {
    leftPills = astToPills(ast.left);
  }

  let rightPills: Pill[];
  if (ast.right.type === "op") {
    const rp = OP_PRECEDENCE[ast.right.op];
    const needsGroup = rp < prec || (rp === prec && (ast.op === "-" || ast.op === "/"));
    rightPills = needsGroup
      ? [{ kind: "group", text: astToNaturalString(ast.right) }]
      : astToPills(ast.right);
  } else {
    rightPills = astToPills(ast.right);
  }

  return [...leftPills, { kind: "op", op: ast.op }, ...rightPills];
}

function parseToPills(text: string): Pill[] | null {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const { expression, variables } = parseNaturalFormula(text);
  if (!expression) return [];
  const ast = parseFormulaAst(expression, variables);
  if (!ast) return null;
  return astToPills(ast);
}

function stripOuterParensIfBalanced(s: string): string {
  let t = s.trim();
  while (t.startsWith("(") && t.endsWith(")")) {
    let depth = 0;
    let unwrappable = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") depth++;
      else if (t[i] === ")") {
        depth--;
        if (depth === 0 && i < t.length - 1) {
          unwrappable = false;
          break;
        }
      }
    }
    if (!unwrappable || depth !== 0) break;
    t = t.slice(1, -1).trim();
    if (!t) return t;
  }
  return t;
}

function classifyInput(raw: string): Pill | null {
  const stripped = stripOuterParensIfBalanced(raw);
  if (!stripped) return null;
  const hasOp = /[+\-*/]/.test(stripped);
  const hasParen = /[()]/.test(stripped);
  if (!hasOp && !hasParen) {
    if (isNumericString(stripped)) {
      return { kind: "num", value: stripped.replace(",", ".") };
    }
    return { kind: "term", value: stripped };
  }
  const { expression, variables } = parseNaturalFormula(stripped);
  if (!expression) return null;
  const validation = validateFormula(expression, variables);
  if (!validation.ok) return null;
  return { kind: "group", text: stripped };
}

function serializePills(pills: Pill[]): string {
  const cleaned = pills.filter((p) => {
    if (p.kind === "op") return true;
    if (p.kind === "group") return p.text.trim() !== "";
    return p.value.trim() !== "";
  });
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].kind === "op") cleaned.pop();
  while (cleaned.length > 0 && cleaned[0].kind === "op") cleaned.shift();
  return cleaned
    .map((p) => {
      if (p.kind === "op") return p.op;
      if (p.kind === "group") return `(${p.text.trim()})`;
      return p.value.trim();
    })
    .join(" ")
    .trim();
}

export function FormulaBuilder({ value, onChange }: FormulaBuilderProps) {
  const initialPills = useMemo(() => parseToPills(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<"visual" | "text">(initialPills === null ? "text" : "visual");
  const [pills, setPills] = useState<Pill[]>(initialPills ?? []);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [previewInputs, setPreviewInputs] = useState<Record<string, string>>({});

  const lastSerializedRef = useRef(value);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (value === lastSerializedRef.current) return;
    lastSerializedRef.current = value;
    const parsed = parseToPills(value);
    if (parsed === null) {
      setMode("text");
    } else {
      setPills(parsed);
    }
    setEditingIndex(null);
  }, [value]);

  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIndex]);

  const parsed = useMemo(() => parseNaturalFormula(value), [value]);
  const validation = useMemo(
    () => validateFormula(parsed.expression, parsed.variables),
    [parsed],
  );

  const parsedPreviewInputs = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const v of parsed.variables) {
      const raw = previewInputs[v.key]?.trim().replace(",", ".");
      if (!raw) out[v.key] = null;
      else {
        const n = Number(raw);
        out[v.key] = Number.isNaN(n) ? null : n;
      }
    }
    return out;
  }, [parsed.variables, previewInputs]);

  const previewResult = useMemo(() => {
    if (!validation.ok) return null;
    return evaluateFormula(parsed.expression, parsedPreviewInputs);
  }, [parsed.expression, parsedPreviewInputs, validation]);

  function applyPills(next: Pill[]) {
    setPills(next);
    const text = serializePills(next);
    lastSerializedRef.current = text;
    onChange(text);
  }

  function startEditing(index: number) {
    const p = pills[index];
    if (!p || p.kind === "op") return;
    setEditingIndex(index);
    setEditingValue(p.kind === "group" ? p.text : p.value);
  }

  function commitEdit() {
    if (editingIndex === null) return;
    const classified = classifyInput(editingValue);
    if (classified === null) {
      // Texto inválido (ex.: grupo com sintaxe quebrada): mantém o conteúdo
      // anterior da pill em vez de apagar o que o usuário tinha — só remove
      // quando a pill é nova/vazia.
      const current = pills[editingIndex];
      const hadContent =
        current &&
        current.kind !== "op" &&
        (current.kind === "group" ? current.text.trim() !== "" : current.value.trim() !== "");
      if (!hadContent) removeAt(editingIndex);
      setEditingIndex(null);
      return;
    }
    const next = [...pills];
    next[editingIndex] = classified;
    setEditingIndex(null);
    applyPills(next);
  }

  function cancelEdit() {
    if (editingIndex === null) return;
    const current = pills[editingIndex];
    if (current && current.kind !== "op") {
      const isEmpty =
        current.kind === "group" ? current.text === "" : current.value === "";
      if (isEmpty) {
        removeAt(editingIndex);
        setEditingIndex(null);
        return;
      }
    }
    setEditingIndex(null);
  }

  function cycleOp(index: number) {
    const p = pills[index];
    if (!p || p.kind !== "op") return;
    const i = OPS_CYCLE.indexOf(p.op);
    const nextOp = OPS_CYCLE[(i + 1) % OPS_CYCLE.length];
    const next = [...pills];
    next[index] = { kind: "op", op: nextOp };
    applyPills(next);
  }

  function removeAt(index: number) {
    const p = pills[index];
    if (!p) return;
    const next = [...pills];
    if (p.kind === "op") {
      next.splice(index, 1);
    } else if (index > 0 && pills[index - 1].kind === "op") {
      next.splice(index - 1, 2);
    } else if (index + 1 < pills.length && pills[index + 1].kind === "op") {
      next.splice(index, 2);
    } else {
      next.splice(index, 1);
    }
    applyPills(next);
  }

  function appendNewPill(kind: "term" | "group") {
    const next = [...pills];
    if (next.length > 0 && next[next.length - 1].kind !== "op") {
      next.push({ kind: "op", op: "+" });
    }
    next.push(kind === "group" ? { kind: "group", text: "" } : { kind: "term", value: "" });
    setPills(next);
    setEditingIndex(next.length - 1);
    setEditingValue("");
  }

  function switchToText() {
    setEditingIndex(null);
    setMode("text");
  }

  function switchToVisual() {
    const parsedPills = parseToPills(value);
    if (parsedPills === null) return;
    setPills(parsedPills);
    setMode("visual");
  }

  const canSwitchToVisual = mode === "text" && parseToPills(value) !== null;

  return (
    <div className="space-y-3">
      {mode === "visual" ? (
        <div>
          <div className="min-h-[3rem] rounded-md border border-input bg-background p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {pills.length === 0 && editingIndex === null ? (
                <span className="self-center px-1 text-xs text-muted-foreground">
                  Adicione variáveis, números ou um grupo (sub-fórmula entre parênteses).
                </span>
              ) : null}
              {pills.map((p, i) => {
                const isEditing = editingIndex === i;
                if (p.kind === "op") {
                  return (
                    <button
                      key={`op-${i}`}
                      type="button"
                      onClick={() => cycleOp(i)}
                      title="Clique para alternar operador"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card font-mono text-sm transition-colors hover:bg-accent"
                    >
                      {OP_GLYPH[p.op]}
                    </button>
                  );
                }
                if (isEditing) {
                  const isWide = /[+\-*/()]/.test(editingValue);
                  return (
                    <Input
                      key={`edit-${i}`}
                      ref={editInputRef}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitEdit();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      onBlur={commitEdit}
                      placeholder="ex: agua, 100, ou (a + b)"
                      className={cn("h-7 text-xs", isWide ? "w-[280px]" : "w-[180px]")}
                    />
                  );
                }
                if (p.kind === "group") {
                  return (
                    <div
                      key={`pill-${i}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => startEditing(i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          startEditing(i);
                        } else if (e.key === "Backspace" || e.key === "Delete") {
                          e.preventDefault();
                          removeAt(i);
                        }
                      }}
                      className="group inline-flex cursor-pointer items-center gap-1 rounded-md border border-amber-400/50 bg-amber-50 px-2 py-1 text-xs text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200"
                    >
                      <span className="font-mono text-amber-600 dark:text-amber-300/80">(</span>
                      <span className="max-w-[260px] truncate font-mono">{p.text}</span>
                      <span className="font-mono text-amber-600 dark:text-amber-300/80">)</span>
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeAt(i);
                        }}
                        aria-label="Remover"
                        className="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <X className="h-3 w-3 opacity-60 hover:opacity-100" />
                      </button>
                    </div>
                  );
                }
                const isNum = p.kind === "num";
                return (
                  <div
                    key={`pill-${i}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => startEditing(i)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        startEditing(i);
                      } else if (e.key === "Backspace" || e.key === "Delete") {
                        e.preventDefault();
                        removeAt(i);
                      }
                    }}
                    className={cn(
                      "group inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isNum
                        ? "border border-border bg-card font-mono text-foreground hover:border-primary/50"
                        : "border border-primary/40 bg-primary/15 text-primary hover:bg-primary/25 dark:bg-primary/25",
                    )}
                  >
                    <span className="max-w-[180px] truncate">{p.value}</span>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAt(i);
                      }}
                      aria-label="Remover"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3 opacity-60 hover:opacity-100" />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => appendNewPill("term")}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                termo
              </button>
              <button
                type="button"
                onClick={() => appendNewPill("group")}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-400/60 px-2 py-1 text-xs text-amber-700 transition-colors hover:border-amber-500 hover:bg-amber-50/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
              >
                <Plus className="h-3 w-3" />
                grupo
              </button>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Clique numa pill para renomear/editar, no operador para alternar (+ − × ÷). Use{" "}
              <span className="text-amber-700 dark:text-amber-300">grupo</span> pra parênteses (
              <span className="font-mono">a + b</span> dentro do grupo, depois{" "}
              <span className="font-mono">×</span> fora).
            </span>
            <button
              type="button"
              onClick={switchToText}
              className="ml-2 shrink-0 underline underline-offset-2 hover:text-foreground"
            >
              modo texto
            </button>
          </div>
        </div>
      ) : (
        <div>
          <Textarea
            value={value}
            onChange={(e) => {
              lastSerializedRef.current = e.target.value;
              onChange(e.target.value);
            }}
            placeholder="Ex: (consumo de água / área plantada) * 100"
            rows={2}
            className="font-mono text-sm"
          />
          <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Notação matemática. Use parênteses para mudar a precedência.</span>
            <button
              type="button"
              onClick={switchToVisual}
              disabled={!canSwitchToVisual}
              title={
                canSwitchToVisual
                  ? "Alternar para modo visual"
                  : "Corrija a sintaxe da fórmula antes de alternar para visual"
              }
              className="underline underline-offset-2 hover:text-foreground disabled:no-underline disabled:opacity-40"
            >
              modo visual
            </button>
          </div>
        </div>
      )}

      {!validation.ok && value.trim() && (
        <p className="text-xs text-red-600 dark:text-red-400">{validation.error}</p>
      )}

      {parsed.expression && validation.ok && (
        <div className="rounded-md border border-border bg-card p-4">
          <Label className="text-xs font-semibold uppercase text-muted-foreground mb-3 block">
            Como será calculado
          </Label>
          <FormulaPreview
            expression={parsed.expression}
            variables={parsed.variables}
            inputs={parsedPreviewInputs}
          />
        </div>
      )}

      {parsed.variables.length > 0 && validation.ok && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
          <div>
            <Label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">
              Testar com valores
            </Label>
            <div className="space-y-1.5">
              {parsed.variables.map((v) => (
                <div key={v.key} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-1/2 truncate">{v.label}</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={previewInputs[v.key] ?? ""}
                    onChange={(e) => setPreviewInputs((p) => ({ ...p, [v.key]: e.target.value }))}
                    placeholder="0"
                    className="flex-1 h-7 text-sm"
                  />
                </div>
              ))}
              <div
                className={cn(
                  "mt-2 rounded-md border px-3 py-1.5 text-sm",
                  previewResult !== null
                    ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-border bg-muted/40",
                )}
              >
                <span className="text-xs text-muted-foreground">Resultado:</span>{" "}
                <span className="font-mono font-semibold">
                  {previewResult !== null
                    ? previewResult.toLocaleString("pt-BR", { maximumFractionDigits: 4 })
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

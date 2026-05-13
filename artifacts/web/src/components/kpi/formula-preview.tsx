import { cn } from "@/lib/utils";
import {
  parseFormulaAst,
  type FormulaAst,
  type FormulaVariable,
} from "@/lib/formula-evaluator";

interface FormulaPreviewProps {
  expression: string;
  variables: FormulaVariable[];
  /** Sizing variant for the chips/text. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Renders a math-style preview of a formula:
 * - Divisions become stacked fractions (numerator / denominator with a horizontal bar)
 * - Multiplication shows as ×, subtraction as −
 * - Parens are added only when needed for precedence
 *
 * Falls back gracefully: returns null when the expression cannot be parsed.
 */
export function FormulaPreview({
  expression,
  variables,
  size = "md",
  className,
}: FormulaPreviewProps) {
  const ast = parseFormulaAst(expression, variables);
  if (!ast) return null;

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <FormulaNode node={ast} size={size} parentOp={null} side="root" />
    </div>
  );
}

type InlineOp = "+" | "-" | "*";

interface NodeProps {
  node: FormulaAst;
  size: "sm" | "md";
  parentOp: InlineOp | "/" | null;
  side: "left" | "right" | "root" | "num" | "den";
}

function precedence(op: "+" | "-" | "*" | "/"): number {
  if (op === "+" || op === "-") return 1;
  return 2;
}

function needsParens(node: FormulaAst, props: NodeProps): boolean {
  if (node.type !== "op") return false;

  // Fractions are visually self-contained — never wrap a `/` in parens.
  if (node.op === "/") return false;

  // Numerator/denominator of a fraction don't need parens (the fraction bar groups them).
  if (props.side === "num" || props.side === "den") return false;

  // Root never needs parens.
  if (props.side === "root") return false;

  // Parent is `/` — children rendered as numerator/denominator, but we already
  // handled that via side=num/den. If somehow parent=`/` but side=left/right,
  // treat conservatively.
  if (props.parentOp === "/") return false;

  const parentP = precedence(props.parentOp as "+" | "-" | "*");
  const childP = precedence(node.op);

  if (childP < parentP) return true;
  if (childP === parentP) {
    // Equal precedence: right side of `-` or `*` may need parens if child is non-commutative
    if (props.side === "right" && (props.parentOp === "-" || props.parentOp === "*")) {
      // a - (b - c)  needs parens; a * (b * c) doesn't need parens but harmless
      if (props.parentOp === "-" && node.op === "-") return true;
    }
  }
  return false;
}

function FormulaNode({ node, size, parentOp, side }: NodeProps) {
  const wrap = needsParens(node, { node, size, parentOp, side });

  if (node.type === "num") {
    return <NumLiteral value={node.value} size={size} />;
  }
  if (node.type === "var") {
    return <VarChip label={node.label} size={size} />;
  }

  // op
  if (node.op === "/") {
    return (
      <Fraction
        numerator={<FormulaNode node={node.left} size={size} parentOp="/" side="num" />}
        denominator={<FormulaNode node={node.right} size={size} parentOp="/" side="den" />}
      />
    );
  }

  const symbol = node.op === "*" ? "×" : node.op === "-" ? "−" : "+";
  const content = (
    <span className={cn("inline-flex items-center", size === "sm" ? "gap-1.5" : "gap-2")}>
      <FormulaNode node={node.left} size={size} parentOp={node.op} side="left" />
      <span className={cn("text-muted-foreground", size === "sm" ? "text-sm" : "text-base")}>{symbol}</span>
      <FormulaNode node={node.right} size={size} parentOp={node.op} side="right" />
    </span>
  );

  if (wrap) {
    return (
      <span className={cn("inline-flex items-center", size === "sm" ? "gap-0.5" : "gap-1")}>
        <span className={cn("text-muted-foreground/70", size === "sm" ? "text-base" : "text-lg")}>(</span>
        {content}
        <span className={cn("text-muted-foreground/70", size === "sm" ? "text-base" : "text-lg")}>)</span>
      </span>
    );
  }
  return content;
}

function Fraction({ numerator, denominator }: { numerator: React.ReactNode; denominator: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col items-center align-middle px-1">
      <span className="flex items-center justify-center pb-0.5">{numerator}</span>
      <span className="block w-full border-t border-foreground/70" />
      <span className="flex items-center justify-center pt-0.5">{denominator}</span>
    </span>
  );
}

function VarChip({ label, size }: { label: string; size: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-primary/30 bg-primary/10 font-medium text-primary",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-0.5 text-sm",
      )}
    >
      {label}
    </span>
  );
}

function NumLiteral({ value, size }: { value: number; size: "sm" | "md" }) {
  return (
    <span className={cn("font-mono text-foreground", size === "sm" ? "text-sm" : "text-base")}>
      {value.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
    </span>
  );
}

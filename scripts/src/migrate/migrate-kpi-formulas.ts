/**
 * Migrate existing kpi_indicators.measurement (free-text) into structured
 * formulaVariables + formulaExpression.
 *
 * Heuristics:
 *  1. "A / B * 100" or "(A / B) * 100"  →  variables [num, den], expr `num / den * 100`
 *  2. "A * 100 / B"                     →  variables [num, den], expr `num * 100 / den`
 *  3. "A / B"                           →  variables [num, den], expr `num / den`
 *  4. "A * 100"                         →  1 variable, expr `var * 100`
 *  5. Anything else                     →  1 variable "valor" with label = measurement, expr `valor`
 *
 * Usage:
 *   pnpm --filter @workspace/scripts migrate-kpi-formulas
 *   pnpm --filter @workspace/scripts migrate-kpi-formulas --dry-run
 */
import { db, kpiIndicatorsTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

type Parsed = {
  variables: { key: string; label: string }[];
  expression: string;
  matched: "div_x100_paren" | "div_x100" | "x100_div" | "div" | "x100" | "fallback";
};

const SLUG_MAP: Record<string, string> = {
  á: "a", à: "a", ã: "a", â: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", õ: "o", ô: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

function slugify(label: string): string {
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

function trim(s: string): string {
  return s.trim().replace(/^[(\s]+|[)\s.]+$/g, "").trim();
}

function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 1;
  while (taken.has(`${base}_${n}`)) n++;
  const key = `${base}_${n}`;
  taken.add(key);
  return key;
}

function parseMeasurement(measurement: string): Parsed {
  const m = measurement.trim();
  const taken = new Set<string>();

  // Pattern 1: (A / B) * 100  or  A / B * 100  (anywhere with the structure num/den followed by *100)
  const p1 = m.match(/^\s*\(?\s*(.+?)\s*\/\s*(.+?)\s*\)?\s*[*xX×]\s*100\s*\.?\s*$/);
  if (p1) {
    const labelNum = trim(p1[1]);
    const labelDen = trim(p1[2]);
    if (labelNum && labelDen) {
      const k1 = uniqueKey(slugify(labelNum), taken);
      const k2 = uniqueKey(slugify(labelDen), taken);
      return {
        variables: [
          { key: k1, label: labelNum },
          { key: k2, label: labelDen },
        ],
        expression: `(${k1} / ${k2}) * 100`,
        matched: "div_x100_paren",
      };
    }
  }

  // Pattern 2: A * 100 / B
  const p2 = m.match(/^\s*(.+?)\s*[*xX×]\s*100\s*\/\s*(.+?)\s*\.?\s*$/);
  if (p2) {
    const labelNum = trim(p2[1]);
    const labelDen = trim(p2[2]);
    if (labelNum && labelDen) {
      const k1 = uniqueKey(slugify(labelNum), taken);
      const k2 = uniqueKey(slugify(labelDen), taken);
      return {
        variables: [
          { key: k1, label: labelNum },
          { key: k2, label: labelDen },
        ],
        expression: `(${k1} * 100) / ${k2}`,
        matched: "x100_div",
      };
    }
  }

  // Pattern 3: A / B
  const p3 = m.match(/^\s*(.+?)\s*\/\s*(.+?)\s*\.?\s*$/);
  if (p3) {
    const labelNum = trim(p3[1]);
    const labelDen = trim(p3[2]);
    // Avoid catching pattern 1/2 leftovers (they would have *100; already handled above)
    if (labelNum && labelDen && !/[*xX×]\s*100/.test(m)) {
      const k1 = uniqueKey(slugify(labelNum), taken);
      const k2 = uniqueKey(slugify(labelDen), taken);
      return {
        variables: [
          { key: k1, label: labelNum },
          { key: k2, label: labelDen },
        ],
        expression: `${k1} / ${k2}`,
        matched: "div",
      };
    }
  }

  // Pattern 4: A * 100
  const p4 = m.match(/^\s*(.+?)\s*[*xX×]\s*100\s*\.?\s*$/);
  if (p4) {
    const label = trim(p4[1]);
    if (label) {
      const k = uniqueKey(slugify(label), taken);
      return {
        variables: [{ key: k, label }],
        expression: `${k} * 100`,
        matched: "x100",
      };
    }
  }

  // Fallback: single variable with full measurement as label
  return {
    variables: [{ key: "valor", label: measurement.trim() || "Valor" }],
    expression: "valor",
    matched: "fallback",
  };
}

async function main() {
  console.log(`KPI formula migration ${dryRun ? "(DRY RUN)" : ""}`);

  const indicators = await db.select().from(kpiIndicatorsTable);
  console.log(`Found ${indicators.length} indicators total.`);

  const pending = indicators.filter(
    (ind) =>
      !ind.formulaVariables ||
      ind.formulaVariables.length === 0 ||
      !ind.formulaExpression ||
      ind.formulaExpression.trim().length === 0,
  );
  console.log(`${pending.length} need migration.`);

  const counts: Record<Parsed["matched"], number> = {
    div_x100_paren: 0,
    div_x100: 0,
    x100_div: 0,
    div: 0,
    x100: 0,
    fallback: 0,
  };

  for (const ind of pending) {
    const parsed = parseMeasurement(ind.measurement);
    counts[parsed.matched]++;

    console.log(
      `  [${parsed.matched.padEnd(16)}] #${ind.id} "${ind.measurement.slice(0, 60)}${ind.measurement.length > 60 ? "…" : ""}"`,
    );
    if (parsed.matched === "fallback") {
      console.log(`    → fallback: single var "valor" (cliente precisa reconfigurar)`);
    } else {
      console.log(`    → expr: ${parsed.expression}`);
      console.log(`    → vars: ${parsed.variables.map((v) => `${v.key}="${v.label}"`).join(", ")}`);
    }

    if (!dryRun) {
      await db
        .update(kpiIndicatorsTable)
        .set({
          formulaVariables: parsed.variables,
          formulaExpression: parsed.expression,
        })
        .where(eq(kpiIndicatorsTable.id, ind.id));
    }
  }

  console.log("\nSummary:");
  for (const [k, v] of Object.entries(counts)) {
    if (v > 0) console.log(`  ${k.padEnd(16)} ${v}`);
  }
  console.log(`\n${dryRun ? "[DRY RUN] No changes applied." : "Done."}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });

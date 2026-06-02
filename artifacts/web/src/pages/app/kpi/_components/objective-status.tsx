import { useMemo } from "react";
import {
  Cog,
  DollarSign,
  GraduationCap,
  Leaf,
  ShieldCheck,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiIndicator, KpiObjective, KpiYearRow } from "@/lib/kpi-client";
import { getIndicatorStatus } from "./indicator-card";

type ObjectiveStatusProps = {
  objectives: KpiObjective[];
  indicators: KpiIndicator[];
  yearRows: KpiYearRow[];
  /**
   * Clique no card → abre a aba Indicadores filtrada por aquele objetivo.
   * `null` = card "Sem objetivo" (indicadores não vinculados).
   */
  onSelectObjective?: (objectiveId: number | null) => void;
};

type ObjectiveAggregate = {
  /** `null` identifica o card agregador "Sem objetivo". */
  id: number | null;
  code: string | null;
  name: string;
  indicatorNames: string[];
  total: number;
  green: number;
  yellow: number;
  red: number;
  nodata: number;
};

/**
 * Ícone + cor por tema do objetivo, inferidos de palavras-chave no nome/código.
 * Puramente cosmético — cai no ícone neutro (Target) quando nada casa, então
 * nunca quebra com objetivos de nomenclatura inesperada.
 */
type ObjectiveTheme = { icon: LucideIcon; tint: string };

const OBJECTIVE_THEMES: { match: RegExp; theme: ObjectiveTheme }[] = [
  {
    match: /receit|faturament|financ|custo|lucro|margem|rentab|caixa/i,
    theme: {
      icon: DollarSign,
      tint: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
  },
  {
    match: /efici|operacion|process|produtiv|estoque|avaria|log[íi]st/i,
    theme: {
      icon: Cog,
      tint: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    },
  },
  {
    match: /lideran|equipe|pessoa|gente|clima|engajament|turnover/i,
    theme: {
      icon: Users,
      tint: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    },
  },
  {
    match: /compet[êe]nc|trein|capacit|aprendiz|qualific|desenvolv/i,
    theme: {
      icon: GraduationCap,
      tint: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
    },
  },
  {
    match: /sa[úu]de|seguran|sst|vi[áa]ri|acident|afastament|ergonom|v[íi]tim/i,
    theme: {
      icon: ShieldCheck,
      tint: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    },
  },
  {
    match: /ambient|emiss|gee|co2|sustent|res[íi]du|energi|carbon|opacidad/i,
    theme: {
      icon: Leaf,
      tint: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300",
    },
  },
];

const NEUTRAL_THEME: ObjectiveTheme = {
  icon: Target,
  tint: "bg-muted text-muted-foreground",
};

function objectiveTheme(name: string, code: string | null): ObjectiveTheme {
  const hay = `${code ?? ""} ${name}`;
  for (const { match, theme } of OBJECTIVE_THEMES) {
    if (match.test(hay)) return theme;
  }
  return NEUTRAL_THEME;
}

/**
 * Tom da barra de progresso. Mesma régua do "Status por unidade": % na
 * tolerância (verde) sobre o total de indicadores do objetivo. Quando tudo
 * está sem dados (measured===0) usa tom neutro — uma barra vermelha em 0%
 * seria enganosa (não é mau desempenho, é falta de lançamento).
 */
function progressTone(green: number, total: number, measured: number) {
  if (total === 0 || measured === 0) {
    return { pct: 0, bar: "bg-muted-foreground/25", neutral: true as const };
  }
  const pct = Math.round((green / total) * 100);
  if (pct >= 70) return { pct, bar: "bg-emerald-500", neutral: false as const };
  if (pct >= 40) return { pct, bar: "bg-amber-500", neutral: false as const };
  return { pct, bar: "bg-red-500", neutral: false as const };
}

/** Chips de indicador mostrados antes de colapsar em "+N". */
const MAX_CHIPS = 4;

export function ObjectiveStatus({
  objectives,
  indicators,
  yearRows,
  onSelectObjective,
}: ObjectiveStatusProps) {
  const cards = useMemo(() => {
    const make = (
      id: number | null,
      code: string | null,
      name: string,
    ): ObjectiveAggregate => ({
      id,
      code,
      name,
      indicatorNames: [],
      total: 0,
      green: 0,
      yellow: 0,
      red: 0,
      nodata: 0,
    });

    // Pré-popula na ordem da API para que objetivos sem indicador vinculado
    // também apareçam (cobertura estratégica visível p/ auditoria ISO).
    const byObj = new Map<number, ObjectiveAggregate>();
    for (const obj of objectives) {
      byObj.set(obj.id, make(obj.id, obj.code ?? null, obj.name));
    }
    const semObj = make(null, null, "Sem objetivo");

    for (const ind of indicators) {
      const row = yearRows.find((r) => r.indicator.id === ind.id);
      const objId = row?.yearConfig?.objectiveId ?? null;
      let agg: ObjectiveAggregate;
      if (objId == null) {
        agg = semObj;
      } else {
        const existing = byObj.get(objId);
        if (existing) {
          agg = existing;
        } else {
          // Objetivo vinculado mas ausente da lista (transitório enquanto a
          // query de objetivos carrega) — usa o objeto embutido na row.
          agg = make(
            objId,
            row?.objective?.code ?? null,
            row?.objective?.name ?? `Objetivo ${objId}`,
          );
          byObj.set(objId, agg);
        }
      }
      agg.total += 1;
      agg.indicatorNames.push(ind.name);
      const status = getIndicatorStatus(ind, row);
      if (status === "green") agg.green += 1;
      else if (status === "yellow") agg.yellow += 1;
      else if (status === "red") agg.red += 1;
      else agg.nodata += 1;
    }

    // Objetivos que têm ao menos um indicador no ANO inteiro — calculado sobre
    // yearRows (conjunto completo), não sobre `indicators`, que o dashboard pode
    // ter estreitado por um tile de status/feed.
    const coveredObjIds = new Set<number>();
    for (const r of yearRows) {
      const objId = r.yearConfig?.objectiveId ?? null;
      if (objId != null) coveredObjIds.add(objId);
    }

    // Mantém o card quando: tem indicador no subconjunto atual (total>0) OU é
    // uma lacuna real de cobertura (nenhum indicador no ano — útil p/ auditoria
    // ISO). Descarta "fantasmas": objetivos cujos indicadores existem mas foram
    // escondidos por um tile ativo — alinhando com FilialStatus/CategorySemaphore.
    const list = [...byObj.values()].filter(
      (c) => c.total > 0 || c.id == null || !coveredObjIds.has(c.id),
    );
    if (semObj.total > 0) list.push(semObj);
    return list;
  }, [objectives, indicators, yearRows]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Objetivos estratégicos
        </h3>
        <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      {cards.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Cadastre objetivos em Indicadores → Objetivos e vincule indicadores
          para acompanhar o progresso por objetivo aqui.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <ObjectiveCard
              key={c.id ?? "sem-objetivo"}
              agg={c}
              onSelect={onSelectObjective}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ObjectiveCard({
  agg,
  onSelect,
}: {
  agg: ObjectiveAggregate;
  onSelect?: (objectiveId: number | null) => void;
}) {
  const isSemObjetivo = agg.id === null;
  const measured = agg.green + agg.yellow + agg.red;
  const t = progressTone(agg.green, agg.total, measured);
  const theme = isSemObjetivo
    ? NEUTRAL_THEME
    : objectiveTheme(agg.name, agg.code);
  const Icon = theme.icon;
  const visibleChips = agg.indicatorNames.slice(0, MAX_CHIPS);
  const extraChips = Math.max(0, agg.indicatorNames.length - MAX_CHIPS);
  // aria-label de um <button> SOBRESCREVE o texto interno no leitor de tela —
  // então dobramos as contagens aqui pra AT ouvir o mesmo que o usuário vê.
  const a11yLabel =
    `${agg.name}: ${agg.green} na tolerância, ${agg.yellow} em atenção, ` +
    `${agg.red} fora da tolerância, ${agg.nodata} sem dados. Ver indicadores.`;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(agg.id)}
      disabled={!onSelect}
      aria-label={a11yLabel}
      className={cn(
        "group flex h-full flex-col rounded-lg border bg-card p-3.5 text-left shadow-xs transition-all",
        // Afordância de card clicável: cursor + leve elevação/sombra/borda no hover.
        "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        "disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:shadow-xs",
        isSemObjetivo && "border-dashed",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            theme.tint,
          )}
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h4
            title={agg.name}
            className="text-sm font-semibold leading-snug text-foreground line-clamp-2"
          >
            {agg.name}
          </h4>
          {agg.code ? (
            <span className="mt-0.5 inline-block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {agg.code}
            </span>
          ) : isSemObjetivo ? (
            <span className="mt-0.5 inline-block text-[11px] text-muted-foreground">
              Indicadores não vinculados
            </span>
          ) : null}
        </div>
      </div>

      {/* Progresso (% na tolerância sobre o total de indicadores do objetivo) */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", t.bar)}
          // Piso de 4% só quando há algum verde, pra a barra não sumir; sem
          // verde fica vazia (um sliver vermelho a 0% verde seria enganoso).
          style={{ width: `${agg.green > 0 ? Math.max(t.pct, 4) : 0}%` }}
          aria-hidden
        />
      </div>

      {/* Contagem de status */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
        <StatusCount dot="bg-emerald-500" n={agg.green} label="ok" />
        <StatusCount dot="bg-amber-500" n={agg.yellow} label="aten." />
        <StatusCount dot="bg-red-500" n={agg.red} label="fora" />
        <StatusCount dot="bg-muted-foreground/40" n={agg.nodata} label="s/d" />
      </div>

      {/* Indicadores vinculados */}
      {visibleChips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1 border-t pt-2.5">
          {visibleChips.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="max-w-[140px] truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/70"
              title={name}
            >
              {name}
            </span>
          ))}
          {extraChips > 0 ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              +{extraChips}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 border-t pt-2.5 text-[11px] italic text-muted-foreground/70">
          Nenhum indicador vinculado
        </p>
      )}
    </button>
  );
}

function StatusCount({
  dot,
  n,
  label,
}: {
  dot: string;
  n: number;
  label: string;
}) {
  return (
    <span className={cn("flex items-center gap-1", n === 0 && "opacity-45")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
      <span className="tabular-nums">
        {n} {label}
      </span>
    </span>
  );
}

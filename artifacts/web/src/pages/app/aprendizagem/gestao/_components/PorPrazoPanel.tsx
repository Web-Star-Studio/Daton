import { cn } from "@/lib/utils";
import type { CardStatusFilter } from "./MetricCards";

/** Item já resolvido para exibição numa coluna do painel "Por prazo". */
export type PrazoItem = { id: number; primary: string; meta: string };

type Bucket = { total: number; items: PrazoItem[] };

function Column({
  title,
  tone,
  bucket,
  cta,
  onCta,
  emptyLabel,
}: {
  title: string;
  tone: string;
  bucket: Bucket;
  cta: string;
  onCta: () => void;
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div
        className={cn(
          "mb-2.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide",
          tone,
        )}
      >
        {title}
        <span className="rounded-full bg-current/10 px-2 py-0.5 tabular-nums">
          {bucket.total}
        </span>
      </div>
      {bucket.items.length === 0 ? (
        <p className="px-1 py-4 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-1.5">
          {bucket.items.map((it) => (
            <div key={it.id} className="rounded-lg border bg-background px-3 py-2">
              <div className="text-xs font-medium">{it.primary}</div>
              <div className="text-[11px] text-muted-foreground">{it.meta}</div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onCta}
        className="mt-2 w-full rounded-md border px-3 py-1.5 text-[11px] font-medium hover:bg-muted"
      >
        {cta}
      </button>
    </div>
  );
}

/** Painel "Por prazo": 3 colunas (Vencidos / A vencer em 30 dias / Pendentes
 *  sem turma). Apresentacional — recebe listas já resolvidas e totais; quem
 *  monta os `PrazoItem` e os totais (a partir de `stats`/queries) é a página. */
export function PorPrazoPanel({
  vencidos,
  aVencer,
  pendentesSemTurma,
  onSeeAll,
  onCreateClass,
}: {
  vencidos: Bucket;
  aVencer: Bucket;
  pendentesSemTurma: Bucket;
  onSeeAll: (f: CardStatusFilter) => void;
  onCreateClass: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Column
        title="Vencidos"
        tone="text-red-700"
        bucket={vencidos}
        cta="Ver todos vencidos →"
        onCta={() => onSeeAll("vencido")}
        emptyLabel="Nenhum treinamento vencido."
      />
      <Column
        title="A vencer em 30 dias"
        tone="text-amber-700"
        bucket={aVencer}
        cta="Ver todos →"
        onCta={() => onSeeAll("a_vencer")}
        emptyLabel="Nenhum treinamento a vencer nos próximos 30 dias."
      />
      <Column
        title="Pendentes sem turma"
        tone="text-blue-700"
        bucket={pendentesSemTurma}
        cta="Criar turma →"
        onCta={onCreateClass}
        emptyLabel="Nenhum treinamento pendente sem turma."
      />
    </div>
  );
}

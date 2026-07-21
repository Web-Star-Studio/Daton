import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SearchableMultiCreateSelect } from "@/components/ui/searchable-multi-create-select";
import { COMPETENCY_TYPE_LABELS, findBankItemByName } from "../cargos-utils";

/**
 * Taxonomia CHA (conhecimento/habilidade/atitude) — só aparece como escolha do
 * usuário quando o lote inclui competências NOVAS (a criar no catálogo). O tipo
 * é atributo da competência, não do vínculo: competências já existentes mantêm
 * o tipo do catálogo (o servidor o realinha de qualquer forma — ver
 * fix(aprendizagem): tipo do requisito vem do catálogo).
 */
export const CHA_TYPE_OPTIONS = [
  "conhecimento",
  "habilidade",
  "atitude",
] as const;

const LEVEL_OPTIONS = [
  { value: 1, label: "Básico" },
  { value: 3, label: "Intermediário" },
  { value: 5, label: "Avançado" },
];

export type CompetencyBankOption = {
  name: string;
  competencyType?: string | null;
};

export type VincularCompetenciaFormValue = {
  /** Competências escolhidas no lote (grafia exata; existentes + novas). */
  competencyNames: string[];
  /** Tipo CHA aplicado às competências NOVAS do lote (as existentes usam o catálogo). */
  newCompetencyType: string;
  /** Nível requerido aplicado a todo o lote (ajustável por linha depois). */
  requiredLevel: number;
};

/**
 * Formulário de vínculo de competências a um cargo — apresentacional (sem
 * hooks de dados). Permite selecionar VÁRIAS competências de uma vez, para
 * agilizar. O nível é único para o lote (pode ser ajustado por competência
 * depois). O "Tipo" NÃO é atributo do vínculo: só aparece (lista CHA) quando o
 * lote inclui competências novas a criar no catálogo — e vale para todas elas.
 */
export function VincularCompetenciaForm({
  bankItems,
  linkedNames = [],
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  bankItems: CompetencyBankOption[];
  /** Competências já vinculadas ao cargo — ocultas do seletor (não relinkáveis). */
  linkedNames?: string[];
  value: VincularCompetenciaFormValue;
  onChange: (value: VincularCompetenciaFormValue) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitting?: boolean;
}) {
  // Nomes selecionados que ainda não existem no catálogo → serão criados com o
  // tipo CHA escolhido abaixo.
  const newNames = value.competencyNames.filter(
    (n) => !findBankItemByName(bankItems, n),
  );
  const hasNew = newNames.length > 0;
  const count = value.competencyNames.length;

  // Já vinculadas ficam fora do seletor (vincular a mesma duas vezes é 400).
  const linkedKeys = new Set(linkedNames.map((n) => n.trim().toLowerCase()));
  const bankOptions = bankItems
    .filter((i) => !linkedKeys.has(i.name.trim().toLowerCase()))
    .map((i) => ({ value: i.name, label: i.name }));

  const handleSelectionChange = (names: string[]) => {
    onChange({
      ...value,
      competencyNames: names,
      // Garante um tipo CHA válido pré-selecionado quando surge competência nova
      // (preserva a escolha anterior, se já era válida).
      newCompetencyType: (CHA_TYPE_OPTIONS as readonly string[]).includes(
        value.newCompetencyType,
      )
        ? value.newCompetencyType
        : CHA_TYPE_OPTIONS[0],
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <SearchableMultiCreateSelect
        values={value.competencyNames}
        options={bankOptions}
        placeholder="Escolha ou digite competências..."
        searchPlaceholder="Buscar ou criar..."
        emptyMessage="Nenhuma competência no catálogo."
        allowCreate
        onChange={handleSelectionChange}
      />
      <div className="flex items-end gap-2">
        {hasNew ? (
          <div className="flex-1">
            <label
              htmlFor="vincular-competencia-tipo"
              className="mb-1 block text-[11px] font-semibold text-muted-foreground"
            >
              Tipo (novas competências)
            </label>
            <Select
              id="vincular-competencia-tipo"
              value={value.newCompetencyType}
              onChange={(e) =>
                onChange({ ...value, newCompetencyType: e.target.value })
              }
              className="h-9 text-[13px]"
            >
              {CHA_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {COMPETENCY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <div className="flex-1">
          <label
            htmlFor="vincular-competencia-nivel"
            className="mb-1 block text-[11px] font-semibold text-muted-foreground"
          >
            Nível
          </label>
          <Select
            id="vincular-competencia-nivel"
            value={String(value.requiredLevel)}
            aria-label="Nível requerido"
            onChange={(e) =>
              onChange({ ...value, requiredLevel: Number(e.target.value) })
            }
            className="h-9 text-[13px]"
          >
            {LEVEL_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {hasNew ? (
        <p className="text-[11px] text-muted-foreground">
          {newNames.length === 1
            ? "1 competência nova será criada no catálogo"
            : `${newNames.length} competências novas serão criadas no catálogo`}{" "}
          com o tipo acima. As já existentes mantêm o tipo do catálogo.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          O nível vale para todas as selecionadas (ajustável por competência
          depois).
        </p>
      )}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={count === 0 || submitting}
        >
          {submitting
            ? "Vinculando..."
            : `Vincular${count > 0 ? ` (${count})` : ""}`}
        </Button>
      </div>
    </div>
  );
}

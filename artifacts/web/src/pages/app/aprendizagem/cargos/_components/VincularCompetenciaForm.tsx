import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { COMPETENCY_TYPE_LABELS } from "../cargos-utils";

/**
 * Taxonomia CHA (conhecimento/habilidade/atitude) — só aparece como escolha do
 * usuário quando ele está criando uma competência NOVA no catálogo (o tipo é
 * atributo da competência, não do vínculo). Para uma competência já existente,
 * o tipo vem do catálogo e é só exibido (o servidor o realinha de qualquer
 * forma — ver fix(aprendizagem): tipo do requisito vem do catálogo).
 */
export const CHA_TYPE_OPTIONS = ["conhecimento", "habilidade", "atitude"] as const;

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
  competencyName: string;
  competencyType: string;
  requiredLevel: number;
};

/**
 * Formulário de vínculo de competência a um cargo — apresentacional (sem
 * hooks de dados). O campo "Tipo" NÃO é um atributo do vínculo: quando a
 * competência escolhida já existe no catálogo, o tipo dela aparece como texto
 * (somente leitura); só ao criar uma competência nova é que o usuário escolhe
 * o tipo (lista CHA), porque aí o tipo é atributo da competência nova.
 */
export function VincularCompetenciaForm({
  bankItems,
  value,
  onChange,
  onSubmit,
  onCancel,
  submitting,
}: {
  bankItems: CompetencyBankOption[];
  value: VincularCompetenciaFormValue;
  onChange: (value: VincularCompetenciaFormValue) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  submitting?: boolean;
}) {
  const trimmedName = value.competencyName.trim();
  const existing = trimmedName
    ? bankItems.find(
        (i) => i.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      )
    : undefined;
  // Fluxo "criar na hora": o nome digitado não casa com nada do catálogo.
  const isNew = !!trimmedName && !existing;

  const existingTypeLabel = existing?.competencyType
    ? (COMPETENCY_TYPE_LABELS[existing.competencyType] ?? existing.competencyType)
    : null;

  // Opções do combobox: o banco + o nome sendo digitado/criado (para o trigger
  // mostrar a seleção mesmo antes de existir no banco).
  const bankOptions = bankItems.map((i) => ({ value: i.name, label: i.name }));
  if (trimmedName && !bankOptions.some((o) => o.value === value.competencyName)) {
    bankOptions.unshift({ value: value.competencyName, label: value.competencyName });
  }

  const handleCreateOption = (name: string) => {
    onChange({
      ...value,
      competencyName: name,
      // Nova competência: garante um tipo válido pré-selecionado no seletor CHA
      // (preserva a escolha anterior, se já era válida).
      competencyType: (CHA_TYPE_OPTIONS as readonly string[]).includes(
        value.competencyType,
      )
        ? value.competencyType
        : CHA_TYPE_OPTIONS[0],
    });
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <SearchableSelect
        value={value.competencyName}
        options={bankOptions}
        placeholder="Escolha ou digite uma competência..."
        onChange={(name) => onChange({ ...value, competencyName: name })}
        onCreateOption={handleCreateOption}
        createOptionLabel={(input) => `Criar “${input}”`}
      />
      <div className="flex items-center gap-2">
        {isNew ? (
          <div className="flex-1">
            <label
              htmlFor="vincular-competencia-tipo"
              className="mb-1 block text-[11px] font-semibold text-muted-foreground"
            >
              Tipo
            </label>
            <Select
              id="vincular-competencia-tipo"
              value={value.competencyType}
              onChange={(e) => onChange({ ...value, competencyType: e.target.value })}
              className="h-9 text-[13px]"
            >
              {CHA_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {COMPETENCY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
        ) : existingTypeLabel ? (
          <div className="flex-1">
            <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Tipo
            </span>
            <p className="flex h-9 items-center text-[13px] text-foreground">
              {existingTypeLabel}
            </p>
          </div>
        ) : null}
        <div className="flex-1">
          <Select
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
          disabled={!trimmedName || submitting}
        >
          Vincular
        </Button>
      </div>
    </div>
  );
}

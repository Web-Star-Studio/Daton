import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { CreateTrainingBodyStatus as CreateTrainingBodyStatusValues } from "@workspace/api-client-react";
import type { CreateTrainingBodyStatus } from "@workspace/api-client-react";

/** Campos do formulário "Registrar conclusão" — subconjunto do TrainingForm
 *  maior do [id].tsx (que também serve o wizard "Novo Treinamento"). */
export interface RegistrarConclusaoFormValues {
  status: CreateTrainingBodyStatus;
  completionDate: string;
  expirationDate: string;
  instructor: string;
  notApplicableReason: string;
}

export interface RegistrarConclusaoFormProps {
  form: RegistrarConclusaoFormValues;
  onChange: (next: RegistrarConclusaoFormValues) => void;
  instructorOptions: SearchableOption[];
  instructorSearch?: string;
  onInstructorSearchChange?: (value: string) => void;
}

/**
 * Corpo (apresentacional, sem hooks de dados) do diálogo "Registrar
 * conclusão" da ficha do colaborador. Extraído do [id].tsx para permitir
 * testar a regra do motivo obrigatório do status "Não aplicável" sem montar
 * a página inteira. A lógica de salvar (mutations, payload) continua no
 * [id].tsx — este componente só emite o próximo estado do formulário.
 */
export function RegistrarConclusaoForm({
  form,
  onChange,
  instructorOptions,
  instructorSearch,
  onInstructorSearchChange,
}: RegistrarConclusaoFormProps) {
  const isNaoAplicavel =
    form.status === CreateTrainingBodyStatusValues.nao_aplicavel;
  const motivoVazio = isNaoAplicavel && !form.notApplicableReason.trim();

  const handleStatusChange = (status: CreateTrainingBodyStatus) => {
    onChange({
      ...form,
      status,
      // Sair de NA descarta o motivo — não faz sentido guardá-lo escondido.
      notApplicableReason:
        status === CreateTrainingBodyStatusValues.nao_aplicavel
          ? form.notApplicableReason
          : "",
    });
  };

  return (
    <>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label
            htmlFor="registrar-conclusao-status"
            className="text-xs font-semibold text-muted-foreground"
          >
            Status *
          </Label>
          <Select
            id="registrar-conclusao-status"
            value={form.status}
            onChange={(e) =>
              handleStatusChange(e.target.value as CreateTrainingBodyStatus)
            }
            className="mt-1 h-10 text-[13px]"
          >
            <option value={CreateTrainingBodyStatusValues.pendente}>
              Pendente
            </option>
            <option value={CreateTrainingBodyStatusValues.concluido}>
              Concluído
            </option>
            <option value={CreateTrainingBodyStatusValues.vencido}>
              Vencido
            </option>
            <option value={CreateTrainingBodyStatusValues.nao_aplicavel}>
              Não aplicável
            </option>
          </Select>
        </div>
        <div>
          <Label
            htmlFor="registrar-conclusao-completion-date"
            className="text-xs font-semibold text-muted-foreground"
          >
            Data de conclusão
          </Label>
          <Input
            id="registrar-conclusao-completion-date"
            type="date"
            value={form.completionDate}
            disabled={isNaoAplicavel}
            onChange={(e) =>
              onChange({ ...form, completionDate: e.target.value })
            }
            className="mt-1"
          />
        </div>
        <div>
          <Label
            htmlFor="registrar-conclusao-expiration-date"
            className="text-xs font-semibold text-muted-foreground"
          >
            Validade
          </Label>
          <Input
            id="registrar-conclusao-expiration-date"
            type="date"
            value={form.expirationDate}
            disabled={isNaoAplicavel}
            onChange={(e) =>
              onChange({ ...form, expirationDate: e.target.value })
            }
            className="mt-1"
          />
        </div>
      </div>
      {isNaoAplicavel && (
        <div>
          <Label
            htmlFor="registrar-conclusao-motivo"
            className="text-xs font-semibold text-muted-foreground"
          >
            Motivo da não aplicabilidade *
          </Label>
          <Textarea
            id="registrar-conclusao-motivo"
            value={form.notApplicableReason}
            onChange={(e) =>
              onChange({ ...form, notApplicableReason: e.target.value })
            }
            className="mt-1"
            rows={3}
            placeholder="Explique por que este treinamento não se aplica a este colaborador."
          />
          {motivoVazio && (
            <p className="mt-1 text-[11px] text-destructive">
              Motivo é obrigatório quando o status é Não aplicável
            </p>
          )}
        </div>
      )}
      <div>
        <Label className="text-xs font-semibold text-muted-foreground">
          Instrutor
        </Label>
        <SearchableSelect
          value={form.instructor}
          options={instructorOptions}
          placeholder="Escolha um funcionário ou digite um nome..."
          searchValue={instructorSearch}
          onSearchChange={onInstructorSearchChange}
          onChange={(name) => onChange({ ...form, instructor: name })}
          onCreateOption={(name) => onChange({ ...form, instructor: name })}
          createOptionLabel={(input) => `Usar “${input}” (externo)`}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Funcionário da lista ou o nome de um palestrante externo.
        </p>
      </div>
    </>
  );
}

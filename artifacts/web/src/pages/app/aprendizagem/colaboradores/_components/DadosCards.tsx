import type { ReactNode } from "react";
import type { EmployeeDetail } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { computeTenure } from "../_lib/ficha-derivations";

// Mesmo vocabulário do InlineField de contractType em [id].tsx (CONTRACT_LABELS).
const CONTRACT_LABELS: Record<string, string> = {
  clt: "CLT",
  pj: "PJ",
  intern: "Estagiário",
  temporary: "Temporário",
  terceirizado: "Terceirizado",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function Campo({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 break-words text-[14px] text-foreground">
        {value || "—"}
      </div>
    </div>
  );
}

function DadosCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

type DadosCardsEmployee = Pick<
  EmployeeDetail,
  | "cpf"
  | "gender"
  | "birthDate"
  | "email"
  | "phone"
  | "department"
  | "position"
  | "unitName"
  | "admissionDate"
  | "contractType"
>;

export function DadosCards({
  employee,
  gestor,
  onEdit,
}: {
  employee: DadosCardsEmployee;
  gestor?: string;
  onEdit?: () => void;
}) {
  const contractLabel = employee.contractType
    ? (CONTRACT_LABELS[employee.contractType] ?? employee.contractType)
    : "";

  return (
    <div>
      {onEdit && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <DadosCard title="Dados pessoais">
          <Campo label="CPF" value={employee.cpf} />
          <Campo label="Sexo" value={employee.gender} />
          <Campo
            label="Data de nascimento"
            value={fmtDate(employee.birthDate)}
          />
          <Campo label="E-mail" value={employee.email} />
          <Campo label="Telefone" value={employee.phone} />
        </DadosCard>
        <DadosCard title="Dados profissionais">
          <Campo label="Departamento" value={employee.department} />
          <Campo label="Cargo" value={employee.position} />
          <Campo label="Filial" value={employee.unitName} />
          <Campo
            label="Data de admissão"
            value={fmtDate(employee.admissionDate)}
          />
          <Campo
            label="Tempo na empresa"
            value={computeTenure(employee.admissionDate)}
          />
          <Campo label="Gestor" value={gestor ?? "—"} />
          <Campo label="Tipo de contrato" value={contractLabel} />
        </DadosCard>
      </div>
    </div>
  );
}

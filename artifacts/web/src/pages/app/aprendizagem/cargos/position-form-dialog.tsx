import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Settings } from "lucide-react";
import {
  useCreatePosition,
  useUpdatePosition,
  type Position,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  SearchableSelect,
  toNameOptions,
  type SearchableOption,
} from "@/components/ui/searchable-select";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/contexts/AuthContext";
import { useActiveNorms, useAllNorms, buildNormLabelMap } from "@/lib/norms-client";
import { useActiveAreas, useAllAreas, buildAreaLabelMap } from "@/lib/areas-client";

// Nível e Escolaridade seguem listas FIXAS (não são catálogo gerenciável) —
// apenas com o visual de combobox com busca.
const LEVEL_OPTIONS = ["Operacional", "Tático", "Estratégico"];
const EDUCATION_OPTIONS = [
  "Ensino Fundamental",
  "Ensino Médio Completo",
  "Técnico",
  "Superior Completo",
  "Pós-graduação",
];

interface FormState {
  name: string;
  areaId: string;
  level: string;
  principalNormId: string;
  education: string;
  experience: string;
  description: string;
  requirements: string;
}

const EMPTY: FormState = {
  name: "",
  areaId: "",
  level: "",
  principalNormId: "",
  education: "",
  experience: "",
  description: "",
  requirements: "",
};

function fromPosition(p: Position): FormState {
  return {
    name: p.name ?? "",
    areaId: p.areaId != null ? String(p.areaId) : "",
    level: p.level ?? "",
    principalNormId: p.principalNormId != null ? String(p.principalNormId) : "",
    education: p.education ?? "",
    experience: p.experience ?? "",
    description: p.description ?? "",
    requirements: p.requirements ?? "",
  };
}

export function PositionFormDialog({
  orgId,
  open,
  position,
  onClose,
  onSaved,
}: {
  orgId: number;
  open: boolean;
  position: Position | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [, setLocation] = useLocation();
  const { isOrgAdmin } = usePermissions();
  const createMut = useCreatePosition();
  const updateMut = useUpdatePosition();
  const { data: activeNorms = [] } = useActiveNorms(orgId);
  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelMap = buildNormLabelMap(allNorms);
  const { data: activeAreas = [] } = useActiveAreas(orgId);
  const { data: allAreas = [] } = useAllAreas(orgId);
  const areaLabelMap = buildAreaLabelMap(allAreas);

  useEffect(() => {
    if (open) setForm(position ? fromPosition(position) : EMPTY);
  }, [open, position]);

  // Opções da norma: as ativas + a norma já selecionada (mesmo se hoje inativa),
  // para a edição não "perder" a opção atual.
  const selectedNormId = form.principalNormId ? Number(form.principalNormId) : null;
  const normOptions: { id: number; label: string }[] = activeNorms.map((n) => ({
    id: n.id,
    label: n.label,
  }));
  if (selectedNormId != null && !normOptions.some((n) => n.id === selectedNormId)) {
    const label = normLabelMap.get(selectedNormId);
    if (label) normOptions.push({ id: selectedNormId, label });
  }

  // Área vem do catálogo gerenciável (`areas`), referenciada por id. Opções = as
  // ativas + a área já selecionada (mesmo se hoje inativa), para a edição não
  // perder a seleção atual. Criar/renomear é só na tela de gestão (engrenagem).
  const selectedAreaId = form.areaId ? Number(form.areaId) : null;
  const areaOptions: SearchableOption[] = activeAreas.map((a) => ({
    value: String(a.id),
    label: a.label,
  }));
  if (selectedAreaId != null && !areaOptions.some((o) => o.value === form.areaId)) {
    const label = areaLabelMap.get(selectedAreaId);
    if (label) areaOptions.push({ value: form.areaId, label });
  }

  // Nível/Escolaridade: listas FIXAS + o valor atual (mesmo legado importado,
  // para não abrir em branco nem sobrescrever ao salvar). Sem criação inline.
  const levelOptions = toNameOptions(LEVEL_OPTIONS, form.level);
  const educationOptions = toNameOptions(EDUCATION_OPTIONS, form.education);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const goToAreaSettings = () => {
    onClose();
    setLocation("/configuracoes/sistema?tab=areas");
  };

  const pending = createMut.isPending || updateMut.isPending;

  const handleSave = async () => {
    // Enviar os valores crus (inclusive "") — assim a edição consegue LIMPAR um
    // campo. Com `|| undefined` o JSON.stringify descartaria a chave e o PATCH
    // (`.set(body.data)`) nunca receberia, revertendo silenciosamente.
    // `area` (texto legado) NÃO é enviado: a fonte agora é `areaId`, e omitir a
    // chave deixa a coluna legada intocada.
    const data = {
      name: form.name.trim(),
      areaId: form.areaId ? Number(form.areaId) : null,
      level: form.level,
      principalNormId: form.principalNormId ? Number(form.principalNormId) : null,
      education: form.education,
      experience: form.experience,
      description: form.description,
      requirements: form.requirements,
    };
    try {
      if (position) {
        await updateMut.mutateAsync({ orgId, posId: position.id, data });
      } else {
        await createMut.mutateAsync({ orgId, data });
      }
      onSaved();
      onClose();
    } catch {
      toast({
        title: "Não foi possível salvar o cargo",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={position ? "Editar cargo" : "Novo cargo"}
      description="Dados do cargo e requisitos de competência"
      size="lg"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Nome do cargo *</Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: Motorista, Analista SGI..."
            className="mt-1"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label>Área</Label>
            {isOrgAdmin && (
              <button
                type="button"
                onClick={goToAreaSettings}
                className="flex items-center gap-1 rounded p-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                title="Gerenciar áreas"
                aria-label="Gerenciar áreas"
              >
                <Settings className="h-3.5 w-3.5" />
                Gerenciar
              </button>
            )}
          </div>
          <div className="mt-1">
            <SearchableSelect
              value={form.areaId}
              onChange={(v) => set("areaId", v)}
              options={areaOptions}
              placeholder="Selecione uma área..."
              searchPlaceholder="Buscar área..."
              emptyMessage="Nenhuma área cadastrada. Use ⚙ Gerenciar."
            />
          </div>
        </div>
        <div>
          <Label>Nível</Label>
          <div className="mt-1">
            <SearchableSelect
              value={form.level}
              onChange={(v) => set("level", v)}
              options={levelOptions}
              placeholder="Selecione um nível..."
              searchPlaceholder="Buscar nível..."
            />
          </div>
        </div>
        <div>
          <Label>Norma ISO principal</Label>
          <Select
            value={form.principalNormId}
            onChange={(e) => set("principalNormId", e.target.value)}
            className="mt-1 h-10 text-[13px]"
          >
            <option value="">—</option>
            {normOptions.map((n) => (
              <option key={n.id} value={String(n.id)}>
                {n.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Escolaridade mínima</Label>
          <div className="mt-1">
            <SearchableSelect
              value={form.education}
              onChange={(v) => set("education", v)}
              options={educationOptions}
              placeholder="Selecione..."
              searchPlaceholder="Buscar escolaridade..."
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Experiência mínima</Label>
          <Input
            value={form.experience}
            onChange={(e) => set("experience", e.target.value)}
            placeholder="Ex: 1 ano em transporte de cargas"
            className="mt-1"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Descrição da função</Label>
          <Textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={4}
            placeholder="Descreva as principais responsabilidades e atribuições do cargo..."
            className="mt-1"
          />
        </div>
        <div className="md:col-span-2">
          <Label>Habilidades requeridas</Label>
          <Textarea
            value={form.requirements}
            onChange={(e) => set("requirements", e.target.value)}
            rows={3}
            placeholder="Liste as habilidades técnicas e comportamentais exigidas..."
            className="mt-1"
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={pending || !form.name.trim()}
        >
          Salvar
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

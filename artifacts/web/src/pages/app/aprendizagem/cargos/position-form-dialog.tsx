import { useEffect, useState } from "react";
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
} from "@/components/ui/searchable-select";
import { toast } from "@/hooks/use-toast";
import { useActiveNorms, useAllNorms, buildNormLabelMap } from "@/lib/norms-client";
import { deriveDistinct } from "./cargos-utils";

const AREA_OPTIONS = [
  "Operações",
  "Logística",
  "Qualidade",
  "Manutenção",
  "Administrativo",
  "TI",
];
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
  area: string;
  level: string;
  principalNormId: string;
  education: string;
  experience: string;
  description: string;
  requirements: string;
}

const EMPTY: FormState = {
  name: "",
  area: "",
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
    area: p.area ?? "",
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
  positions,
  onClose,
  onSaved,
}: {
  orgId: number;
  open: boolean;
  position: Position | null;
  /** Todos os cargos da org — usados para sugerir as áreas/níveis/escolaridades
   *  já cadastrados (o usuário também pode criar novos in-loco). */
  positions: Position[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const createMut = useCreatePosition();
  const updateMut = useUpdatePosition();
  const { data: activeNorms = [] } = useActiveNorms(orgId);
  const { data: allNorms = [] } = useAllNorms(orgId);
  const normLabelMap = buildNormLabelMap(allNorms);

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

  // Área/Nível/Escolaridade são texto livre. As opções = defaults + valores já
  // usados nos cargos da org + o valor atual (mesmo legado importado, para não
  // abrir em branco nem sobrescrever ao salvar). O SearchableSelect permite
  // ainda digitar um novo valor e criá-lo in-loco (onCreateOption). `toNameOptions`
  // dedup case-insensitive e garante que o valor atual apareça como opção.
  const areaOptions = toNameOptions(
    [...AREA_OPTIONS, ...deriveDistinct(positions, "area")],
    form.area,
  );
  const levelOptions = toNameOptions(
    [...LEVEL_OPTIONS, ...deriveDistinct(positions, "level")],
    form.level,
  );
  const educationOptions = toNameOptions(
    [...EDUCATION_OPTIONS, ...deriveDistinct(positions, "education")],
    form.education,
  );

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const pending = createMut.isPending || updateMut.isPending;

  const handleSave = async () => {
    // Enviar os valores crus (inclusive "") — assim a edição consegue LIMPAR um
    // campo. Com `|| undefined` o JSON.stringify descartaria a chave e o PATCH
    // (`.set(body.data)`) nunca receberia, revertendo silenciosamente.
    const data = {
      name: form.name.trim(),
      area: form.area,
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
          <Label>Área</Label>
          <div className="mt-1">
            <SearchableSelect
              value={form.area}
              onChange={(v) => set("area", v)}
              options={areaOptions}
              placeholder="Selecione ou crie uma área..."
              searchPlaceholder="Buscar ou digitar nova área..."
              onCreateOption={(v) => set("area", v)}
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
              placeholder="Selecione ou crie um nível..."
              searchPlaceholder="Buscar ou digitar novo nível..."
              onCreateOption={(v) => set("level", v)}
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
              placeholder="Selecione ou crie..."
              searchPlaceholder="Buscar ou digitar nova escolaridade..."
              onCreateOption={(v) => set("education", v)}
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

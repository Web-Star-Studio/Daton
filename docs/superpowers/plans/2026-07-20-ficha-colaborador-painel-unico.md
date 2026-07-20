# Ficha do colaborador — painel único — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir a ficha do colaborador (`aprendizagem/colaboradores/[id].tsx`) no layout **painel único** da "Versão proposta", sobre a fundação da Fase 1 (`competencyConformance`), sem perder funcionalidade.

**Architecture:** Componentes de seção **presentacionais** (recebem props, sem hooks) em `colaboradores/_components/`, testáveis isoladamente. Derivações puras (contadores, tempo na empresa, escolaridade) num módulo `_lib/`. `[id].tsx` continua sendo o dono dos hooks/mutations/diálogos e passa a **orquestrar** as seções empilhadas num scroll único, em vez de abas.

**Tech Stack:** React 19 + Vite + TailwindCSS 4, TanStack Query (hooks gerados de `@workspace/api-client-react`), Vitest (web-unit, JSDOM), Testing Library.

## Global Constraints

- **`pnpm typecheck` completo** antes de cada push — o `vite build`/esbuild **não** type-checa (a ficha é `.tsx`).
- **Testes web** ficam em `artifacts/web/tests/**/*.unit.test.{ts,tsx}` — **fora** desse glob o projeto `web-unit` **não** coleta o arquivo.
- **Repo público:** nenhum dado de produção (contagens, nomes reais de cliente/competência, CPF) em mensagens de commit, corpo de PR ou docs. Exemplos de teste usam dados fictícios.
- **Não mudar schema** — sem matrícula/etnia/salário. Sem reintroduzir campos removidos.
- **Preservar funcionalidade**: os diálogos e mutations existentes (competência/treinamento/eficácia/conscientização/itens de perfil/edição) são **movidos, não reescritos**.
- **Cores = design system do Daton; layout = mockup.** Usar `cn()` e os tokens/utilitários Tailwind já usados no arquivo.
- Commits nesta branch (`feat/aprendizagem-ficha-painel`). Push/PR-draft permitidos em worktree; **nunca** na main, nunca force-push, nunca merge sem "go".
- Prettier: 2 espaços, aspas duplas, trailing commas.

**Forma dos dados (já no payload de `GET /employees/:empId`, hook `useGetEmployee`):** `employee.trainings[]` (cada um com `status?: string`, `completionDate?`, `expirationDate?`), `employee.competencies[]`, `employee.awareness[]`, `employee.education?`, `employee.admissionDate?`, e `employee.competencyConformance` = `{ positionName: string | null; gapStatus: "ok"|"gap"|"critical"|"indeterminado"; requirements: { competencyName: string; competencyType: string; requiredLevel: number; acquiredLevel: number; status: "atende"|"gap"|"nao_classificado"; source: "manual"|"treinamento"|null; evidence: unknown|null }[] } | null`.

---

### Task 1: Derivações puras (contadores, tempo na empresa, escolaridade)

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations.ts`
- Test: `artifacts/web/tests/pages/aprendizagem/ficha-derivations.unit.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `computeTrainingCounters(trainings: { status?: string | null; expirationDate?: string | null }[], today?: string): { total: number; feitos: number; pendentes: number; vencidos: number }`
  - `computeTenure(admissionDate: string | null | undefined, today?: Date): string` (`""` se sem data)
  - `type EscolaridadeVeredito = "atende" | "gap" | "nao_informado" | "sem_requisito"`
  - `compareEducation(possui: string | null | undefined, requerido: string | null | undefined): EscolaridadeVeredito`

- [ ] **Step 1: Escrever o teste que falha**

Crie `artifacts/web/tests/pages/aprendizagem/ficha-derivations.unit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeTrainingCounters,
  computeTenure,
  compareEducation,
} from "@/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations";

describe("computeTrainingCounters", () => {
  it("conta total/feitos/pendentes/vencidos por status", () => {
    const r = computeTrainingCounters([
      { status: "concluido" },
      { status: "concluido" },
      { status: "pendente" },
      { status: "vencido" },
    ]);
    expect(r).toEqual({ total: 4, feitos: 2, pendentes: 1, vencidos: 1 });
  });

  it("trata treino concluído com validade passada como vencido", () => {
    const r = computeTrainingCounters(
      [{ status: "concluido", expirationDate: "2020-01-01" }],
      "2026-01-01",
    );
    expect(r.vencidos).toBe(1);
    expect(r.feitos).toBe(0);
  });

  it("lista vazia -> tudo zero", () => {
    expect(computeTrainingCounters([])).toEqual({
      total: 0,
      feitos: 0,
      pendentes: 0,
      vencidos: 0,
    });
  });
});

describe("computeTenure", () => {
  it("formata anos e meses", () => {
    expect(computeTenure("2019-03-12", new Date("2026-06-20"))).toBe(
      "7 anos e 3 meses",
    );
  });
  it("menos de um ano mostra só meses", () => {
    expect(computeTenure("2026-01-10", new Date("2026-06-20"))).toBe("5 meses");
  });
  it("sem data -> string vazia", () => {
    expect(computeTenure(null)).toBe("");
  });
});

describe("compareEducation", () => {
  it("possui >= requerido -> atende", () => {
    expect(compareEducation("Superior Completo", "Médio Completo")).toBe(
      "atende",
    );
    expect(compareEducation("Médio Completo", "Médio Completo")).toBe("atende");
  });
  it("possui < requerido -> gap", () => {
    expect(compareEducation("Médio Incompleto", "Médio Completo")).toBe("gap");
  });
  it("sem requerido (ou fora do mapa) -> sem_requisito", () => {
    expect(compareEducation("Médio Completo", null)).toBe("sem_requisito");
    expect(compareEducation("Médio Completo", "Não Aplicável")).toBe(
      "sem_requisito",
    );
  });
  it("sem possui -> nao_informado", () => {
    expect(compareEducation(null, "Médio Completo")).toBe("nao_informado");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/ficha-derivations.unit.test.ts
```
Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Crie `artifacts/web/src/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations.ts`:

```ts
export function computeTrainingCounters(
  trainings: { status?: string | null; expirationDate?: string | null }[],
  today: string = new Date().toISOString().slice(0, 10),
): { total: number; feitos: number; pendentes: number; vencidos: number } {
  let feitos = 0;
  let pendentes = 0;
  let vencidos = 0;
  for (const t of trainings) {
    const expired = !!t.expirationDate && t.expirationDate < today;
    if (t.status === "vencido" || (t.status === "concluido" && expired)) {
      vencidos++;
    } else if (t.status === "concluido") {
      feitos++;
    } else if (t.status === "pendente") {
      pendentes++;
    }
  }
  return { total: trainings.length, feitos, pendentes, vencidos };
}

export function computeTenure(
  admissionDate: string | null | undefined,
  today: Date = new Date(),
): string {
  if (!admissionDate) return "";
  const start = new Date(admissionDate);
  if (Number.isNaN(start.getTime())) return "";
  let months =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months--;
  if (months < 0) months = 0;
  const anos = Math.floor(months / 12);
  const meses = months % 12;
  const partes: string[] = [];
  if (anos > 0) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  if (meses > 0) partes.push(`${meses} ${meses === 1 ? "mês" : "meses"}`);
  return partes.join(" e ") || "menos de 1 mês";
}

export type EscolaridadeVeredito =
  | "atende"
  | "gap"
  | "nao_informado"
  | "sem_requisito";

// Ordem crescente dos níveis conhecidos. Valores fora daqui (ex.: "Não
// Aplicável") não têm ordem -> não geram veredito.
const EDUCATION_ORDER = [
  "fundamental incompleto",
  "fundamental completo",
  "médio incompleto",
  "medio incompleto",
  "médio completo",
  "medio completo",
  "superior incompleto",
  "superior completo",
  "pós-graduação",
  "pos-graduacao",
  "pós graduação",
  "mestrado",
  "doutorado",
];

function eduRank(value: string | null | undefined): number {
  if (!value) return -1;
  return EDUCATION_ORDER.indexOf(value.trim().toLowerCase());
}

export function compareEducation(
  possui: string | null | undefined,
  requerido: string | null | undefined,
): EscolaridadeVeredito {
  const rReq = eduRank(requerido);
  if (rReq < 0) return "sem_requisito";
  const rPos = eduRank(possui);
  if (!possui) return "nao_informado";
  if (rPos < 0) return "nao_informado";
  return rPos >= rReq ? "atende" : "gap";
}
```

Nota: `EDUCATION_ORDER` inclui variações com/sem acento porque o dado é texto livre; `indexOf` na versão normalizada resolve empates de grafia entre grupos equivalentes (incompleto/completo mantêm a ordem).

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/ficha-derivations.unit.test.ts
pnpm typecheck
```
Esperado: PASS; typecheck limpo.

- [ ] **Step 5: Commit** *(nesta branch)*

```bash
git add artifacts/web/src/pages/app/aprendizagem/colaboradores/_lib/ficha-derivations.ts \
        artifacts/web/tests/pages/aprendizagem/ficha-derivations.unit.test.ts
git commit -m "feat(aprendizagem): derivações puras da ficha (contadores, tempo, escolaridade)"
```

---

### Task 2: `FichaHeader` — cabeçalho com avatar + 4 contadores

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/FichaHeader.tsx`
- Test: `artifacts/web/tests/pages/aprendizagem/ficha-header.unit.test.tsx`

**Interfaces:**
- Consumes: `computeTrainingCounters` (Task 1).
- Produces: `FichaHeader({ name, position, contractLabel, department, unitName, trainings }): JSX.Element` — presentacional, sem hooks.

- [ ] **Step 1: Teste que falha**

Crie `artifacts/web/tests/pages/aprendizagem/ficha-header.unit.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FichaHeader } from "@/pages/app/aprendizagem/colaboradores/_components/FichaHeader";

describe("FichaHeader", () => {
  it("mostra nome, cargo e os 4 contadores", () => {
    render(
      <FichaHeader
        name="Fulano de Tal"
        position="Analista"
        contractLabel="CLT"
        department="Qualidade"
        unitName="Matriz"
        trainings={[
          { status: "concluido" },
          { status: "pendente" },
          { status: "vencido" },
        ]}
      />,
    );
    expect(screen.getByText("Fulano de Tal")).toBeInTheDocument();
    // 4 contadores: Total 3 / Feitos 1 / Pendentes 1 / Vencidos 1
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Feitos")).toBeInTheDocument();
    expect(screen.getByText("Pendentes")).toBeInTheDocument();
    expect(screen.getByText("Vencidos")).toBeInTheDocument();
    expect(screen.getByText("FT")).toBeInTheDocument(); // iniciais no avatar
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/ficha-header.unit.test.tsx
```
Esperado: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

Crie `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/FichaHeader.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { computeTrainingCounters } from "../_lib/ficha-derivations";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

const STAT_TONE: Record<string, string> = {
  feitos: "text-emerald-600",
  pendentes: "text-amber-600",
  vencidos: "text-red-600",
};

export function FichaHeader({
  name,
  position,
  contractLabel,
  department,
  unitName,
  trainings,
}: {
  name: string;
  position?: string | null;
  contractLabel?: string | null;
  department?: string | null;
  unitName?: string | null;
  trainings: { status?: string | null; expirationDate?: string | null }[];
}) {
  const c = computeTrainingCounters(trainings);
  const badges = [contractLabel, department, unitName].filter(Boolean) as string[];
  const stats: { key: string; label: string; value: number }[] = [
    { key: "total", label: "Total", value: c.total },
    { key: "feitos", label: "Feitos", value: c.feitos },
    { key: "pendentes", label: "Pendentes", value: c.pendentes },
    { key: "vencidos", label: "Vencidos", value: c.vencidos },
  ];
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-secondary text-lg font-bold text-foreground">
        {initials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold leading-tight">{name}</h2>
        {position && (
          <p className="text-sm text-muted-foreground">{position}</p>
        )}
        {badges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <Badge key={b} variant="secondary" className="text-[10px]">
                {b}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-6">
        {stats.map((s) => (
          <div key={s.key} className="text-center">
            <div
              className={cn(
                "text-xl font-bold tabular-nums leading-none",
                STAT_TONE[s.key],
              )}
            >
              {s.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar + typecheck**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/ficha-header.unit.test.tsx
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/FichaHeader.tsx \
        artifacts/web/tests/pages/aprendizagem/ficha-header.unit.test.tsx
git commit -m "feat(aprendizagem): FichaHeader (avatar + 4 contadores)"
```

---

### Task 3: `DadosCards` — dados pessoais | profissionais

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/DadosCards.tsx`
- Test: `artifacts/web/tests/pages/aprendizagem/dados-cards.unit.test.tsx`

**Interfaces:**
- Consumes: `computeTenure` (Task 1).
- Produces: `DadosCards({ employee, gestor, onEdit }): JSX.Element` — presentacional. `employee` traz os campos existentes; `gestor?: string` vem da Task 6 (por ora `undefined` → mostra "—"). `onEdit?: () => void` abre o modal de cadastro (dono é o `[id].tsx`).

Só renderiza campos que existem (sem matrícula/etnia/salário). Sexo e nascimento vêm de `employee.gender` / `employee.birthDate` (existem no modelo, hoje não exibidos).

- [ ] **Step 1: Teste que falha**

Crie `artifacts/web/tests/pages/aprendizagem/dados-cards.unit.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DadosCards } from "@/pages/app/aprendizagem/colaboradores/_components/DadosCards";

const emp = {
  cpf: "***.123.***-**",
  gender: "Masculino",
  birthDate: "1990-07-14",
  email: "f@ex.com",
  phone: "(41) 90000-0000",
  department: "Qualidade",
  position: "Analista",
  unitName: "Matriz",
  admissionDate: "2019-03-12",
  contractType: "clt",
} as never;

describe("DadosCards", () => {
  it("mostra os dois cards e os campos que existem", () => {
    render(<DadosCards employee={emp} />);
    expect(screen.getByText("Dados pessoais")).toBeInTheDocument();
    expect(screen.getByText("Dados profissionais")).toBeInTheDocument();
    expect(screen.getByText("Masculino")).toBeInTheDocument();
    expect(screen.getByText("Qualidade")).toBeInTheDocument();
    // NÃO renderiza rótulos de campos inexistentes
    expect(screen.queryByText(/matr[íi]cula/i)).toBeNull();
    expect(screen.queryByText(/sal[áa]rio/i)).toBeNull();
    expect(screen.queryByText(/etnia/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/dados-cards.unit.test.tsx
```

- [ ] **Step 3: Implementar**

Crie `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/DadosCards.tsx`. Duas colunas (`grid md:grid-cols-2 gap-4`), cada card com um título e uma lista de `label / value`. Campos:
- **Pessoais:** CPF, Sexo (`gender`), Data de nascimento (`birthDate`, formatado dd/mm/aaaa), E-mail, Telefone.
- **Profissionais:** Departamento, Cargo, Filial (`unitName`), Data de admissão, Tempo na empresa (`computeTenure(admissionDate)`), Gestor (`gestor ?? "—"`), Tipo de contrato (`contractType` via um mapa CLT/PJ/…).

Um campo com valor vazio mostra "—". Um botão "Editar" no topo (se `onEdit`) chama `onEdit`. Use um subcomponente local `Campo({label, value})`. Formatação de data: reusar o padrão do arquivo (helper `fmtDate` local, ou `new Date(x).toLocaleDateString("pt-BR")`). **Não** renderizar rótulo de matrícula/etnia/salário.

- [ ] **Step 4: Rodar e ver passar + typecheck**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/dados-cards.unit.test.tsx
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/DadosCards.tsx \
        artifacts/web/tests/pages/aprendizagem/dados-cards.unit.test.tsx
git commit -m "feat(aprendizagem): DadosCards (pessoais | profissionais)"
```

---

### Task 4: `FormacaoQualificacoes` — escolaridade + competências (3 estados)

**Files:**
- Create: `artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/FormacaoQualificacoes.tsx`
- Test: `artifacts/web/tests/pages/aprendizagem/formacao-qualificacoes.unit.test.tsx`

**Interfaces:**
- Consumes: `compareEducation` (Task 1) + a forma de `competencyConformance` (Fase 1).
- Produces: `FormacaoQualificacoes({ education, requiredEducation, conformance }): JSX.Element` — presentacional. `conformance` = `employee.competencyConformance` (pode ser `null`).

Renderiza: selo "Gaps encontrados" / "Requisitos atendidos"; sub-bloco **Escolaridade** (Possui × Requerido → veredito de `compareEducation`); sub-bloco **Competências do cargo** = lista única de `conformance.requirements` com os 3 estados (verde `atende` / vermelho `gap` / cinza `nao_classificado`), barra de progresso `atende/(atende+gap)`, e rodapé "N não avaliáveis". Quando `conformance` é `null` → estado neutro "cargo sem requisitos definidos".

- [ ] **Step 1: Teste que falha**

Crie `artifacts/web/tests/pages/aprendizagem/formacao-qualificacoes.unit.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormacaoQualificacoes } from "@/pages/app/aprendizagem/colaboradores/_components/FormacaoQualificacoes";

const conformance = {
  positionName: "Analista",
  gapStatus: "critical",
  requirements: [
    { competencyName: "Comp A", competencyType: "habilidade", requiredLevel: 1, acquiredLevel: 1, status: "atende", source: "treinamento", evidence: null },
    { competencyName: "Comp B", competencyType: "habilidade", requiredLevel: 2, acquiredLevel: 1, status: "gap", source: "manual", evidence: null },
    { competencyName: "Comp C", competencyType: "habilidade", requiredLevel: 1, acquiredLevel: 0, status: "nao_classificado", source: null, evidence: null },
  ],
} as never;

describe("FormacaoQualificacoes", () => {
  it("mostra escolaridade e os 3 estados das competências", () => {
    render(
      <FormacaoQualificacoes
        education="Superior Completo"
        requiredEducation="Médio Completo"
        conformance={conformance}
      />,
    );
    expect(screen.getByText("Formação e qualificações")).toBeInTheDocument();
    expect(screen.getByText(/Escolaridade/i)).toBeInTheDocument();
    expect(screen.getByText("Comp A")).toBeInTheDocument();
    expect(screen.getByText("Comp B")).toBeInTheDocument();
    expect(screen.getByText("Comp C")).toBeInTheDocument();
    expect(screen.getByText(/Não avaliável/i)).toBeInTheDocument();
    // barra: 1 atende / (1 atende + 1 gap) -> 1 não avaliável no rodapé
    expect(screen.getByText(/1 requisito ainda não avaliável/i)).toBeInTheDocument();
  });

  it("conformance null -> estado neutro", () => {
    render(
      <FormacaoQualificacoes education="Médio Completo" requiredEducation={null} conformance={null} />,
    );
    expect(screen.getByText(/sem requisitos definidos|não possui requisitos/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/formacao-qualificacoes.unit.test.tsx
```

- [ ] **Step 3: Implementar**

Crie o componente. Estrutura:
- Cabeçalho do bloco: "Formação e qualificações" + selo verde "Requisitos atendidos" quando não há `gap` nem `nao_classificado` (e escolaridade não é `gap`); senão selo vermelho "Gaps encontrados".
- **Escolaridade:** chama `compareEducation(education, requiredEducation)`. `atende` → linha verde "Possui: X · Requerido: Y" + "Atende"; `gap` → vermelha; `sem_requisito` → só "Possui: X" (sem veredito); `nao_informado` → "Não informado".
- **Competências do cargo:** `const reqs = conformance?.requirements ?? []`. Contagens: `atende = reqs.filter(status==="atende").length`, `gap = ...`, `naoClass = ...`. Barra de progresso = `atende / (atende + gap)` (evitar divisão por zero). Lista: cada requisito com ícone/cor por `status` (atende=verde `CheckCircle2`, gap=vermelho `XCircle`, nao_classificado=cinza `HelpCircle` + texto "Não avaliável — treinamento não classificado"). Rodapé se `naoClass > 0`: "N requisito(s) ainda não avaliável(is)".
- `conformance === null` → um aviso neutro "Este cargo ainda não possui requisitos definidos.".

Reusar os mesmos ícones/cores que o bloco "Conformidade do Cargo" atual usa (é o mesmo motor); pode-se extrair a lógica de contagem/estado do `CompetenciasTab` atual para cá (DRY). **Não** reimplementar o cálculo — só apresentar `conformance`.

- [ ] **Step 4: Rodar e ver passar + typecheck**

```bash
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/formacao-qualificacoes.unit.test.tsx
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/pages/app/aprendizagem/colaboradores/_components/FormacaoQualificacoes.tsx \
        artifacts/web/tests/pages/aprendizagem/formacao-qualificacoes.unit.test.tsx
git commit -m "feat(aprendizagem): FormacaoQualificacoes (escolaridade + conformidade em 3 estados)"
```

---

### Task 5: Gestor no payload do detalhe

**Files:**
- Modify: `artifacts/api-server/src/routes/employees.ts` (handler `GET /organizations/:orgId/employees/:empId`, ~L2530-2645)
- Modify: `lib/api-spec/openapi.yaml` (schema `Employee` — campo `managers`)
- Regenerate: `lib/api-zod`, `lib/api-client-react`
- Test: `artifacts/api-server/tests/routes/employees-learning-columns.integration.test.ts` (adicionar caso) ou o teste de detalhe existente

**Interfaces:**
- Consumes: a tabela `unit_managers` (gestores por filial — mesmo mecanismo da listagem de colaboradores).
- Produces: `employee.managers?: { id: number; name: string }[]` no payload de detalhe. `DadosCards` (Task 3) passa a receber `gestor = managers.map(m => m.name).join(", ")`.

- [ ] **Step 1: Inspecionar como a listagem já resolve "Gestor direto"** em `employees.ts` (procurar `unit_managers` / `unitManagers`) e reusar a mesma consulta, agora para a `unitId` do colaborador do detalhe.

- [ ] **Step 2: Teste de integração** — no arquivo de detalhe/colunas: criar unidade + `unit_managers` (usuário gestor) + colaborador na unidade; `GET /employees/:empId` retorna `managers` com o nome do gestor. Rodar com `TEST_ENV=integration` e ver falhar (campo ausente).

- [ ] **Step 3: Implementar** — no handler de detalhe, carregar os gestores da `unitId` do colaborador (via `unit_managers` → `users`), anexar `managers` ao `res.json({...})`. Declarar `managers` no `Employee` do OpenAPI (`array` de `{id, name}`), rodar `pnpm --filter @workspace/api-spec codegen`.

- [ ] **Step 4: Ligar no front** — em `[id].tsx`, passar `gestor={(employee.managers ?? []).map((m) => m.name).join(", ") || undefined}` para `DadosCards`. `pnpm typecheck`.

- [ ] **Step 5: Rodar testes + commit**

```bash
TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/routes/employees-learning-columns.integration.test.ts
pnpm typecheck
git add artifacts/api-server/src/routes/employees.ts lib/api-spec/openapi.yaml \
        lib/api-zod/src/generated lib/api-client-react/src/generated \
        artifacts/api-server/tests/routes/employees-learning-columns.integration.test.ts
git commit -m "feat(aprendizagem): gestor(es) da filial no payload de detalhe do colaborador"
```

---

### Task 6: Reestruturar `[id].tsx` para painel único

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx` (a região de render, ~L3929-4210)

**Interfaces:**
- Consumes: `FichaHeader` (T2), `DadosCards` (T3), `FormacaoQualificacoes` (T4), `employee.managers` (T5).
- Produces: nada consumido por tarefas posteriores.

Objetivo: trocar a barra de abas por um **scroll único** de seções, na ordem do mockup, **sem** perder os diálogos/CRUD.

- [ ] **Step 1: Remover o estado/barra de abas.** Apagar `activeTab`/`setActiveTab` (L3676-3678) e o `tabs`/barra de abas (L3929-3976). As ações contextuais de header por aba (Nova Competência/Novo Treinamento/Novo Registro) passam a ser sempre disponíveis (ou ligadas ao seu bloco).

- [ ] **Step 2: Montar o painel.** No `return`, empilhar, dentro de `<div className="space-y-8">`, nesta ordem:
  1. `<FichaHeader name={employee.name} position={employee.position} contractLabel={CONTRACT_LABELS[employee.contractType]} department={employee.department} unitName={employee.unitName} trainings={employee.trainings ?? []} />`
  2. `<DadosCards employee={employee} gestor={(employee.managers ?? []).map((m)=>m.name).join(", ") || undefined} onEdit={() => setEditOpen(true)} />` (reusar o modal `EditEmployeeModal` já existente para a edição — manter o estado que o abre).
  3. `<FormacaoQualificacoes education={employee.education} requiredEducation={employeePositionRecord?.education ?? null} conformance={employee.competencyConformance ?? null} />`
  4. A **seção de Treinamentos** = o corpo do antigo `TreinamentosTab` (lista de cards + diálogos), agora sempre renderizado, com um título "Treinamentos".
  5. A **seção de Competências** = a lista de cards do antigo `CompetenciasTab` **sem** o bloco "Conformidade do Cargo" (que foi substituído por `FormacaoQualificacoes`) — só a matriz/lista de competências + o diálogo de CRUD.
  6. A **seção de Eficácia** já vive dentro dos cards de treinamento; se o mockup pede uma coluna própria, extrair um resumo das avaliações (opcional; se custar, manter dentro dos cards de treino e só garantir que aparece).
  7. A **seção de Conscientização** = o corpo do antigo `ConscientizacaoTab`, com título "Conscientização", no fim.
  Os antigos `TreinamentosTab`/`CompetenciasTab`/`ConscientizacaoTab` podem virar as seções diretamente (renderizados sempre, não por aba). Preservar todos os `use*Mutation`, diálogos e handlers.

- [ ] **Step 3: Evitar duplicação do bloco de conformidade.** Remover do `CompetenciasTab` o bloco "Conformidade do Cargo" (agora em `FormacaoQualificacoes`), deixando só a lista/matriz de competências. Confirmar que `matchRequirements...`/`competencyConformance` não é lido em dois lugares.

- [ ] **Step 4: Typecheck + testes de render existentes.**

```bash
pnpm typecheck
pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem
```
Esperado: sem erros de tipo; os testes das Tasks 1-4 continuam verdes.

- [ ] **Step 5: Commit**

```bash
git add "artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx"
git commit -m "feat(aprendizagem): ficha do colaborador em painel único (remove abas)"
```

---

### Task 7: Verificação visual + revisão

**Files:** nenhuma alteração de código (a não ser ajustes finos de layout).

- [ ] **Step 1: Subir o app localmente contra o docker** (nunca a 3001/produção): seed do módulo de aprendizagem numa org demo, backend numa porta livre com `DATABASE_URL` do docker, frontend apontando pra ele. Ver o skill `verify`/`run`.

- [ ] **Step 2: Comparar** a ficha montada com a "Versão proposta" do mockup — cabeçalho+contadores, os 2 cards, Formação e qualificações (3 estados), treinamentos/competências/eficácia, conscientização no fim. Capturar prints.

- [ ] **Step 3: Confirmar que nada sumiu** — abrir os diálogos de: nova competência, novo treinamento, avaliar eficácia, baixar certificado, novo registro de conscientização, editar dados. Todos devem funcionar como antes.

- [ ] **Step 4: Ajustes finos de layout** conforme a comparação (espaçamento, grid do bloco inferior), commitando cada ajuste.

---

## Self-review

**Cobertura da spec (§3–§9):**
- §3 estrutura (cabeçalho/2 cards/formação/treino+comp+eficácia/conscientização) → Tasks 2, 3, 4, 6.
- §4 componentização em `_components/` → Tasks 2-4 (novos componentes) + Task 6 (orquestração).
- §5 derivações (contadores/tempo/gestor/escolaridade) → Task 1 (puras) + Task 5 (gestor).
- §6 reuso da Fase 1 (`competencyConformance`) → Task 4.
- §7 fora de escopo (sem schema novo, sem agrupamento 1A, CRUD só movido) → respeitado (Task 6 move, não reescreve; nenhuma migração).
- §8 risco/mitigação (componentizar-primeiro, testes antes) → a ordem das tasks (leaf components testados 1-4, restructure só na 6) implementa isso; a "cobertura de fluxos críticos" é validada na Task 7 (abrir cada diálogo) — os diálogos são **movidos** intactos, então o risco real é de layout, coberto pela verificação visual.
- §9 testes (unidade das derivações + render das seções + não-regressão) → Tasks 1-4 (unidade/render) + Task 5 (integração) + Task 6 (typecheck + suíte de render).

**Placeholders:** as Tasks 3 e 6 descrevem a montagem em instruções em vez de código completo — porque são reorganização de um arquivo grande existente (`[id].tsx`, 4.440 linhas) que não cabe colar. As interfaces (nomes de componentes e props) estão definidas verbatim nas Tasks 2-5, então o implementador tem os tipos exatos; o corpo é composição. Tasks 1, 2 e 4 têm código completo.

**Consistência de tipos:** `computeTrainingCounters`/`computeTenure`/`compareEducation` (Task 1) usados com as mesmas assinaturas em Tasks 2 e 4. `FichaHeader`/`DadosCards`/`FormacaoQualificacoes` props definidas nas Tasks 2-4 e consumidas verbatim na Task 6. `employee.managers` definido na Task 5 e consumido na Task 6.

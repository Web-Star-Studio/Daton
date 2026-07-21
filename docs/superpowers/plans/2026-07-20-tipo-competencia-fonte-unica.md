# Tipo da competência com fonte única — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps usam checkbox (`- [ ]`).

**Goal:** O tipo de uma competência passa a ter **uma fonte só — o catálogo**. O requisito do cargo deixa de carregar um tipo próprio que diverge, o que hoje faz o treinamento não provar a competência.

**Architecture:** O backend passa a derivar o `competencyType` do requisito a partir do item de catálogo correspondente (por nome, org-scoped), ignorando o valor enviado pelo cliente quando há catálogo. O formulário de vínculo perde o campo "Tipo". O enum do contrato passa a refletir o CHA que os dados realmente usam. **Sem DDL.**

**Tech Stack:** Express 5 + Drizzle; OpenAPI 3.1 → Orval; React 19 + Vite; Vitest (web-unit + integration).

**Spec:** `docs/superpowers/specs/2026-07-20-tipo-competencia-fonte-unica-design.md`

## Global Constraints

- **Fonte única (verbatim):** o tipo é propriedade da **competência** (catálogo), não do **requisito**. O requisito diz apenas *qual* competência e *em que nível*.
- **Legado preservado:** quando **não** existe item de catálogo correspondente (706 requisitos da carga), preserva-se o tipo já gravado. Não apagar histórico nem inventar valor.
- **Enum do contrato:** passa de `[formacao, experiencia, habilidade]` para **`[conhecimento, habilidade, atitude]`**. Verificado em produção: **0 linhas** usam `formacao`/`experiencia` em qualquer tabela, então nada é invalidado.
- **Sem DDL.** A correção das 11 linhas divergentes é operação de dados **fora das tarefas**, e depende de autorização explícita.
- **NUNCA** `pnpm --filter @workspace/db push` (Neon de PRODUÇÃO). **NUNCA** vitest de integração sem `TEST_ENV=integration`.
- OpenAPI é fonte única de contrato; rodar codegen após editar; **nunca** editar gerados à mão.
- `pnpm typecheck` limpo ao fim de cada tarefa. UI em PT-BR; design system inalterado. Commits em PT-BR, sem dados de produção.

---

## Task 1: Backend — o requisito herda o tipo do catálogo

**Files:**
- Modify: `lib/api-spec/openapi.yaml` (6 ocorrências de `enum: [formacao, experiencia, habilidade]`)
- Modify: `artifacts/api-server/src/routes/employees.ts` (POST do requisito ~2624; PATCH ~2690)
- Test: `artifacts/api-server/tests/tipo-competencia-fonte-unica.integration.test.ts`

**Interfaces:**
- Produces: ao gravar um requisito, `competencyType` é o do item de catálogo casado por `lower(trim(nome))` dentro da organização; sem catálogo, mantém o valor enviado (POST) ou o já gravado (PATCH).

- [ ] **Step 1: Escrever o teste de integração (falhando)**

Criar `artifacts/api-server/tests/tipo-competencia-fonte-unica.integration.test.ts`. **Abra um `*.integration.test.ts` vizinho e copie o padrão real** (`createTestContext({seed})` → `ctx.organizationId`/`ctx.prefix`; `authHeader(ctx)`; `cleanupTestContext` no `afterEach`). Confirme no código a rota real de criação de requisito antes de escrever as URLs.

Casos:

```ts
it("grava o tipo do CATÁLOGO, ignorando o que o cliente enviar", async () => {
  // catálogo: competência "X" como 'conhecimento'
  // POST do requisito enviando competencyType: "habilidade"
  // => o requisito gravado deve ficar 'conhecimento'
});

it("sem item de catálogo, preserva o tipo enviado (legado)", async () => {
  // POST de requisito para um nome que NÃO existe no catálogo, com 'habilidade'
  // => permanece 'habilidade'
});

it("PATCH também realinha ao catálogo", async () => {
  // requisito existente + catálogo 'atitude'
  // PATCH tentando mudar para 'habilidade' => continua 'atitude'
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/tipo-competencia-fonte-unica.integration.test.ts`
Expected: FAIL — o valor enviado é gravado como está.

- [ ] **Step 3: Helper único que resolve o tipo**

Em `routes/employees.ts`, junto das rotas de requisito, criar **um** helper reusado por POST e PATCH (não duplicar a consulta):

```ts
/** O tipo é propriedade da competência (catálogo), não do requisito: casa por
 *  nome dentro da org e devolve o tipo do catálogo. Sem item correspondente
 *  (caso dos requisitos vindos da carga), devolve o fallback recebido — não se
 *  inventa valor nem se apaga o histórico. */
async function resolveCompetencyTypeFromCatalog(
  tx: typeof db,
  organizationId: number,
  competencyName: string,
  fallback: string,
): Promise<string> {
  const [item] = await tx
    .select({ competencyType: competencyCatalogTable.competencyType })
    .from(competencyCatalogTable)
    .where(
      and(
        eq(competencyCatalogTable.organizationId, organizationId),
        sql`lower(trim(${competencyCatalogTable.name})) = lower(trim(${competencyName}))`,
      ),
    )
    .limit(1);
  return item?.competencyType || fallback;
}
```

- [ ] **Step 4: Usar no POST e no PATCH**

- **POST** (~2624): trocar `competencyType: body.data.competencyType` por o resultado do helper, usando `body.data.competencyType` como fallback e o nome já normalizado (`body.data.competencyName.trim()`).
- **PATCH** (~2690): o nome pode não vir no corpo. Use o nome **resultante** (o novo, se enviado; senão o já gravado) e o tipo **atual do registro** como fallback. Realinhe sempre que houver item de catálogo, mesmo que o corpo não traga `competencyType`.

- [ ] **Step 5: OpenAPI — enum para o CHA real**

Trocar as **6** ocorrências de `enum: [formacao, experiencia, habilidade]` por:

```yaml
enum: [conhecimento, habilidade, atitude]
```

Localize com `grep -n "enum: \[formacao, experiencia, habilidade\]" lib/api-spec/openapi.yaml`. Ao fim, esse grep deve retornar **zero**.

- [ ] **Step 6: Codegen**

Run: `pnpm --filter @workspace/api-spec codegen`
Expected: os tipos gerados passam a aceitar `conhecimento`/`atitude`.

- [ ] **Step 7: Rodar teste + typecheck**

Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/tipo-competencia-fonte-unica.integration.test.ts` → PASS.
Run: também as suítes de competência/cargo que existirem (procure por `competency` em `artifacts/api-server/tests/`) → sem regressão.
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 8: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react artifacts/api-server/src/routes/employees.ts artifacts/api-server/tests/tipo-competencia-fonte-unica.integration.test.ts
git commit -m "fix(aprendizagem): tipo do requisito vem do catálogo (fonte única)"
```

---

## Task 2: Frontend — o formulário de vínculo perde o campo "Tipo"

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/cargos/cargo-competencias-tab.tsx`
- Test: `artifacts/web/tests/pages/aprendizagem/cargo-competencias-tipo.unit.test.tsx`

**Interfaces:** Consumes o enum CHA gerado (Task 1).

- [ ] **Step 1: Escrever o teste (falhando)**

O componente hoje é acoplado a hooks de dados. **Extraia o formulário de vínculo** para `cargos/_components/VincularCompetenciaForm.tsx` (apresentacional: recebe `bankItems`, `value`, `onChange`, `onSubmit`) e teste isolado:

```tsx
it("não oferece campo de Tipo", () => {
  // render do formulário
  expect(screen.queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
});

it("mostra o tipo do catálogo da competência escolhida, somente leitura", () => {
  // bankItems: [{ name: "Auditor ISO 14001", competencyType: "conhecimento" }]
  // após escolher a competência => aparece "Conhecimento" como texto, não como campo editável
});

it("ao criar competência nova, pede o tipo (lista CHA)", () => {
  // nome que não existe no banco => aparece o seletor com Conhecimento/Habilidade/Atitude
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/cargo-competencias-tipo.unit.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementar**

- Remover `TYPE_OPTIONS = ["formacao", "experiencia", "habilidade"]` e o `<Select>` de tipo do vínculo (~linha 219).
- `EMPTY_LINK` deixa de ter `competencyType` fixo `"habilidade"`.
- Ao escolher uma competência **existente**, exibir o tipo dela (do catálogo) como **texto**, com `COMPETENCY_TYPE_LABELS`.
- Ao digitar um nome **novo** (criar-na-hora), mostrar um seletor com a lista **CHA** (`conhecimento`/`habilidade`/`atitude`) — aí o tipo é atributo da competência nova. Remover o `competencyType: "habilidade"` fixo da criação (~linha 108) e usar o escolhido.
- No POST do requisito, pode-se continuar enviando `competencyType` (o backend realinha), mas envie o do catálogo/o escolhido — não um padrão.
- A listagem de competências do cargo (~linha 289) continua usando `COMPETENCY_TYPE_LABELS[r.competencyType]`, que agora reflete o catálogo.

- [ ] **Step 4: Rodar testes + typecheck**

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/` → tudo verde (a pasta inteira, não só o arquivo novo).
Run: `pnpm typecheck` → 0 erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src artifacts/web/tests
git commit -m "fix(aprendizagem): vínculo de competência exibe o tipo do catálogo, sem campo próprio"
```

---

## Final

Run: `pnpm exec vitest run --project web-unit artifacts/web/tests/pages/aprendizagem/` → verde.
Run: `TEST_ENV=integration pnpm exec vitest run --project integration artifacts/api-server/tests/tipo-competencia-fonte-unica.integration.test.ts` + suítes de competência/cargo → verde.
Run: `grep -n "enum: \[formacao, experiencia, habilidade\]" lib/api-spec/openapi.yaml` → sem resultados.
Run: `pnpm typecheck` → 0 erros.

**Validar no navegador antes do PR:** cadastrar uma competência como *Conhecimento*, vincular a um cargo e confirmar que aparece **Conhecimento** — e que a ficha de um colaborador com o treinamento correspondente deixa de mostrar lacuna.

## Fora das tarefas — correção de dados (requer autorização)

11 linhas de `position_competency_requirements` divergem do catálogo (7 `atitude`, 4 `conhecimento`, todas gravadas como `habilidade`). O `UPDATE` alinha ao catálogo por nome dentro da organização. **Capturar rollback com os IDs e o valor original antes de aplicar.** Além do badge, isso corrige lacunas falsas: com a chave `nome::tipo` alinhada, o treinamento volta a provar o requisito.

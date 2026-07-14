# Aprendizagem — SP0 (Casca do módulo + reorg de Colaboradores) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover as telas de Colaboradores e treinamentos para um novo módulo "Aprendizagem" no menu, com rotas `/aprendizagem/...` e redirect das URLs antigas — reorg pura de frontend, sem tocar em backend, banco ou permissão.

**Architecture:** Consolida a implementação canônica (hoje em `pages/app/qualidade/colaboradores/`, exposta por shims em `pages/app/organizacao/colaboradores/`) num único diretório `pages/app/aprendizagem/colaboradores/`. Registra rotas novas em `/aprendizagem/colaboradores*` (e variante `/app/...`), adiciona um grupo de navegação "Aprendizagem" no `AppLayout`, e transforma as rotas antigas `/organizacao/colaboradores*` em redirects que preservam `:id`/`:title` e query string.

**Tech Stack:** React 19 + Vite, Wouter 3.9 (`Route`/`Switch`/`Redirect`/`useSearch`), TailwindCSS, lucide-react. Testes: Playwright (`e2e/`), `pnpm typecheck`, `pnpm build`.

## Global Constraints

- **Sem mudança de backend / banco / OpenAPI.** As rotas de API (`/organizations/:orgId/employees/...`) ficam idênticas.
- **Sem mudança de permissão.** Colaboradores continua gateado pelo módulo `employees`. Zero migração de grants.
- **Sem mexer em `contractType` (vínculos).** Fora de escopo do SP0.
- **Nunca rodar o app na porta :3001** (aponta para a PROD Neon). Smoke test em porta de teste (ex.: :3002) + DB docker.
- **Não commitar/pushar sem pedido explícito do usuário** (preferência do CLAUDE.md). Cada task tem um passo de commit — execute o `git add`/`commit` apenas quando o usuário autorizar o fluxo de execução; caso contrário, pare antes do commit e reporte.
- **Estratégia de teste deste SP:** é uma reorg estrutural sem nova lógica de negócio. O feedback rápido é o **`pnpm typecheck`** (o sistema de tipos pega imports/rotas quebradas); a verificação de integração é o **E2E Playwright** (`e2e/quality.employees.spec.ts`, atualizado na Task 5) + **smoke manual**. Não há unidade de lógica nova para testar isoladamente.
- Padrão de imports: alias `@/` → `artifacts/web/src`. Prettier: 2 espaços, aspas duplas, trailing commas.

**Pré-flight (antes da Task 1):** confirmar baseline verde.
```bash
cd /home/jp/daton/Daton/.claude/worktrees/feat-gestao-aprendizagem
pnpm typecheck
```
Esperado: sem erros. Se já houver erro de tipo na base, **pare e reporte** antes de iniciar.

---

## File Structure

**Modificados:**
- `artifacts/web/src/App.tsx` — imports das páginas, rotas novas `/aprendizagem/...`, redirects das antigas, helper `LegacyEmployeesRedirect`.
- `artifacts/web/src/components/layout/AppLayout.tsx` — novo grupo de nav "Aprendizagem"; remoção de Colaboradores de Organização; mapa rota→módulo; breadcrumbs.
- `e2e/quality.employees.spec.ts` — URLs para `/aprendizagem/...` + teste de redirect.

**Movidos (via `git mv`):**
- `pages/app/qualidade/colaboradores/index.tsx` → `pages/app/aprendizagem/colaboradores/index.tsx`
- `pages/app/qualidade/colaboradores/[id].tsx` → `pages/app/aprendizagem/colaboradores/[id].tsx`
- `pages/app/qualidade/colaboradores/treinamentos.tsx` → `pages/app/aprendizagem/colaboradores/treinamentos.tsx`
- `pages/app/qualidade/colaboradores/treinamento-detalhe.tsx` → `pages/app/aprendizagem/colaboradores/treinamento-detalhe.tsx`

**Removidos:**
- `pages/app/organizacao/colaboradores/index.tsx` (shim)
- `pages/app/organizacao/colaboradores/[id].tsx` (shim)
- `pages/app/organizacao/colaboradores/treinamentos.tsx` (shim)
- `pages/app/organizacao/colaboradores/treinamento-detalhe.tsx` (shim)

**Dependências confirmadas:** os únicos importadores dos shims `organizacao/colaboradores` são as 4 linhas de import em `App.tsx`; os únicos importadores de `qualidade/colaboradores` são os 4 shims. Mover é seguro.

---

### Task 1: Consolidar arquivos em `pages/app/aprendizagem/colaboradores/`

Mover a implementação canônica para o diretório do novo módulo e remover a indireção dupla, **sem mudar comportamento** (rotas antigas seguem servindo).

**Files:**
- Create dir + move: `artifacts/web/src/pages/app/aprendizagem/colaboradores/{index,[id],treinamentos,treinamento-detalhe}.tsx`
- Delete: `artifacts/web/src/pages/app/organizacao/colaboradores/{index,[id],treinamentos,treinamento-detalhe}.tsx`
- Modify: `artifacts/web/src/App.tsx` (4 imports, linhas ~20-23, e os identificadores usados nas rotas ~133-146 e ~258-271)

**Interfaces:**
- Produces: componentes default em `@/pages/app/aprendizagem/colaboradores`, `.../[id]`, `.../treinamentos`, `.../treinamento-detalhe`. Identificadores em App.tsx renomeados: `AprendizagemEmployeesPage`, `AprendizagemEmployeeDetailPage`, `AprendizagemEmployeeTrainingsPage`, `AprendizagemTrainingDetailPage`.

- [ ] **Step 1: Mover os 4 arquivos canônicos e remover os 4 shims**

```bash
cd /home/jp/daton/Daton/.claude/worktrees/feat-gestao-aprendizagem
mkdir -p artifacts/web/src/pages/app/aprendizagem/colaboradores
git mv artifacts/web/src/pages/app/qualidade/colaboradores/index.tsx              artifacts/web/src/pages/app/aprendizagem/colaboradores/index.tsx
git mv "artifacts/web/src/pages/app/qualidade/colaboradores/[id].tsx"             "artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx"
git mv artifacts/web/src/pages/app/qualidade/colaboradores/treinamentos.tsx       artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamentos.tsx
git mv artifacts/web/src/pages/app/qualidade/colaboradores/treinamento-detalhe.tsx artifacts/web/src/pages/app/aprendizagem/colaboradores/treinamento-detalhe.tsx
git rm artifacts/web/src/pages/app/organizacao/colaboradores/index.tsx \
       "artifacts/web/src/pages/app/organizacao/colaboradores/[id].tsx" \
       artifacts/web/src/pages/app/organizacao/colaboradores/treinamentos.tsx \
       artifacts/web/src/pages/app/organizacao/colaboradores/treinamento-detalhe.tsx
```

- [ ] **Step 2: Confirmar que os diretórios antigos não têm mais referências**

```bash
grep -rn "pages/app/qualidade/colaboradores\|pages/app/organizacao/colaboradores" artifacts/web/src --include="*.ts" --include="*.tsx"
```
Esperado: **somente** as 4 linhas de import em `App.tsx` (que serão corrigidas no próximo passo). Nenhuma outra.

- [ ] **Step 3: Atualizar imports e identificadores em `App.tsx`**

Substituir o bloco de imports (atual, linhas ~20-23):
```tsx
import OrganizacaoEmployeesPage from "@/pages/app/organizacao/colaboradores";
import OrganizacaoEmployeeTrainingsPage from "@/pages/app/organizacao/colaboradores/treinamentos";
import OrganizacaoTrainingDetailPage from "@/pages/app/organizacao/colaboradores/treinamento-detalhe";
import OrganizacaoEmployeeDetailPage from "@/pages/app/organizacao/colaboradores/[id]";
```
por:
```tsx
import AprendizagemEmployeesPage from "@/pages/app/aprendizagem/colaboradores";
import AprendizagemEmployeeTrainingsPage from "@/pages/app/aprendizagem/colaboradores/treinamentos";
import AprendizagemTrainingDetailPage from "@/pages/app/aprendizagem/colaboradores/treinamento-detalhe";
import AprendizagemEmployeeDetailPage from "@/pages/app/aprendizagem/colaboradores/[id]";
```
Depois, atualizar os 8 usos dos componentes nas rotas existentes (`/organizacao/colaboradores*` em ~133-146 e `/app/organizacao/colaboradores*` em ~258-271): renomear `OrganizacaoEmployeesPage`→`AprendizagemEmployeesPage`, `OrganizacaoEmployeeTrainingsPage`→`AprendizagemEmployeeTrainingsPage`, `OrganizacaoTrainingDetailPage`→`AprendizagemTrainingDetailPage`, `OrganizacaoEmployeeDetailPage`→`AprendizagemEmployeeDetailPage`. (As rotas continuam nos caminhos antigos por enquanto — só os identificadores mudam.)

```bash
# Sanidade: nenhum identificador antigo restante
grep -n "Organizacao\(Employees\|EmployeeTrainings\|TrainingDetail\|EmployeeDetail\)Page" artifacts/web/src/App.tsx
```
Esperado: nenhuma linha.

- [ ] **Step 4: Typecheck verde**

```bash
pnpm typecheck
```
Esperado: sem erros. (Confirma que o move + repointe de imports não quebrou nada e que as rotas antigas seguem servindo os componentes movidos.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(aprendizagem): consolida páginas de colaboradores em pages/app/aprendizagem"
```

---

### Task 2: Registrar rotas `/aprendizagem/colaboradores*` (aditivo)

Adicionar as rotas novas servindo os mesmos componentes. Rotas antigas permanecem (viram redirect só na Task 4), então tudo funciona durante a transição.

**Files:**
- Modify: `artifacts/web/src/App.tsx` (bloco de rotas `<Switch>`)

**Interfaces:**
- Consumes: `AprendizagemEmployeesPage`, `AprendizagemEmployeeDetailPage`, `AprendizagemEmployeeTrainingsPage`, `AprendizagemTrainingDetailPage` (Task 1).
- Produces: rotas funcionais em `/aprendizagem/colaboradores`, `/aprendizagem/colaboradores/treinamentos`, `/aprendizagem/colaboradores/treinamentos/:title`, `/aprendizagem/colaboradores/:id` (e variantes `/app/aprendizagem/...`).

- [ ] **Step 1: Inserir as rotas novas (ordem importa: `treinamentos*` antes de `:id`)**

Logo após o bloco de rotas `/organizacao/colaboradores*` (após a linha `path="/organizacao/colaboradores/:id"` ~145-147), inserir:
```tsx
      <Route
        path="/aprendizagem/colaboradores"
        component={AprendizagemEmployeesPage}
      />
      <Route
        path="/aprendizagem/colaboradores/treinamentos"
        component={AprendizagemEmployeeTrainingsPage}
      />
      <Route
        path="/aprendizagem/colaboradores/treinamentos/:title"
        component={AprendizagemTrainingDetailPage}
      />
      <Route
        path="/aprendizagem/colaboradores/:id"
        component={AprendizagemEmployeeDetailPage}
      />
```
E, espelhando o padrão `/app/...` (após o bloco `/app/organizacao/colaboradores*` ~270-272):
```tsx
      <Route
        path="/app/aprendizagem/colaboradores"
        component={AprendizagemEmployeesPage}
      />
      <Route
        path="/app/aprendizagem/colaboradores/treinamentos"
        component={AprendizagemEmployeeTrainingsPage}
      />
      <Route
        path="/app/aprendizagem/colaboradores/treinamentos/:title"
        component={AprendizagemTrainingDetailPage}
      />
      <Route
        path="/app/aprendizagem/colaboradores/:id"
        component={AprendizagemEmployeeDetailPage}
      />
```

- [ ] **Step 2: Typecheck verde**

```bash
pnpm typecheck
```
Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add artifacts/web/src/App.tsx
git commit -m "feat(aprendizagem): registra rotas /aprendizagem/colaboradores"
```

---

### Task 3: Grupo de navegação "Aprendizagem" + sair de Organização

Adicionar o grupo "Aprendizagem" no sidebar (espelhando a maquinaria de popover existente), remover Colaboradores de Organização, ajustar mapa rota→módulo e breadcrumbs.

**Files:**
- Modify: `artifacts/web/src/components/layout/AppLayout.tsx`

**Interfaces:**
- Consumes: rotas `/aprendizagem/colaboradores` (Task 2); `renderPopover(title, links, open, setOpen, pos, timeoutRef)`, `openPopover`, `closePopover`, `hasModuleAccess`, tipo `NavLink`, tipo `PopoverPosition` (já existentes).
- Produces: item de menu "Aprendizagem › Colaboradores"; breadcrumb branch `/aprendizagem`.

- [ ] **Step 1: Importar o ícone**

No import de `lucide-react` no topo do arquivo, adicionar `GraduationCap` à lista de ícones importados.

- [ ] **Step 2: Adicionar estado, posição, refs e cleanup do popover**

Junto às declarações dos outros popovers (após `const [configuracoesPopover, setConfiguracoesPopover] = useState(false);`, ~linha 78):
```tsx
  const [aprendizagemPopover, setAprendizagemPopover] = useState(false);
```
Junto às posições (após o bloco `orgPopoverPos`, ~linha 82):
```tsx
  const [aprendizagemPopoverPos, setAprendizagemPopoverPos] =
    useState<PopoverPosition>({
      top: 0,
      left: 0,
    });
```
Junto aos refs (após `const organizacaoRef = useRef<HTMLDivElement>(null);`, ~linha 108):
```tsx
  const aprendizagemRef = useRef<HTMLDivElement>(null);
```
Junto aos timeout refs (após o bloco `organizacaoTimeoutRef`, ~linha 116):
```tsx
  const aprendizagemTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
```
No `useEffect` de cleanup que limpa os timeouts (onde aparece `if (organizacaoTimeoutRef.current) { clearTimeout(...); organizacaoTimeoutRef.current = null; }`, ~linha 150), adicionar um bloco análogo:
```tsx
      if (aprendizagemTimeoutRef.current) {
        clearTimeout(aprendizagemTimeoutRef.current);
        aprendizagemTimeoutRef.current = null;
      }
```

- [ ] **Step 3: Mapa rota→módulo — trocar o prefixo de colaboradores**

No array `moduleByPath` (~linha 182), substituir:
```tsx
      { prefix: "/organizacao/colaboradores", module: "employees" },
```
por:
```tsx
      { prefix: "/aprendizagem/colaboradores", module: "employees" },
```

- [ ] **Step 4: Breadcrumbs — adicionar branch `/aprendizagem` e remover de `/organizacao`**

Remover o branch de colaboradores de dentro do `else if (normalizedLocation.startsWith("/organizacao"))` (o bloco `if (normalizedLocation.startsWith("/organizacao/colaboradores")) { ... }`, ~linhas 239-246) — deixando os demais (unidades, departamentos, cargos, swot). O `if` seguinte (`/organizacao/unidades`) vira o primeiro `if` do bloco.

Adicionar um novo `else if` na cadeia de breadcrumbs (por exemplo logo antes de `else if (normalizedLocation.startsWith("/organizacao"))`, ~linha 236):
```tsx
    } else if (normalizedLocation.startsWith("/aprendizagem")) {
      crumbs.push({ label: "Aprendizagem" });

      if (normalizedLocation.startsWith("/aprendizagem/colaboradores")) {
        crumbs.push({
          label: "Colaboradores",
          href: "/aprendizagem/colaboradores",
        });
        if (pageTitle && normalizedLocation !== "/aprendizagem/colaboradores") {
          crumbs.push({ label: pageTitle });
        }
      }
```

- [ ] **Step 5: `aprendizagemLinks` + `showAprendizagem`; remover Colaboradores de `organizacaoLinks`**

Em `organizacaoLinks` (~linhas 377-394), remover o spread de Colaboradores:
```tsx
    ...(hasModuleAccess("employees")
      ? [{ href: "/organizacao/colaboradores", label: "Colaboradores" }]
      : []),
```
Logo após o array `organizacaoLinks`, adicionar:
```tsx
  const aprendizagemLinks: NavLink[] = [
    ...(hasModuleAccess("employees")
      ? [{ href: "/aprendizagem/colaboradores", label: "Colaboradores" }]
      : []),
  ];
```
Junto aos outros flags `show*` (~linha 470, perto de `const showQualidade = qualidadeLinks.length > 0;`):
```tsx
  const showAprendizagem = aprendizagemLinks.length > 0;
```

- [ ] **Step 6: Botão de nav do grupo "Aprendizagem"**

Logo após o `</div>` que fecha o bloco do grupo "Organização" (o `<div ref={organizacaoRef}>...</div>`, ~linha 688), inserir:
```tsx
          {showAprendizagem && (
            <div
              ref={aprendizagemRef}
              onMouseEnter={() =>
                openPopover(
                  aprendizagemRef,
                  setAprendizagemPopoverPos,
                  setAprendizagemPopover,
                  aprendizagemTimeoutRef,
                )
              }
              onMouseLeave={() =>
                closePopover(setAprendizagemPopover, aprendizagemTimeoutRef)
              }
            >
              <Link
                href={aprendizagemLinks[0].href}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors cursor-pointer",
                  isActive("/aprendizagem")
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="flex items-center">
                  <GraduationCap
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isSidebarOpen && "mr-2.5",
                    )}
                  />
                  {isSidebarOpen && <span>Aprendizagem</span>}
                </div>
                {isSidebarOpen && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </Link>
            </div>
          )}
```

- [ ] **Step 7: Render do popover "Aprendizagem"**

Logo após a chamada `renderPopover("Organização", organizacaoLinks, ...)` (~linhas 914-921), inserir:
```tsx
          {renderPopover(
            "Aprendizagem",
            aprendizagemLinks,
            aprendizagemPopover,
            setAprendizagemPopover,
            aprendizagemPopoverPos,
            aprendizagemTimeoutRef,
          )}
```

- [ ] **Step 8: Typecheck verde**

```bash
pnpm typecheck
```
Esperado: sem erros.

- [ ] **Step 9: Commit**

```bash
git add artifacts/web/src/components/layout/AppLayout.tsx
git commit -m "feat(aprendizagem): grupo de navegação Aprendizagem e saída de Colaboradores de Organização"
```

---

### Task 4: Repontar links internos + redirects das URLs antigas

Atualizar os links internos das páginas para `/aprendizagem/...` e transformar as rotas antigas `/organizacao/colaboradores*` em redirects (preservando `:id`/`:title` e query string).

**Files:**
- Modify: `artifacts/web/src/pages/app/aprendizagem/colaboradores/{index,[id],treinamentos,treinamento-detalhe}.tsx`
- Modify: `artifacts/web/src/App.tsx` (helper + redirects)

**Interfaces:**
- Consumes: `Redirect`, `useSearch` de `wouter`; rotas `/aprendizagem/colaboradores*` (Task 2).
- Produces: helper `LegacyEmployeesRedirect`.

- [ ] **Step 1: Repontar os links internos nas 4 páginas**

Em cada um dos 4 arquivos sob `pages/app/aprendizagem/colaboradores/`, substituir **todas** as ocorrências da substring `/organizacao/colaboradores` por `/aprendizagem/colaboradores`. Ocorrências conhecidas (referência; faça replace-all em cada arquivo):
- `index.tsx`: links de treinamentos e de `/${emp.id}` (3 ocorrências)
- `[id].tsx`: `navigate(...)` e `<Link href=...>` de volta à lista (3 ocorrências)
- `treinamentos.tsx`: link da lista, link de gap `/${gap.employeeId}`, link de treinamento `/treinamentos/${title}`, link `?tab=competencias` (4 ocorrências)
- `treinamento-detalhe.tsx`: `navigate(".../treinamentos")` e `<Link href=.../${training.employeeId}>` (2 ocorrências)

```bash
# Verificação: nenhuma referência antiga remanescente nas páginas do módulo
grep -rn "/organizacao/colaboradores" artifacts/web/src/pages/app/aprendizagem
```
Esperado: nenhuma linha.

- [ ] **Step 2: Adicionar o helper `LegacyEmployeesRedirect` em `App.tsx`**

Garantir os imports do wouter (adicionar `Redirect` e `useSearch` ao import existente de `"wouter"`). Definir o helper no nível de módulo (fora do componente de rotas):
```tsx
function LegacyEmployeesRedirect({ to }: { to: string }) {
  const search = useSearch();
  return <Redirect to={search ? `${to}?${search}` : to} replace />;
}
```

- [ ] **Step 3: Trocar as rotas antigas por redirects**

Substituir o bloco de 4 rotas `/organizacao/colaboradores*` (~133-147) por (ordem: `treinamentos*` antes de `:id`):
```tsx
      <Route path="/organizacao/colaboradores">
        <LegacyEmployeesRedirect to="/aprendizagem/colaboradores" />
      </Route>
      <Route path="/organizacao/colaboradores/treinamentos">
        <LegacyEmployeesRedirect to="/aprendizagem/colaboradores/treinamentos" />
      </Route>
      <Route path="/organizacao/colaboradores/treinamentos/:title">
        {(params) => (
          <LegacyEmployeesRedirect
            to={`/aprendizagem/colaboradores/treinamentos/${params.title}`}
          />
        )}
      </Route>
      <Route path="/organizacao/colaboradores/:id">
        {(params) => (
          <LegacyEmployeesRedirect
            to={`/aprendizagem/colaboradores/${params.id}`}
          />
        )}
      </Route>
```
E o bloco análogo `/app/organizacao/colaboradores*` (~258-272) por redirects para `/app/aprendizagem/colaboradores...` (mesma estrutura, com prefixo `/app`).

- [ ] **Step 4: Typecheck verde**

```bash
pnpm typecheck
```
Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add artifacts/web/src/App.tsx artifacts/web/src/pages/app/aprendizagem/colaboradores
git commit -m "feat(aprendizagem): redirects das URLs antigas e links internos para /aprendizagem"
```

---

### Task 5: Atualizar E2E + verificação final

Atualizar o spec Playwright existente para os caminhos novos, adicionar uma asserção de redirect, e rodar a bateria de verificação + smoke.

**Files:**
- Modify: `e2e/quality.employees.spec.ts`

**Interfaces:**
- Consumes: rotas e redirects das Tasks 2 e 4.

- [ ] **Step 1: Atualizar as URLs do spec E2E**

Em `e2e/quality.employees.spec.ts`, substituir as navegações e regex de `/organizacao/colaboradores` por `/aprendizagem/colaboradores`. Ocorrências (referência):
- `goto("/organizacao/colaboradores")` (2x) → `/aprendizagem/colaboradores`
- regex `/\/organizacao\/colaboradores\/\d+$/` → `/\/aprendizagem\/colaboradores\/\d+$/`
- regex `/\/organizacao\/colaboradores\/treinamentos$/` → `/\/aprendizagem\/colaboradores\/treinamentos$/`
- `RegExp(\`/organizacao/colaboradores/${employee.id}\`)` → `/aprendizagem/...`
- `goto("/organizacao/colaboradores/treinamentos")` → `/aprendizagem/...`
- `goto(\`/organizacao/colaboradores/${employee.id}?tab=conscientizacao\`)` → `/aprendizagem/...`

```bash
grep -n "organizacao/colaboradores" e2e/quality.employees.spec.ts
```
Esperado: nenhuma linha após a edição.

- [ ] **Step 2: Adicionar teste de redirect (preserva query)**

Adicionar um `test` que valida o redirect da URL antiga para a nova, preservando a query:
```ts
test("redireciona URLs antigas de colaboradores para /aprendizagem", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/organizacao/colaboradores");
  await expect(authenticatedPage).toHaveURL(/\/aprendizagem\/colaboradores$/);
});
```
(Seguir o padrão de fixtures/autenticação já usado no arquivo — usar o mesmo `authenticatedPage` e helpers existentes.)

- [ ] **Step 3: Verificação final**

```bash
pnpm typecheck
pnpm --filter @workspace/web build
```
Esperado: ambos sem erros.

E2E (se o ambiente de teste — `DATABASE_URL`/`JWT_SECRET` + portas — estiver disponível):
```bash
pnpm exec playwright test e2e/quality.employees.spec.ts
```
Esperado: verde. (Se o ambiente E2E não estiver disponível na sessão, registrar isso e cobrir via smoke manual.)

- [ ] **Step 4: Smoke manual (porta de teste, NUNCA :3001)**

Subir web+api numa porta de teste (ex.: web :4173/:3002, api :3002) apontando para DB docker e validar o checklist de aceitação (abaixo). Documentar o resultado.

- [ ] **Step 5: Commit**

```bash
git add e2e/quality.employees.spec.ts
git commit -m "test(aprendizagem): e2e nas rotas /aprendizagem + asserção de redirect"
```

---

## Checklist de aceitação (Definition of Done)

- [ ] Grupo "Aprendizagem" no sidebar com "Colaboradores"; Colaboradores removido de "Organização".
- [ ] `/aprendizagem/colaboradores`, `/.../:id`, `/.../treinamentos`, `/.../treinamentos/:title` servindo as telas (e variantes `/app/...`).
- [ ] URLs antigas `/organizacao/colaboradores*` (e `/app/...`) redirecionando, preservando `:id`/`:title` e query string.
- [ ] Implementação consolidada em `pages/app/aprendizagem/colaboradores/`; shims e diretório `qualidade/colaboradores` removidos; nenhum import órfão.
- [ ] Permissão `employees` inalterada e gateando (usuário sem o módulo não vê o item nem acessa a rota).
- [ ] Breadcrumbs "Aprendizagem / Colaboradores / …"; links internos apontando para `/aprendizagem`.
- [ ] `pnpm typecheck` e `pnpm --filter @workspace/web build` limpos.
- [ ] E2E atualizado verde (ou smoke manual documentado se o ambiente E2E não estiver disponível).
- [ ] Nenhuma alteração em backend, banco ou `contractType`.

---

## Self-review (preenchido pelo autor do plano)

- **Cobertura do spec:** grupo/URL (Tasks 2,3) ✓; mover Colaboradores (Tasks 1,3) ✓; redirects (Task 4) ✓; reaproveitar permissão `employees` (Task 3, mapa rota→módulo) ✓; consolidação de arquivos (Task 1) ✓; sem backend/contractType (Global Constraints) ✓; validação typecheck/build/smoke (Task 5) ✓. "Cargos fica em Organização" — respeitado (nenhuma task move Cargos).
- **Placeholders:** nenhum "TBD"; todos os passos de código têm o código exato.
- **Consistência de tipos/nomes:** identificadores `Aprendizagem*Page` definidos na Task 1 e usados nas Tasks 2; `aprendizagem*` (popover/ref/links/flag) definidos e usados de forma consistente na Task 3; `LegacyEmployeesRedirect` definido e usado na Task 4. `renderPopover`/`openPopover`/`closePopover` reaproveitados com a assinatura existente.

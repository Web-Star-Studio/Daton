# Gestão de Aprendizagem — SP1: Catálogo de treinamentos + banco de competências

**Data:** 2026-06-30
**Branch:** `feat/gestao-aprendizagem`
**Status:** Spec aprovado para virar plano de implementação
**Escopo:** apenas o **SP1**. Ver a iniciativa e a decomposição SP0–SP6 em `2026-06-30-aprendizagem-sp0-modulo-reorg-design.md`.
**Pré-requisito:** SP0 (módulo "Aprendizagem" + Colaboradores movido) — concluído na mesma branch.

---

## 1. Contexto

Hoje, no código:
- **Treinamentos** existem só como **registro por-colaborador** (`employee_trainings`), com `title` texto-livre. A listagem "organização" agrupa por `title` em memória — um pseudo-catálogo. Não há definição reutilizável.
- **Competências** são **texto-livre** em todo lugar (`employee_competencies.name`, `position_competency_requirements.competencyName`). Não existe catálogo de competências.
- O único catálogo gerenciável do domínio é o **SWOT perspectives** (`swot_perspectives`) — que é o **padrão de referência** para "catálogo sobre campo texto-livre".

O SP1 introduz as duas camadas de **definição reutilizável** que o mockup pressupõe: o **catálogo de treinamentos** (alimenta SP2/obrigatoriedades e SP3/turmas) e o **banco de competências** (melhora a matriz de competências existente).

## 2. Objetivo e não-objetivos

**Objetivo:** criar o catálogo de treinamentos e o banco de competências como dados de referência org-level, com UI de gestão, integrados de forma aditiva (bridge) ao que já existe — sem quebrar registros/competências texto-livre atuais.

**Não-objetivos (fora do SP1):**
- Obrigatoriedades / auto-vínculo (SP2), Turmas (SP3), PAT (SP4), Eficácia/Minha área (SP5), Dashboard/Indicadores (SP6).
- A tela rica "Cargos e competências" do mockup (SP posterior) — o SP1 entrega o **dado + painel de gestão + criação inline**, não a tela dedicada.
- Migração de dado: registros e competências texto-livre existentes **não** são convertidos.
- Expansão de `contractType` (adiada, conforme SP0).

## 3. Modelo de dados

### 3.1. `training_catalog` (nova, org-level)

Em `lib/db/src/schema/` (arquivo novo `training-catalog.ts` ou dentro de `employees.ts` — decidir no plano por coesão; preferência: arquivo próprio re-exportado pelo index).

| Coluna | Tipo | Nulo | Notas |
|---|---|---|---|
| id | serial PK | não | |
| organizationId | integer FK → organizations.id (cascade) | não | |
| title | text | não | |
| category | text | sim | Reunião/Integração/Reciclagem/Capacitação/Certificação (texto, não enum no banco) |
| modality | text | sim | Presencial/EAD/Híbrido/Externo |
| norm | text | sim | ex.: "ISO 39001 §7.2" |
| clause | text | sim | ex.: "§7.2", "NR-35" |
| workloadHours | integer | sim | horas (espelha `employee_trainings.workloadHours`) |
| validityMonths | integer | sim | null = sem validade |
| isMandatory | boolean | não | default false |
| status | text | não | default 'ativo' (ativo/rascunho/inativo) |
| targetCompetencyName | text | sim | link p/ competência (texto-livre/catálogo) |
| targetCompetencyType | text | sim | C-H-A (ver §6) |
| targetCompetencyLevel | integer | sim | 0–5 |
| defaultInstructor | text | sim | instrutor/responsável padrão |
| objective | text | sim | |
| programContent | text | sim | conteúdo programático |
| evaluationMethod | text | sim | |
| createdAt / updatedAt | timestamptz | não | defaultNow + $onUpdate |

> Sub-hora (ex.: "30 min" da reunião matinal) fica representado em `workloadHours` inteiro (0/1); precisão sub-hora é follow-up menor, não bloqueia o SP1.

### 3.2. `competency_catalog` (nova, org-level)

| Coluna | Tipo | Nulo | Notas |
|---|---|---|---|
| id | serial PK | não | |
| organizationId | integer FK → organizations.id (cascade) | não | |
| name | text | não | |
| competencyType | text | sim | C-H-A: conhecimento/habilidade/atitude (ver §6) |
| category | text | sim | técnica/comportamental/sso/qualidade/ambiental |
| norm | text | sim | |
| isMandatory | boolean | não | default false |
| createdAt / updatedAt | timestamptz | não | |

Índice **único case-insensitive** em `(organizationId, lower(name))` — idêntico ao `swot_perspectives`.

### 3.3. `employee_trainings.catalogItemId` (coluna nova)

`integer`, **nullable**, FK → `training_catalog.id` com `onDelete: set null`. Registros existentes ficam `null`. É um **link leve** (rastreabilidade/agrupamento), não fonte de leitura ao vivo (ver §4).

## 4. Relação catálogo ↔ registro — *snapshot na criação*

Decisão: o catálogo **define**; ao lançar um treino para um colaborador a partir de um item do catálogo, os campos do template são **copiados (snapshot)** para o `employee_trainings` (title, objective, description, institution→defaultInstructor, targetCompetency*, evaluationMethod, workloadHours, e `validityMonths`→`renewalMonths` com `expirationDate` calculada de `completionDate`). O `catalogItemId` fica como vínculo.

- O registro **não lê ao vivo** do catálogo → editar/inativar/excluir um item do catálogo **não altera o histórico** já lançado (evidência autocontida p/ auditoria; mesmo princípio das revisões da matriz de competências).
- Excluir um item do catálogo faz `catalogItemId` virar `null` nos registros que o referenciavam (FK set null); o snapshot permanece.

## 5. Banco de competências — padrão `swot_perspectives` (reaproveitado)

Mecânica idêntica ao catálogo de perspectivas SWOT (`artifacts/api-server/src/routes/swot/index.ts`), adaptada para competências:

- **POST idempotente:** trim do `name`; match case-insensitive; se existe, retorna **200** com o registro existente; senão, insert com `onConflictDoNothing` (à prova de corrida) → **201**. (Campos extras — type/category/norm/isMandatory — preenchidos na criação; idempotência é pela `name`.)
- **PATCH (rename/edição):** valida unicidade case-insensitive; ao renomear, **propaga** o novo nome para os usos texto-livre: `employee_competencies.name` **e** `position_competency_requirements.competencyName` (update case-insensitive pelo nome antigo). Edição de type/category/norm/isMandatory não propaga (são metadados só do catálogo).
- **DELETE:** remove só do catálogo; o texto nos registros é preservado.
- **Criação inline:** `SearchableSelect` com `onCreateOption` nos diálogos de competência (requisito de cargo e competência do colaborador), chamando o POST idempotente — exatamente como o SWOT faz no diálogo de fator.
- **Painel de gestão:** componente estilo `PerspectivesPanel` (add + lista com contagem de uso + rename inline + delete com confirmação), ancorado na área **Matriz** de `treinamentos.tsx` (aba/seção). **Não** é tela nova.

## 6. Vocabulário de tipo de competência (C-H-A)

O catálogo adota **C-H-A do mockup**: `competencyType ∈ {conhecimento, habilidade, atitude}`. O código atual usa outros valores texto-livre (`formacao/experiencia/habilidade` em `employee_competencies`; default `habilidade` na matriz). Como o catálogo é **aditivo** e os campos seguem texto-livre, **não há migração forçada**; valores antigos coexistem. O catálogo só padroniza o que for criado/escolhido por ele daqui pra frente.

## 7. API / contrato

Fonte da verdade: `lib/api-spec/openapi.yaml`. Novas tags: **`training-catalog`** e **`competency-catalog`**.

**Training catalog** (org-scoped; `requireAuth`; mutações com `requireWriteAccess`):
- `GET /organizations/:orgId/training-catalog` — lista; filtros `search, norm, category, modality, status` (default lista todos os status na gestão; o consumo em telas pode filtrar `status=ativo`).
- `POST /organizations/:orgId/training-catalog` — cria (duplicar = front envia campos copiados).
- `GET /organizations/:orgId/training-catalog/:id` — ficha.
- `PATCH /organizations/:orgId/training-catalog/:id` — edita.
- `DELETE /organizations/:orgId/training-catalog/:id` — exclui (FK `set null` nos registros).

**Competency catalog** (mesma proteção; padrão SWOT):
- `GET /organizations/:orgId/competency-catalog` — lista (com contagem de uso).
- `POST /organizations/:orgId/competency-catalog` — **idempotente**.
- `PATCH /organizations/:orgId/competency-catalog/:id` — edita/renomeia (propaga).
- `DELETE /organizations/:orgId/competency-catalog/:id` — remove do catálogo.

Após editar o `openapi.yaml`: **codegen** (Orval gera zod em `lib/api-zod` e hooks em `lib/api-client-react`). **Nunca** editar gerados.

### 7.1. Codegen sem `ruby` (restrição de ambiente)

`ruby` está **ausente** neste ambiente (só `python3`). O script `pnpm --filter @workspace/api-spec codegen` usa `ruby` e **falha**. O plano deve usar um caminho equivalente em `python3`:
1. YAML→JSON: `python3 -c 'import yaml,json,sys; json.dump(yaml.safe_load(open("openapi.yaml")), open(".openapi.codegen.json","w"), indent=2)'` (verificar PyYAML; se ausente, instalar no venv ou usar parser alternativo).
2. `orval --config ./orval.config.ts` (via `pnpm --filter @workspace/api-spec exec orval ...`).
3. Pós-processo (remover linhas `./generated/types` de `lib/api-zod/src/index.ts`) em `python3`/node.
4. Limpar `.openapi.codegen.json`.
O plano valida que os arquivos gerados batem com o contrato (sem editar à mão).

## 8. Telas / UX

1. **Catálogo** — tela nova em `/aprendizagem/catalogo` + item no menu Aprendizagem (mesma maquinaria de nav do SP0). Grid de cards com filtros (norma/categoria/modalidade); **ficha** (modal, read-only + ações); **novo/duplicar** (modal de formulário). Botão "Abrir turma" da ficha fica **oculto/desabilitado** até o SP3.
2. **Form de lançar treino** (`TrainingAdminForm` em `treinamentos.tsx`): adiciona seletor de **item do catálogo** (SearchableSelect) que pré-preenche os campos do template e grava `catalogItemId` + snapshot; texto-livre segue válido (inline-create no catálogo).
3. **Banco de competências:** painel de gestão (estilo `PerspectivesPanel`) na área Matriz + criação inline nos diálogos de competência (requisito de cargo e competência do colaborador).

## 9. Bridge / sem migração

- `catalogItemId` nullable; registros atuais seguem `null` e funcionam igual.
- Competências texto-livre seguem válidas; o catálogo é opcional/aditivo.
- Nenhuma alteração destrutiva; `drizzle push` só adiciona 2 tabelas + 1 coluna. (Atenção ao drift conhecido: aplicar via DDL cirúrgico se necessário, nunca push puro de branch atrasada.)

## 10. Validação / testes

- **Backend (integração, Vitest `node-unit`/`integration`):** CRUD do training_catalog; idempotência do POST de competency_catalog; propagação de rename para `employee_competencies` e `position_competency_requirements`; delete remove só do catálogo; snapshot ao criar `employee_training` a partir de item do catálogo (campos copiados + `catalogItemId` setado); `expirationDate` calculada de `validityMonths`.
- **Frontend (Vitest `web-unit`):** render do catálogo (cards/filtros), form de novo/duplicar, inline-create de competência (mock dos hooks).
- **Contrato:** `pnpm typecheck` limpo após codegen; hooks gerados existem e tipam.
- **E2E (pré-PR, DB de teste seguro):** criar item no catálogo → lançar treino a partir dele → registro carrega o snapshot + link.
- **Build:** `pnpm --filter @workspace/web build` limpo.

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| `codegen` com ruby falha | Caminho python3 documentado (§7.1); validar PyYAML antes |
| Rename de competência com muitos usos | Update case-insensitive em 2 tabelas, em transação; testar com dados |
| `drizzle push` apontar p/ PROD / drift | DDL cirúrgico aditivo; nunca push puro; validar em DB docker |
| Divergência de vocabulário C-H-A | Aditivo, sem migração; coexiste com texto-livre (§6) |
| Snapshot duplicar dados | Aceito por design (evidência autocontida); catalogItemId mantém rastreio |

## 12. Critérios de aceitação (DoD do SP1)

- [ ] Tabelas `training_catalog` e `competency_catalog` criadas; `employee_trainings.catalogItemId` (FK set null) adicionada.
- [ ] Endpoints CRUD de training-catalog e competency-catalog no `openapi.yaml`, com zod + hooks gerados (codegen via python3).
- [ ] Tela **Catálogo** em `/aprendizagem/catalogo` (cards, filtros, ficha, novo/duplicar) no menu Aprendizagem.
- [ ] Form de lançar treino consegue selecionar item do catálogo (pré-preenche + grava `catalogItemId` + snapshot).
- [ ] Banco de competências: POST idempotente, rename com propagação (employee + matriz), delete só do catálogo, criação inline + painel de gestão na área Matriz.
- [ ] Registros e competências texto-livre existentes intactos (bridge).
- [ ] `pnpm typecheck` + `pnpm --filter @workspace/web build` limpos; testes de integração e unidade verdes.

## 13. Follow-ups (registrados, fora do SP1)

- SP2 — Obrigatoriedades (consome o training_catalog).
- Tela "Cargos e competências" do mockup (consome o competency_catalog) — SP posterior.
- Precisão sub-hora de carga horária no catálogo.
- Propagar rename de competência também para `training_catalog.targetCompetencyName` / `employee_trainings.targetCompetencyName` (se desejado).

# Documentação — conteúdo autorado na plataforma (v1)

- **Data:** 2026-06-15
- **Módulo:** Qualidade → Documentação (`/app/qualidade/documentacao`) — controle de documentos ISO 9001 §7.5
- **Protótipo de referência:** `iso_doc_control_system.html` (raiz do repo)
- **Status:** design aprovado em brainstorming; aguardando revisão do spec antes do plano de implementação

## 1. Problema / objetivo

Hoje o **corpo do documento é um arquivo enviado** (Word/PDF) guardado em `documentAttachmentsTable` (S3/R2). A plataforma só guarda **metadados** (título, tipo, status, validade, requisitos normativos) e um **fluxo rico** (elaboração → análise crítica → aprovação → distribuição → ciência). Não existe autoria de conteúdo na plataforma, editor de texto rico, nem seções ISO estruturadas.

A ideia é **trazer as etapas/o conteúdo para dentro da plataforma**: as informações principais do documento passam a ser **redigidas e visualizadas no próprio sistema**, em seções estruturadas. O arquivo enviado deixa de ser a fonte de verdade e vira **anexo suplementar opcional** (mantido). Todo o fluxo de workflow atual é **preservado** — este trabalho é **aditivo**, não uma reescrita.

## 2. Estado atual (resumo do levantamento)

- **DB** (`lib/db/src/schema/documents.ts`): `documentsTable` tem `title, type, status, currentVersion, normativeRequirements (text[]), validityDate, createdById` — **sem coluna de conteúdo**. Conteúdo vive em `documentAttachmentsTable` (`fileName, objectPath, versionNumber, ...`). `documentVersionsTable` registra **uma linha por versão aprovada** (`versionNumber, changeDescription, changedFields, changedById, createdAt`). Tabelas auxiliares: unidades, elaboradores, revisores críticos, aprovadores, destinatários/grupos, referências.
- **API** (`artifacts/api-server/src/routes/documents.ts`): CRUD + ações de workflow (submit, approve, reject, acknowledge, critical-analysis/complete) + anexos + versões. Nenhum campo de corpo/conteúdo.
- **Frontend**: lista + wizard de criação (4 passos: Básico, Responsáveis, Escopo, Anexos) em `index.tsx` e `novo.tsx`; detalhe `[id].tsx` com abas Info / Anexos / Versões / Fluxo. **Sem editor de texto rico.**
- **Tipos de documento** (enum em texto): `manual, procedimento, instrucao, formulario, registro, politica, outro`.
- **Deps já presentes** (web): `react-markdown`, `jspdf`, `jspdf-autotable`. **Ausentes:** editor de texto rico, DOMPurify.
- **Codegen:** OpenAPI em `lib/api-spec/openapi.yaml` é a fonte; `pnpm --filter @workspace/api-spec codegen` gera zod + hooks.

## 3. Decisões (tomadas no brainstorming)

| # | Decisão | Escolha |
|---|---|---|
| D1 | Estrutura das seções | Template **por tipo**, **editável por documento** (add/renomear/reordenar/remover) |
| D2 | Origem dos templates | **Fixos no código (v1)**; configurável por org fica para fase 2 |
| D3 | Histórico de conteúdo | **Snapshot por revisão aprovada**, relegível; **sem diff** no v1 |
| D4 | Superfície de edição | **Tela dedicada** (o wizard continua criando metadados) |
| D5 | Armazenamento | **Abordagem A** — `contentSections` jsonb no documento + snapshot jsonb por revisão |
| D6 | Formato/editor | **Markdown** + toolbar leve; render com `react-markdown` (sem XSS, sem dep pesada) |
| D7 | Extras v1 | **Código + identificação ISO** (código, área, norma aplicável) · **Exportar PDF baixável** |
| D8 | Export PDF | **`.pdf` baixável client-side via `jspdf`** (renderizador markdown limitado), 1 clique |
| D9 (default) | Unicidade do código | Índice único `(organization_id, code)` (NULLs convivem) |
| D10 (default) | Salvar no editor | **Salvar explícito** + guarda de alterações não salvas (sem autosave no v1) |

## 4. Modelo de dados

### 4.1 `documentsTable` (conteúdo de trabalho atual) — novas colunas
- `code text` (nulo) — identificador ISO, ex.: `IT-LOG-001`.
- `area text` (nulo) — área/setor.
- `applicableNorm text` (nulo) — norma aplicável (ex.: `ISO 9001`, `ISO 14001`, `ISO 39001`, `Múltiplas`).
- `contentSections jsonb` default `'[]'` — array ordenado de seções:
  ```ts
  type DocumentContentSection = {
    id: string;        // uuid/curto, estável p/ reordenar
    title: string;     // 1..200 chars
    body: string;      // markdown (subset da toolbar)
    order: number;     // 0-based
  };
  ```
- **Índice único** `(organization_id, code)` — Postgres trata `NULL` como distinto, então múltiplos documentos sem código coexistem. (drizzle-kit push)

### 4.2 `documentVersionsTable` (snapshot por revisão) — novas colunas
- `contentSections jsonb` — cópia **congelada** do conteúdo no momento da aprovação da revisão.
- `metaSnapshot jsonb` — `{ title, code, area, applicableNorm, normativeRequirements }` congelados, para reler a revisão obsoleta fielmente (ISO §7.5 — retenção de obsoletos).

Sem tabelas novas. A linha de versão **já é criada** hoje na aprovação; só passamos a preencher esses dois campos nesse mesmo ponto.

### 4.3 Migração de dados existentes
- Documentos atuais ficam com `contentSections = []` e identificação nula; mantêm seus anexos. **Sem ETL.**
- O editor mostra estado vazio com botão **"Aplicar template do tipo"** para o doc adotar a estrutura sob demanda.

## 5. Templates por tipo (fixos no código — v1)

`artifacts/api-server/src/services/documents/section-templates.ts`: mapa `type → string[]` (títulos), usado para **semear** `contentSections` na **criação** do documento.

Padrões iniciais (tunáveis):
- **procedimento / instrucao:** Objetivo · Aplicação · Definições e Referências · Sequência, Interação, Recursos e Monitoramento · Responsabilidade pelo Processo · Procedimento
- **politica:** Objetivo · Abrangência · Diretrizes · Responsabilidades · Referências
- **manual:** Apresentação · Escopo do SGI · Referências Normativas · Termos e Definições · Descrição do Sistema
- **formulario / registro:** Instruções de Preenchimento
- **outro:** uma seção em branco ("Conteúdo")

Cada seção semeada nasce com `body` vazio. **Trocar o tipo depois NÃO mexe no conteúdo** (evita clobber). Docs sem seções (existentes ou tipo trocado) podem usar "Aplicar template do tipo" no editor.

## 6. API (Express — `routes/documents.ts` + `services/documents/`)

- **Create/Update body:** `+ code, area, applicableNorm`. Na **criação**, o servidor **semeia** `contentSections` pelo template do `type` (o corpo não vem no body de criação).
- **`PUT /organizations/:orgId/documents/:docId/content`** — `{ contentSections }`. Substitui o conteúdo de trabalho. Permitido só quando `status ∈ {draft, rejected}` e o usuário tem `canEdit`.
  - Validação Zod: array com ≤ 50 seções; cada `title` 1..200; `body` markdown ≤ ~100 000 chars; `order` int ≥ 0. Sem HTML cru (o `react-markdown` não renderiza HTML por padrão; não habilitar `rehype-raw`).
- **`GET /organizations/:orgId/documents/:docId/versions/:versionNumber`** — devolve o snapshot congelado (`contentSections` + `metaSnapshot`) da revisão, para a visão de leitura de versões obsoletas.
- **Aprovação:** no serviço onde a linha de `documentVersionsTable` já é criada, **copiar** `contentSections` (do documento) + montar `metaSnapshot` para o snapshot da versão.

## 7. OpenAPI + clients gerados

Atualizar `lib/api-spec/openapi.yaml`:
- `DocumentDetail`, `CreateDocumentBody`, `UpdateDocumentBody`: `+ code, area, applicableNorm`; `DocumentDetail` `+ contentSections`.
- Novos schemas: `DocumentContentSection`, `UpdateDocumentContentBody`.
- Endpoint de conteúdo (`PUT .../content`) e de snapshot de versão (`GET .../versions/{n}`), com `DocumentVersion` `+ contentSections, metaSnapshot`.

Rodar `pnpm --filter @workspace/api-spec codegen` (zod + hooks). **Nunca editar arquivos gerados à mão.** (Codegen precisa de `python3`.)

## 8. Frontend

- **Wizard / `novo.tsx`:** campos **código, área, norma aplicável** na etapa Identificação.
- **Detalhe `[id].tsx`:**
  - Info: exibe código/área/norma + **prévia do conteúdo** (render markdown) e botão **"Editar conteúdo"** → tela dedicada.
  - Versões: clicar numa revisão abre a **leitura do snapshot** congelado daquela revisão.
  - Botão **"Exportar PDF"** (ver §9).
- **Tela dedicada nova** — rota `/app/qualidade/documentacao/:id/conteudo`:
  - Painel de seções: adicionar / renomear / reordenar (subir/descer) / remover; botão "Aplicar template do tipo" quando vazio.
  - Editor markdown por seção: `textarea` + toolbar (negrito, itálico, lista, lista numerada) que insere markdown, como no protótipo.
  - **Preview ao vivo** com `react-markdown`.
  - **Salvar explícito** (`PUT .../content`) + **guarda de alterações não salvas** (bloqueia navegação com pendência). Sem autosave no v1 — evita a classe de bug do PR #94 (ações).
  - **Read-only** quando `status ∉ {draft, rejected}` ou papel `analyst`.
- **Visão de leitura/impressão:** render limpo das seções com cabeçalho ISO (código · título · rev · aprovado por · data). Reusada para tela e como base do PDF.
- **Componentes novos:** `MarkdownSectionEditor`, `DocumentContentReader` (reaproveitando `react-markdown`).

## 9. Exportar PDF (baixável, 1 clique)

- **Client-side via `jspdf`** (já instalado — sem dep nova). Botão **"Exportar PDF"** gera e baixa o arquivo: `documento.save("<code|titulo>-rev<NN>.pdf")`.
- **Renderizador de markdown limitado** ao que a toolbar produz: cabeçalho ISO, títulos de seção, parágrafos, **negrito/itálico**, listas com marcador e numeradas, numeração de página. Texto **selecionável** (não rasterizado).
- **Fora do v1:** markdown complexo (tabelas, imagens) e geração server-side de alta fidelidade — a toolbar do v1 não gera esses casos. Revisitar com PDF server-side se necessário.

## 10. Permissões / workflow

- Edição de conteúdo segue o `canEdit` atual (operator/org_admin; analyst read-only; só `draft`/`rejected`).
- Snapshot ocorre no caminho de aprovação **já existente**.
- **Nada muda** em papéis ou permissões de módulo.

## 11. Testes

- **node-unit:** schema de validação de `contentSections`; seeding de seções por tipo; lógica de snapshot-on-approval (nível de serviço).
- **integration (DB de teste):** criar documento → semeia seções; `PUT content` → persiste; aprovar → snapshot copiado para a versão; `GET versions/:n` → devolve cópia congelada; edição bloqueada fora de `draft`/`rejected`.
- **web-unit:** `MarkdownSectionEditor` (add/remove/reorder); `DocumentContentReader` renderiza markdown; guarda de não-salvo dispara.
- Seguir os helpers existentes (`tests/support/backend.ts`, `createTestContext()`).

## 12. Fora do escopo (fase 2+)

- Tratativa de Registros (§7.5.3) — campos estruturados de retenção/descarte.
- Templates configuráveis por organização (tela de admin).
- Diff visual entre revisões.
- PDF server-side de alta fidelidade.
- Comentários/colaboração por seção.

## 13. Fatiamento incremental (entrega iterativa)

1. **Base de dados + conteúdo:** colunas novas (`code, area, applicableNorm, contentSections`; snapshot na `documentVersionsTable`) + seeding por template + `PUT .../content` + OpenAPI/codegen + snapshot-on-approval.
2. **Identificação ISO:** campos código/área/norma no create/edit + exibição no detalhe.
3. **Editor:** tela dedicada (seções + markdown + preview + salvar/guarda).
4. **Leitura + histórico:** visão de leitura + leitura de snapshot por revisão.
5. **Export PDF:** `.pdf` baixável via jspdf.

Cada fatia é entregável e testável isoladamente.

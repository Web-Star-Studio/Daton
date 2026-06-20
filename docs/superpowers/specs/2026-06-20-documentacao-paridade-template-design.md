# Documentação — Paridade com o template da cliente (v2)

**Data:** 2026-06-20
**Branch:** `feat/documentacao-conteudo-na-plataforma`
**Contexto:** O v1 trouxe o conteúdo ISO para dentro da plataforma (seções Markdown, editor, leitura, snapshot por revisão, export PDF). A cliente idealizou um protótipo (`iso_doc_control_system.html`) e o ideal é que o módulo **se assemelhe** a ele — a forma anterior (só upload de arquivo) não agradava. Este documento fecha o escopo das diferenças que faltam para ficar **parelho** com o template.

## Objetivo

Aproximar o módulo Qualidade→Documentação do protótipo em **fidelidade visual** e **padronização de campos**, sem regredir o motor já validado (PUT content com lock/atomicidade, snapshot na aprovação, 409 de código duplicado, etc.).

## Decisões já tomadas (com o usuário)

- **Editor:** mantém **Markdown** (textarea + preview). NÃO migrar para WYSIWYG.
- **Controle de versão:** mantém **automático** na aprovação (com snapshot congelado). NÃO adicionar a tabela de revisões manual do protótipo — é mais aderente à ISO e evita digitação inconsistente.
- **Norma:** lista fixa por ora (**ISO 9001 / 14001 / 39001**) + valor livre ("Outra").
- **Conteúdo:** editável **na aba do wizard de criação E na página dedicada** (que já existe).
- **Área/Setor:** selecionar de uma lista (Departamentos), não texto livre.

## Escopo (in)

### 1. Padronização de campos do passo "Básico" (front-end)

Hoje (`index.tsx` e `[id].tsx`): Área/Setor e Norma são `<input>` de texto livre; Tipo é `<select>` nativo. Evidência do problema: na org demo, com 7 Departamentos cadastrados, o único `area` preenchido é **"Logiadoa"** (typo de "Logística").

- **Área / Setor** → `SearchableStringSelect` com `options` = nomes dos Departamentos (`useListDepartments`). Continua sendo gravado como **string** na coluna `documents.area` (consistente com o `metaSnapshot.area`, que já é string; sem migração de schema). O componente já exibe valores legados via `showLegacy` (ex.: "Logiadoa" aparece em docs antigos, mas novas edições só escolhem da lista). Empty-state: se a org não tem Departamentos, mostrar dica para cadastrá-los.
- **Tipo** → `SearchableStringSelect` com `options` = rótulos de `TYPE_LABELS` (substitui o `<select>` nativo), mapeando **rótulo ↔ chave** (a UI mostra "Procedimento", o payload envia `procedimento`). Mantém o `type` (chave) no payload e no `seedSectionsForType`.
- **Norma aplicável** → `SearchableStringSelect` com `options` = `["ISO 9001:2015", "ISO 14001:2015", "ISO 39001:2012"]`; aceita valor livre (Outra) — `showLegacy`/entrada custom cobre casos fora da lista. Gravado em `documents.applicableNorm` (string, sem mudança de schema).

Aplicar os mesmos selects no **modal de criação** (`index.tsx`) e no **diálogo de edição** (`[id].tsx`).

### 2. Conteúdo dentro do wizard de criação (front-end + 1 ajuste de API)

- Extrair o editor de seções de `conteudo.tsx` para um componente reutilizável **`components/documents/document-section-editor.tsx`** (lista de `SectionCard` + ações add/renomear/reordenar/remover, toolbar Markdown + preview). Usado tanto pela **página dedicada** quanto pela nova **aba do wizard** (DRY — remove a duplicação atual do ramo somente-leitura também).
- Nova etapa **"Conteúdo"** no wizard. Ao entrar, inicializa as seções a partir de `seedSectionsForType(type)` (cliente). Se o usuário trocar o Tipo **antes** de tocar no conteúdo, re-semeia; depois de editar, preserva.
- Ordem dos steps passa de `["Básico","Responsáveis","Escopo","Anexos"]` para **`["Básico","Conteúdo","Responsáveis","Escopo","Registros","Anexos"]`** (espelha a ordem do protótipo: Identificação → Conteúdo → Aprovação → Registros → Anexos).
- **API:** `CreateDocumentBody` passa a aceitar `contentSections?` (opcional). Se enviado, o backend usa `normalizeContentSections(...)` em vez de `seedSectionsForType(type)`; se ausente, mantém o seed atual (retrocompatível). Reaproveita as validações de `content.ts` (≤50 seções, ids únicos, limites de tamanho).

### 3. Tratativa de Registros — ISO 9001 §7.5.3 (full-stack)

Campo que ficou de fora do v1. Modelo: um objeto único.

- **Schema (`documents.ts`):** nova coluna `records_treatment jsonb` (nullable). Tipo:
  ```ts
  type DocumentRecordsTreatment = {
    storageLocation: string | null;   // local de armazenamento
    retentionMonths: number | null;   // tempo de guarda (meses)
    disposalMethod: string | null;    // forma de descarte
    responsible: string | null;       // responsável pelo registro
    notes: string | null;             // observações
  };
  ```
- **DDL aditivo** (não usar `push`): `ALTER TABLE documents ADD COLUMN IF NOT EXISTS records_treatment jsonb;` — aplicar no Neon PROD como passo manual (idempotente), igual ao v1.
- **API:** Create/Update aceitam `recordsTreatment?`; `GET /documents/:id` retorna o campo. Incluir no **snapshot** (`metaSnapshot.recordsTreatment`) na aprovação, para o registro congelado.
- **Front:** nova etapa **"Registros"** no wizard + bloco no diálogo de edição (local de armazenamento, tempo de guarda em meses, forma de descarte [select: Exclusão digital / Fragmentação física / Arquivo morto], responsável, observações). Exibição read-only no detalhe.

### 4. Listagem com paridade visual (front-end, `index.tsx`)

A lista já tem busca + filtros (tipo/status/unidade) + badge de status colorido + seleção em massa. Falta:

- **Cards-resumo** (4) no topo: Total / Vigentes (`published`/`approved`) / Em revisão (`in_review`/`análise crítica`) / Rascunho (`draft`/`rejected`). Contagens derivadas do array `documents` carregado (a lista não pagina).
- **Coluna Código** (fonte mono) e **coluna Norma**.
- **Badge de Tipo colorido** via novo `TYPE_COLORS` (paleta do protótipo: instrução=azul, procedimento=verde, política=âmbar, etc.), no lugar do texto cinza atual.
- **Filtro por Norma** na barra de filtros (mesmas opções fixas).

### 5. Detalhe / visualização (front-end + PDF)

- Garantir **Código + Norma** na grade de informações do detalhe.
- **Bloco de assinaturas** (paridade com a aba "Aprovação" do protótipo): Elaborado por / Revisado por (análise crítica) / Aprovado por + datas — dados já existentes (elaboradores, revisores críticos, aprovadores com `approvedAt`). Exibir no detalhe e incluir no **PDF** exportado.
- Exibir **Tratativa de Registros** (§7.5.3) no detalhe.

### 6. Documentos legados / "Nova revisão" (full-stack)

Problema relatado: documentos criados antes do feature (ex.: os 8 da org demo) têm `content_sections = []` e estão em `published`/`approved`/`distributed` — e **não dá para preencher conteúdo nem editar identificação**. Causa: o gate é duplo — `conteudo.tsx`/`[id].tsx` só habilitam edição em `draft`/`rejected`, e o **servidor também bloqueia** (`PUT .../content` e `PATCH .../:docId` retornam 400 se `status` não for `draft`/`rejected`).

Solução (espelha o "Nova revisão" do protótipo, aderente à ISO — editar documento controlado exige nova revisão + reaprovação):

- **Backend:** nova rota `POST /organizations/:orgId/documents/:docId/revise` — permitida em `approved`/`published`/`distributed` (write access). Move o documento para `draft` **preservando `currentVersion`** (a versão aprovada permanece no histórico/snapshots) e recria o ciclo de análise crítica (reusar a lógica do `reject` → draft + `startCriticalAnalysisCycle`). Notifica os stakeholders de rascunho. Em `draft`/`rejected` retorna 400 ("já está em edição"); em `in_review` retorna 400 (rejeite ou aguarde).
- **Frontend (`[id].tsx`):** botão **"Nova revisão"** no detalhe para docs `approved`/`published`/`distributed` (write access), com confirmação ("o documento voltará para rascunho até nova aprovação"). Após a ação, os fluxos de edição (Conteúdo, Editar) já existentes destravam.
- **Editor (`DocumentSectionEditor`/`conteudo.tsx`):** quando o doc está editável e `contentSections` está vazio, exibir botão **"Usar modelo do tipo"** que semeia as seções via `seedSectionsForType(doc.type)` (mirror do client, Task 6) — resolve o "Conteúdo em branco" dos legados.
- Após editar e re-submeter → aprovar, a próxima versão (N+1) congela o novo snapshot; a versão anterior continua no histórico.

## Escopo (out / divergências intencionais)

- Tabela de **controle de versão manual** (protótipo) — mantemos versionamento automático.
- **WYSIWYG** — mantemos Markdown.
- **Catálogo gerenciável de normas** — por ora lista fixa + livre (pode virar catálogo depois, no padrão `swot_perspectives`).
- **Área como FK** (`department_id`) — gravamos o **nome** (string), consistente com o snapshot; sem migração de dados legados.
- Permissões de acesso inline do protótipo ("quem edita/consulta") — já cobertas pelas permissões de módulo/perfil do Daton.

## Componentes e arquivos afetados

- `lib/db/src/schema/documents.ts` — coluna `records_treatment` + tipos `DocumentRecordsTreatment`; `recordsTreatment` no `DocumentVersionMetaSnapshot`.
- `lib/api-spec/openapi.yaml` — schema `DocumentRecordsTreatment`; `recordsTreatment` + `contentSections` em Create/Update/Detail/Snapshot. Regerar orval (`lib/api-zod`, `lib/api-client-react`).
- `artifacts/api-server/src/services/documents/content.ts` — validação de `recordsTreatment`; `buildVersionMetaSnapshot` inclui `recordsTreatment`.
- `artifacts/api-server/src/routes/documents.ts` — Create aceita `contentSections`/`recordsTreatment`; PATCH aceita `recordsTreatment`; snapshot congela `recordsTreatment`.
- `artifacts/web/src/components/documents/document-section-editor.tsx` — **novo**, editor reutilizável extraído de `conteudo.tsx`.
- `artifacts/web/src/pages/app/qualidade/documentacao/index.tsx` — selects (Área/Tipo/Norma), step Conteúdo, step Registros, cards-resumo, colunas Código/Norma, badge Tipo, filtro Norma.
- `artifacts/web/src/pages/app/qualidade/documentacao/conteudo.tsx` — passa a usar `DocumentSectionEditor`.
- `artifacts/web/src/pages/app/qualidade/documentacao/[id].tsx` — selects no edit, bloco de assinaturas, bloco de Registros, Código/Norma na meta.
- `artifacts/web/src/lib/document-pdf.ts` — assinaturas + registros no PDF.

## Testes

- **Unit (web):** `TYPE_COLORS` mapping; opções de Norma; derivação dos cards-resumo (contagens por status); `document-pdf` com assinaturas/registros; `document-section-editor` (reusa os testes de `document-content-sections`).
- **Unit (node):** validação de `recordsTreatment` em `content.ts`; `buildVersionMetaSnapshot` inclui `recordsTreatment`.
- **Integração:** criar documento com `contentSections` inline (usa-os em vez do seed); criar/editar com `recordsTreatment`; snapshot congela `recordsTreatment`. Manter verdes os testes do v1 (documents 18 + documents-content 7).
- `pnpm typecheck` verde no repo inteiro.

## Riscos / notas

- DDL aditivo no PROD é passo manual (idempotente), nunca `push`.
- A aba "Conteúdo" no wizard precisa lidar com a troca de Tipo (re-seed só se conteúdo intocado).
- Cards-resumo dependem de a lista trazer todos os docs da org (hoje sim; se um dia paginar, trocar por agregado no backend).

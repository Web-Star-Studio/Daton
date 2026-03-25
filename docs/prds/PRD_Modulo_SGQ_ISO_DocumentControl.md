# PRD — Módulo de Controle de Documentos SGQ/ISO

**Versão:** 1.0  
**Data:** 24/03/2026  
**Plataforma:** Daton ESG Insight  
**Stack:** React 18 + Vite + Supabase (PostgreSQL + Storage + RLS)

---

## 1. Visão Geral

O módulo de Controle de Documentos SGQ/ISO implementa o ciclo de vida completo de documentos do Sistema de Gestão da Qualidade conforme requisitos da ISO 9001:2015, incluindo criação, análise crítica, aprovação, versionamento, campanhas de leitura e monitoramento de validade.

**Rota:** `/controle-documentos?tab=sgq-iso`

---

## 2. Arquitetura de Dados (Schema)

### 2.1 Tabelas Principais

| Tabela | Propósito |
|---|---|
| `sgq_iso_documents` | Registro principal do documento (metadados, status, validade) |
| `sgq_document_versions` | Histórico versionado (cada revisão = 1 row) |
| `sgq_document_branches` | Relação many-to-many documento↔filial |
| `sgq_document_references` | Vínculos com documentos do sistema (documents) |
| `sgq_review_requests` | Solicitações de revisão (fluxo elaborador→revisor) |
| `sgq_read_campaigns` | Campanhas de confirmação de recebimento |
| `sgq_read_recipients` | Destinatários individuais de cada campanha |
| `sgq_iso_document_settings` | Configuração por empresa (dias para alerta de vencimento) |
| `sgq_renewal_schedules` | Agendamentos de renovação |
| `documents` | Storage genérico (anexos, sub-documentos) via `related_model` |

### 2.2 Colunas-Chave em `sgq_iso_documents`

| Coluna | Tipo | Descrição |
|---|---|---|
| `title` | TEXT | Título do documento |
| `document_identifier_type` | TEXT | Tipo: Manual, Procedimento, IT, Formulário, MSG, FPLAN, Política, Plano, Relatório, Certificado, Outro |
| `elaborated_by_user_id` | UUID → employees | Quem elaborou |
| `critical_reviewer_user_id` | UUID → profiles (nullable) | Analista crítico (etapa intermediária) |
| `critical_review_status` | TEXT (nullable) | `pending` \| `approved` \| `rejected` |
| `approved_by_user_id` | UUID → profiles | Aprovador final |
| `is_approved` | BOOLEAN | Flag de aprovação (controla visibilidade e status) |
| `approved_at` | TIMESTAMP | Data/hora da aprovação |
| `current_version_number` | INTEGER | Número da versão vigente |
| `expiration_date` | DATE | Data de validade |
| `branch_id` | UUID → branches | Filial primária (legado, mantido para retrocompatibilidade) |
| `norm_reference` | TEXT | Normas aplicáveis (CSV: "ISO 9001:2015, ISO 14001:2015") |
| `responsible_department` | TEXT | Departamento responsável |
| `created_by_user_id` | UUID → profiles | Criador do registro |

### 2.3 Relacionamentos

```
sgq_iso_documents ──1:N── sgq_document_versions
sgq_iso_documents ──1:N── sgq_document_branches ──N:1── branches
sgq_iso_documents ──1:N── sgq_document_references ──N:1── documents
sgq_iso_documents ──1:N── sgq_review_requests
sgq_iso_documents ──1:N── sgq_read_campaigns ──1:N── sgq_read_recipients
sgq_iso_documents ──1:N── documents (via related_model='sgq_subdocument')
```

---

## 3. Regras de Negócio

### 3.1 Ciclo de Vida do Documento

```
┌──────────┐    ┌────────────────┐    ┌───────────────┐    ┌──────────┐
│ Criação  │───▶│ Análise Crítica│───▶│  Aprovação    │───▶│ Vigente  │
│          │    │  (opcional)    │    │  (obrigatória)│    │          │
└──────────┘    └────────────────┘    └───────────────┘    └──────────┘
                       │                      │                  │
                       ▼                      ▼                  ▼
                  Rejeição             Rejeição           A Vencer → Vencido
```

**Estados possíveis (DocumentStatus):**
- `"Em Aprovação"` — `is_approved = false`
- `"Vigente"` — Aprovado e `days_remaining > threshold`
- `"A Vencer"` — Aprovado e `days_remaining <= threshold` (threshold configurável por empresa)
- `"Vencido"` — Aprovado e `days_remaining < 0`

### 3.2 Fluxo de Criação

1. Usuário preenche formulário (título, tipo, filiais, elaborador, analista crítico, aprovador, validade, normas, departamento, anexo, destinatários, referências)
2. Sistema cria registro em `sgq_iso_documents` com `is_approved = false`
3. Upload do anexo para Supabase Storage via `uploadDocument()` com `related_model: "sgq_iso_document"`
4. Arquivo é renomeado para `{nome}_v1.{ext}` (evita conflito de unique constraint)
5. Cria versão 1 em `sgq_document_versions`
6. Cria campanha de leitura **inativa** (`status: "inactive"`) — só ativa após aprovação
7. Insere filiais em `sgq_document_branches` (many-to-many)
8. Insere referências em `sgq_document_references`
9. Dispara notificação:
   - Se tem analista crítico → notifica `critical_reviewer_user_id`
   - Senão → notifica `approved_by_user_id` diretamente
10. **Rollback automático:** se qualquer etapa pós-insert falha, deleta o documento criado

### 3.3 Camada de Análise Crítica (Critical Review)

**Regra:** Etapa intermediária opcional entre elaboração e aprovação.

- Campo `critical_reviewer_user_id` (nullable) define se a etapa existe
- Quando definido, `critical_review_status` inicia como `"pending"`
- Somente o analista crítico designado pode executar `approveCriticalReview(docId)`
- Validações:
  - Documento não pode já estar aprovado
  - Apenas o `critical_reviewer_user_id` pode aprovar
  - Não pode aprovar duas vezes
- Após aprovação da análise crítica:
  - `critical_review_status` → `"approved"`
  - Sistema notifica o `approved_by_user_id` para prosseguir com aprovação final

**Visibilidade na lista:**
- Documentos "Em Aprovação" são filtrados por permissão:
  - O **criador** sempre vê
  - O **analista crítico** sempre vê
  - O **aprovador** só vê **após** a análise crítica ser aprovada (ou se não há analista crítico)
  - Demais usuários não veem documentos pendentes que não são seus

### 3.4 Fluxo de Aprovação Inicial

Função: `approveInitialDocument(docId)`

1. Valida que o usuário é o `approved_by_user_id`
2. **Bloqueio:** se existe analista crítico e `critical_review_status !== "approved"`, lança erro
3. Define `is_approved = true` e `approved_at = now()`
4. Ativa todas as campanhas de leitura pendentes (`status: "inactive" → "active"`)
5. Notifica todos os destinatários das campanhas ativadas

### 3.5 Sistema de Versões

#### 3.5.1 Fluxo Normal (via Revisão)

O versionamento é **indireto** — não se cria versão diretamente, mas via solicitação de revisão:

1. Elaborador envia `createReviewRequest()` com:
   - Documento-alvo
   - Revisor/aprovador designado
   - Descrição das alterações
   - Novo arquivo anexo (upload com sufixo `_rev_{randomId}`)
2. Revisor recebe notificação
3. Revisor pode:
   - **Aprovar** (`approveReviewRequest`):
     - Cria nova versão N+1 em `sgq_document_versions`
     - Renomeia arquivo de `_rev_xxxx` para `_vN`
     - Atualiza `current_version_number` no documento
     - Cria nova campanha de leitura com destinatários da campanha anterior
     - Notifica elaborador + destinatários
   - **Rejeitar** (`rejectReviewRequest`):
     - Marca como `status: "rejected"` com notas
     - Notifica elaborador

#### 3.5.2 Importação em Lote (Batch Import)

Função: `batchImportDocumentVersions()`

**Caso de uso:** Migração de histórico de revisões de documentos legados.

**Formato de entrada (texto livre):**
```
1 - 01/01/2020 - Emissão inicial
2 - 15/06/2020 - Revisão do escopo
3 - 10/01/2021 - Atualização de procedimentos
```

**Lógica de parsing:** `parseBulkVersionText()` com regex `^(\d+)\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(.+)$`
- Suporta descrições multi-linha (continuação sem número = append à entry anterior)

**Lógica de numeração:**
- Versões existentes são **preservadas** e renumeradas para após o batch
- Ex.: batch tem v1-v10, versões existentes (v1-v3) viram v11-v13
- `current_version_number` é atualizado para `maxBatch + existing.length`

### 3.6 Sub-documentos (Anexos Complementares)

Armazenados na tabela `documents` com `related_model = "sgq_subdocument"` e `related_id = docId`.

- Upload múltiplo permitido
- Download individual
- Exclusão permitida apenas para o criador do documento ou admins
- Exibição em dialog dedicado com lista de arquivos + versões do documento principal

### 3.7 Campanhas de Leitura (Read Campaigns)

**Propósito:** Garantir que colaboradores confirmem o recebimento/leitura de documentos.

**Ciclo:**
1. Campanha criada automaticamente na criação do documento (inativa)
2. Ativada após aprovação do documento
3. Cada destinatário tem estados: `pending` → `viewed` → `confirmed`
4. Confirmação via `confirmSgqRead()` registra `confirmed_at` e nota opcional
5. Novas versões geram novas campanhas automáticas

### 3.8 Referências Normativas

- Documentos SGQ podem referenciar documentos do sistema (`documents` table)
- Relação many-to-many via `sgq_document_references`
- Picker no formulário de criação busca até 500 documentos da empresa

### 3.9 Vinculação com Filiais (Branches)

- Relação many-to-many via `sgq_document_branches`
- Checkbox "Selecionar todas" no formulário
- Filtro por filial na listagem
- Campo legado `branch_id` mantido para retrocompatibilidade (usa primeiro da lista)

---

## 4. Sistema de Notificações

### 4.1 Eventos Notificados

| Evento | notification_type | Destinatário | Prioridade |
|---|---|---|---|
| Documento criado (sem análise crítica) | `sgq_approval_required` | Aprovador | high |
| Análise crítica pendente | `sgq_critical_review_required` | Analista crítico | high |
| Análise crítica aprovada | `sgq_approval_required` | Aprovador | high |
| Revisão solicitada | `sgq_review_requested` | Revisor | high |
| Revisão aprovada | `sgq_review_approved` | Elaborador | normal |
| Revisão rejeitada | `sgq_review_rejected` | Elaborador | high |
| Campanha de leitura | `sgq_read_campaign` | Destinatários | high |
| Documento a vencer | `sgq_expiring` | Elaborador | high |
| Documento vencido | `sgq_expired` | Elaborador | critical |

### 4.2 Infraestrutura

- Tabela: `audit_notifications` (compartilhada com módulo de auditoria)
- Serviço: `AuditNotificationService.createNotification()`
- Constraint CHECK rígido no banco — valores fora do enum causam erro de INSERT
- Notificações são fire-and-forget (`.catch(() => {})`) para não bloquear fluxos principais
- Verificação periódica de vencimento via `syncSgqExpirationAlerts()` (executada no hook `useNotificationTriggers`)

---

## 5. Configurações

Tabela: `sgq_iso_document_settings` (1 row por empresa)

| Campo | Default | Descrição |
|---|---|---|
| `default_expiring_days` | 30 | Dias antes do vencimento para classificar como "A Vencer" |

- Auto-inicialização: se não existe row para a empresa, cria com defaults
- Editável na aba "Configurações" da página de Controle de Documentos

---

## 6. Cálculo de Status

```typescript
const resolveDocumentStatus = (daysRemaining, threshold, isApproved): DocumentStatus => {
  if (!isApproved) return "Em Aprovação";
  if (daysRemaining < 0) return "Vencido";
  if (daysRemaining <= threshold) return "A Vencer";
  return "Vigente";
};
```

- `daysRemaining` = diferença em dias entre `expiration_date` e hoje (midnight-to-midnight)
- `threshold` = `settings.default_expiring_days`

---

## 7. Arquitetura de Código

### 7.1 Arquivos Principais

| Arquivo | Responsabilidade |
|---|---|
| `src/services/sgqIsoDocuments.ts` (1338 linhas) | Service layer: CRUD, versões, revisões, campanhas, sub-docs, batch import |
| `src/services/sgqDocumentNotifications.ts` (230 linhas) | Notificações SGQ (7 funções + sync de expiração) |
| `src/components/document-control/SGQIsoDocumentsTab.tsx` (1738 linhas) | UI completa: listagem, filtros, dialogs, formulários |
| `src/components/document-control/DocumentSettingsTab.tsx` | Configuração de dias de alerta |
| `src/pages/ControleDocumentos.tsx` | Page container com tabs |

### 7.2 Padrão de Resiliência (Fallback)

O service usa um padrão de **tentativa com fallback** para as colunas `critical_reviewer_user_id` e `critical_review_status`:

```typescript
// Tenta com colunas novas
let { data, error } = await supabase.from("sgq_iso_documents").insert({ ...base, critical_reviewer_user_id, critical_review_status });

// Fallback: migration não aplicada
if (error) {
  const fallback = await supabase.from("sgq_iso_documents").insert(base);
  // ...
}
```

Isso garante compatibilidade durante o período de rollout da migration.

### 7.3 Queries & Data Fetching

- **React Query** para cache e invalidação (`queryKey: ["sgq-documents", ...]`)
- Listagem resolve nomes de usuários via batch lookup em `employees` + `profiles` (Promise.all)
- Contagem de pendências (recipients, reviews) feita em queries paralelas

---

## 8. Permissões e Visibilidade

### 8.1 Regras de Visibilidade na Listagem

Documentos **não aprovados** (`is_approved = false`):
- Visível para o **criador** (`created_by_user_id`)
- Visível para o **analista crítico** (`critical_reviewer_user_id`)
- Visível para o **aprovador** (`approved_by_user_id`) **somente após** análise crítica concluída
- Invisível para demais usuários

Documentos **aprovados**: visíveis para todos da empresa.

### 8.2 Ações por Papel

| Ação | Quem pode |
|---|---|
| Criar documento | Qualquer usuário autenticado |
| Aprovar análise crítica | `critical_reviewer_user_id` |
| Aprovar documento | `approved_by_user_id` (após análise crítica) |
| Enviar para revisão | Qualquer usuário (documento aprovado) |
| Aprovar/rejeitar revisão | `reviewer_user_id` da request |
| Excluir documento | Criador ou admin |
| Editar metadados | Criador ou admin |
| Upload sub-documentos | Criador ou admin |
| Confirmar leitura | Destinatário da campanha |

---

## 9. Filtros Disponíveis

| Filtro | Tipo | Opções |
|---|---|---|
| Busca textual | Input | Título, tipo, filial, elaborador, aprovador, norma, departamento, notas |
| Filial | Select | Todas as filiais da empresa |
| Tipo de documento | Select | 11 tipos (Manual, Procedimento, IT, etc.) |
| Status | Select | Vigente, A Vencer, Vencido, Em Aprovação |

---

## 10. Normas ISO Suportadas

O sistema oferece seleção múltipla (checkboxes) para as seguintes normas:

- ISO 9001:2015 (Qualidade)
- ISO 14001:2015 (Meio Ambiente)
- ISO 45001:2018 (Saúde e Segurança)
- ISO 27001:2022 (Segurança da Informação)
- ISO 39001:2012 (Segurança Viária)
- ISO 50001:2018 (Gestão de Energia)

Armazenadas como string CSV no campo `norm_reference`.

---

## 11. Edição de Documentos

Função: `updateSgqDocument()`

Campos editáveis pós-criação:
- Título, tipo, filiais, elaborador, analista crítico, aprovador, validade, normas, notas, departamento

**Lógica de filiais na edição:** delete all + reinsert (replace completo).

---

## 12. Exclusão de Documentos

Função: `deleteSgqDocument()`

- Cascade nativo do banco deleta registros dependentes (versions, branches, campaigns, etc.)
- Apenas via confirmação (AlertDialog)

---

## 13. Migrations Relevantes

| Migration | Mudança |
|---|---|
| `20260323000000_sgq_critical_review.sql` | Adiciona `critical_reviewer_user_id` e `critical_review_status` em `sgq_iso_documents`; expande constraint de `audit_notifications.notification_type` |

---

## 14. Resumo das Funcionalidades Implementadas

1. ✅ CRUD completo de documentos SGQ/ISO
2. ✅ Análise crítica (camada intermediária antes do aprovador)
3. ✅ Fluxo de aprovação com ativação de campanhas
4. ✅ Versionamento via solicitação de revisão (elaborador→revisor)
5. ✅ Importação de versões em lote (batch import de histórico)
6. ✅ Sub-documentos (anexos complementares)
7. ✅ Campanhas de leitura com confirmação individual
8. ✅ Referências normativas (vínculo com documentos do sistema)
9. ✅ Vinculação many-to-many com filiais
10. ✅ Notificações em tempo real (9 tipos de eventos)
11. ✅ Monitoramento automático de vencimento
12. ✅ Configuração de threshold de alerta por empresa
13. ✅ Filtros avançados (busca, filial, tipo, status)
14. ✅ Edição de metadados pós-criação
15. ✅ Controle de visibilidade por papel no fluxo
16. ✅ Fallback de resiliência para migrations pendentes

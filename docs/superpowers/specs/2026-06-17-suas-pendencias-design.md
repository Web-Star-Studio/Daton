# Spec — Suas Pendências (painel pessoal de pendências)

- **Data:** 2026-06-17
- **Origem:** pedido da cliente (Gabardo/SGI — Ana Corrêa) via WhatsApp + mockup `painel_pendencias_misto.html`
- **Status:** aprovada para detalhamento de plano

## 1. Problema / objetivo

Hoje as pendências de um usuário (indicador a alimentar, plano de ação vencido, NC aguardando
resposta, documento regulatório a vencer) só chegam por **e-mail / notificação**. A cliente quer
uma **tela dentro do sistema** onde o usuário veja, em um só lugar, **tudo que está sob a sua
responsabilidade e precisa de ação**, priorizado por urgência, com link direto para resolver.

Pedido explícito da cliente, além do mockup:
> "Nesta tela de pendências, trazer informações sobre o usuário: NOME, FILIAL, ÚLTIMO ACESSO. E perfil."

Princípio norteador (palavras do solicitante): a melhor UX possível para que o usuário **saiba o que
fazer e quando fazer**; nada deve ficar escondido (pode "ver tudo" via calendário para nunca ser
pego de surpresa), mas a lista principal **não pode poluir** com itens cuja ação só é necessária no
futuro.

### Decisões fechadas no brainstorming

| Tema | Decisão |
| --- | --- |
| Onde vive | **Home pós-login** (substitui o redirect atual para `/organizacao`) **+ item no menu lateral** |
| Fontes v1 | **Todas**: indicadores, planos de ação, não conformidades (+ ações corretivas), documentos regulatórios |
| Extensibilidade | **Requisito central**: qualquer módulo futuro com "responsável + prazo" se conecta como nova fonte sem reescrever o painel |
| Janela | Lista foca no acionável (vencidos + a vencer em breve); **calendário** mostra tudo (inclusive futuro) sem poluir |
| Bloco do usuário | **Implementar tudo**: NOME, FILIAL, ÚLTIMO ACESSO, PERFIL |
| Escopo admin | Operador/analyst veem só as suas; **admin/gestor pode ver a filial / a organização** (filtro minhas × filial × organização) |
| Entrega | Worktree isolada, por **fases** |

## 2. Arquitetura

### 2.1 Backend — registro de provedores (extensível)

O coração da solução é um **registro de provedores de pendência**. Cada domínio implementa uma
interface comum e é registrado num array; o endpoint agregador itera os provedores, normaliza e
devolve tudo numa única resposta. **Adicionar um módulo novo = adicionar um provedor ao registro** —
o painel, o cálculo de urgência, o calendário e os contadores passam a incluí-lo automaticamente.

```ts
// Forma normalizada de uma pendência (independente de domínio)
type PendenciaUrgency = "overdue" | "due_soon" | "upcoming" | "no_due";
type PendenciaPriority = "p1" | "p2" | "p3";

interface Pendencia {
  id: string;                 // estável e único, ex.: "kpi:123:2025-05"
  source: string;             // "kpi" | "action_plan" | "nonconformity" | "regulatory_document" | ...
  sourceLabel: string;        // rótulo PT-BR da fonte, ex.: "Indicador"
  title: string;              // ex.: "Taxa de satisfação do cliente"
  subtitle?: string;          // contexto, ex.: "Meta: 90% · último: 88,5% (Abr/2025)"
  statusLabel: string;        // ex.: "aguarda sua resposta", "Mai/2025"
  dueDate: string | null;     // ISO date (vencimento). null = pendente sem prazo
  responsibleUserId: number;  // quem responde por ela
  responsibleName?: string;   // exibido na visão filial/organização
  link: { route: string; ctaLabel: string }; // deep-link + rótulo do botão (ex.: "Alimentar ↗")
  meta?: Record<string, unknown>; // extras por domínio, ex.: { progress: 40 }
}

interface PendenciaProviderContext {
  orgId: number;
  responsibleUserIds: number[]; // conjunto de responsáveis que o solicitante pode ver
  now: Date;                    // injeção de "agora" (testabilidade)
  dueSoonDays: number;          // janela de "a vencer em breve" (default 7)
}

interface PendenciaProvider {
  source: string;
  // pendências em aberto para os responsáveis do contexto
  listPending(ctx: PendenciaProviderContext): Promise<Pendencia[]>;
  // itens concluídos hoje pelos responsáveis do contexto (reforço positivo, opcional por provedor)
  listCompletedToday?(ctx: PendenciaProviderContext): Promise<Pendencia[]>;
}
```

Local sugerido: `artifacts/api-server/src/services/pendencias/` com:
- `types.ts` — interfaces acima + `classifyUrgency()` / `urgencyToPriority()`.
- `providers/kpi.ts`, `providers/action-plans.ts`, `providers/nonconformities.ts`, `providers/regulatory-documents.ts`.
- `registry.ts` — array de provedores (ponto único de extensão).
- `aggregate.ts` — resolve escopo → `responsibleUserIds`, chama os provedores, achata, classifica, ordena e monta os contadores.

### 2.2 Cálculo de urgência → prioridade

`classifyUrgency(dueDate, now, dueSoonDays)`:

| Condição | urgency | priority | Seção na lista |
| --- | --- | --- | --- |
| `dueDate < hoje` | `overdue` | `p1` | Fazer agora |
| `hoje ≤ dueDate ≤ hoje+dueSoonDays` | `due_soon` | `p2` | Em breve |
| pendente sem prazo / "em andamento" | `no_due` | `p3` | Atenção |
| `dueDate > hoje+dueSoonDays` | `upcoming` | (oculto na lista) | só no calendário |

Ordenação na lista: por `priority` (p1→p3) e, dentro, por `dueDate` ascendente (mais vencido primeiro);
pendências sem prazo ao fim do grupo.

### 2.3 Escopo (minhas × filial × organização)

O endpoint aceita `?scope=mine|unit|org` (default `mine`) e `?unitId=` (quando `scope=unit`).
O agregador resolve o escopo num conjunto de `responsibleUserIds` e o repassa aos provedores —
ou seja, a **filial é escopada pelo responsável** (`users.primaryUnitId`), não pela unidade da
entidade. Isso reusa o campo de filial que já vamos adicionar e evita mapear unidade por entidade
em cada domínio.

Resolução:
- `mine` → `[auth.userId]`.
- `unit` → todos os usuários da org com `primaryUnitId = unitId`.
- `org` → todos os usuários da org.

Autorização:
- `operator` e `analyst` → apenas `mine` (qualquer outro scope retorna 403).
- `org_admin` e `platform_admin` → `mine`, `unit` (qualquer filial) e `org`.
- Default de exibição para admin = sua própria filial (`primaryUnitId`), com seletor para trocar de
  filial ou ver a organização toda. (Quando houver o perfil "gerente", ele entra na regra de
  `unit` limitado à própria filial — fora do escopo deste v1.)

### 2.4 Endpoint

`GET /organizations/:orgId/pendencias?scope=&unitId=&dueSoonDays=`

Resposta:
```jsonc
{
  "user": {
    "id": 53, "name": "João Silva", "role": "operator",
    "filial": { "id": 7, "name": "POA" } | null,
    "lastLoginAt": "2026-06-17T08:12:00Z" | null
  },
  "scope": "mine",
  "counts": {
    "overdue": 5,
    "bySource": { "kpi": 2, "action_plan": 2, "nonconformity": 1, "regulatory_document": 0 },
    "completedToday": 2
  },
  "items": [ /* Pendencia[] em aberto, já ordenadas */ ],
  "completedToday": [ /* Pendencia[] concluídas hoje */ ]
}
```

A lista inclui também os `upcoming` (futuros) para alimentar o calendário; o front decide o que mostrar
em cada modo (lista esconde `upcoming`; calendário mostra tudo). Contadores cobrem o que a lista expõe.

### 2.5 Camada de dados no front

Cliente hand-written `artifacts/web/src/lib/pendencias-client.ts` (mesmo padrão de `action-plans-client.ts`
/ `kpi-client.ts`): `apiJson<T>()`, query keys e o hook `usePendencias(orgId, { scope, unitId })`.
A forma agregada é bespoke — não passa pelo Orval/OpenAPI.

## 3. Provedores v1 — fonte de verdade por domínio

| Provedor | Tabela(s) | "Vencido"/pendente | dueDate | Deep-link / CTA |
| --- | --- | --- | --- | --- |
| `kpi` | `kpi_indicators` + `kpi_year_configs` + `kpi_monthly_values` | reusar `computeFeedStatus` (mês esperado sem valor) | fim do período esperado | KPI → lançamento do indicador (hash `#lancar-<id>`) · "Alimentar ↗" |
| `action_plan` | `action_plans` | `status NOT IN (completed,cancelled) AND dueDate < now` (overdue) ou `status IN (open,in_progress)` (em andamento) | `due_date` | `/planos-acao/:id` · "Ver plano ↗" |
| `nonconformity` | `nonconformities` + `corrective_actions` | NC `status NOT IN (closed,cancelled)` (atenção) e ações corretivas `status NOT IN (done,canceled) AND due_date < today` (vencidas) | da ação corretiva, ou null para a NC | tela da NC (governança) · "Responder ↗" |
| `regulatory_document` | `regulatory_documents` | `status IN (a_vencer, vencido)` | `expiration_date` | `/qualidade/regulatorios` · "Renovar ↗" |

`completedToday` por provedor (quando aplicável): KPI lançado hoje, plano `closedAt = hoje`,
ação corretiva `done` hoje, NC `closedAt = hoje`, documento renovado hoje.

> Cada provedor é independente e testável isoladamente. Se um provedor falhar, o agregador registra o
> erro e segue com os demais (degradação graciosa — um domínio quebrado não derruba o painel inteiro).

## 4. Mudanças de schema

`lib/db/src/schema/users.ts`:
- `lastLoginAt timestamp(withTimezone)` — nullable; atualizado a cada login bem-sucedido.
- `primaryUnitId integer references units.id` — nullable; "filial" do usuário.

Aplicação via DDL cirúrgico (o branch está atrás do main em outros campos — não rodar `db push` puro;
ver memória `drizzle-push-prod-drift-theme`). Atualizar `createInsertSchema`/tipos derivados.

Sem tabela nova de pendências no v1 — tudo derivado em tempo real (a tabela materializada fica como
otimização futura, se/quando houver volume ou digest por e-mail).

## 5. UX / Frontend

### 5.1 Página e navegação
- Nova página `artifacts/web/src/pages/app/pendencias.tsx`, rota `/app/pendencias` (+ fallback `/pendencias`).
- **Landing pós-login**: redirect padrão passa de `/organizacao` para `/pendencias` (`App.tsx`).
- Item no menu lateral (`AppLayout.tsx`), ícone lucide (ex.: `ListChecks` / `CircleAlert`), no topo,
  sem gating de módulo (todo usuário tem pendências).

### 5.2 Layout (segue o mockup, traduzido para o design system)
- **Cabeçalho**: saudação ("Olá, <primeiro nome>") + título "Suas pendências" + bloco de identificação
  do usuário (NOME, FILIAL, PERFIL, ÚLTIMO ACESSO) + indicador "Concluídos hoje".
- **Cards de resumo**: contadores por fonte/urgência (Total em aberto / Indicadores / Planos / NCs / Documentos).
- **Seletor de escopo** (só admin/gestor): Minhas · Filial \<X\> · Toda a organização (+ troca de filial).
- **Lista priorizada** (modo default):
  - "Fazer agora · P1" (vencidos, vermelho)
  - "Em breve · P2" (a vencer, âmbar)
  - "Atenção · P3" (sem prazo / em andamento)
  - "Concluídos hoje" (riscado, opacidade reduzida)
  - Cada card: ícone, tag da fonte, status/prazo, título, contexto, barra de progresso (planos),
    botão de ação com deep-link.
  - Na visão filial/organização, o card também mostra o responsável.
- **Toggle Lista / Calendário**:
  - **Calendário mensal**: todos os itens (inclusive `upcoming`) plotados por `dueDate`; navegação
    entre meses; clicar num item leva à ação. É o "ver tudo para nunca ser pego de surpresa".
  - (Linha do tempo agrupada "Próximas" fica como opção futura.)
- **Estado vazio**: "Você está em dia 🎉" (sem pendências em aberto).
- Componentes: `Card`, `Badge` (variantes `danger`/`warning`/`info`/`success`), ícones `lucide-react`,
  `cn()`. Sem Tabler/CSS-vars do mockup (não existem no projeto) — mapear para o design system atual.
- Permissões: `analyst` (read-only) vê o painel; CTAs respeitam `canWrite`/`canWriteModule`.

### 5.3 Bloco do usuário
- NOME: `user.name`.
- PERFIL: rótulo PT-BR do papel (Administrador / Operador / Analista / ...).
- FILIAL: nome da unidade `primaryUnitId` (ou "—" se não definida).
- ÚLTIMO ACESSO: `lastLoginAt` formatado (ex.: "hoje às 08:12" / "12/06 14:30").

### 5.4 Cadastro de usuário
- No formulário de criar/editar usuário, adicionar seletor de **Filial** (SearchableSelect de unidades),
  gravando `primaryUnitId`. (Localizar o cadastro atual de usuários — admin/configurações — e estender.)

## 6. Faseamento (PRs separados)

- **F1 — Identidade do usuário**: schema (`lastLoginAt`, `primaryUnitId`) + gravação de `lastLoginAt`
  no login + seletor de filial no cadastro de usuário + expor os campos na resposta de auth/me.
- **F2 — Motor de pendências (backend)**: interfaces + `classifyUrgency` + 4 provedores + registry +
  `aggregate` + endpoint `GET /organizations/:orgId/pendencias` (com escopo e autorização). Testes unitários.
- **F3 — Painel (frontend)**: `pendencias-client.ts` + página + bloco do usuário + cards de resumo +
  lista priorizada + deep-links + seletor de escopo + estado vazio + virar landing + item no menu.
- **F4 — Calendário & concluídos hoje**: modo calendário (ver tudo, inclusive futuro) + seção/realce
  "Concluídos hoje".

Cada fase é validável de forma independente (`pnpm typecheck` + testes da fase) e vira um PR.

## 7. Testes

- **Unit (`classifyUrgency`)**: overdue / due_soon / upcoming / no_due nos limites (hoje, hoje+7).
- **Unit por provedor** (mock de DB / contexto): retorna pendências corretas, dueDate certo, deep-link
  correto; KPI reusa `computeFeedStatus`; ações corretivas vencidas viram pendência.
- **Unit do agregador**: ordenação por prioridade/data, contadores, resolução de escopo →
  `responsibleUserIds`, degradação graciosa quando um provedor lança erro.
- **Integração do endpoint**: autorização por papel (operator não acessa `unit`/`org`), shape da resposta.
- **Frontend**: render com dados mock (lista, contadores, estado vazio), deep-links corretos, bloco do
  usuário, gating de CTA para analyst.

## 8. Fora de escopo (v1)

- Tabela materializada / digest por e-mail das pendências (otimização futura).
- Perfil "gerente" formal (o escopo `unit` para admin já cobre o essencial; o gerente entra depois).
- Linha do tempo agrupada como alternativa ao calendário.
- Notificações in-app (sino) — permanecem como estão; o painel é estado derivado, não feed.
- Marcar pendência como concluída direto do painel (a ação acontece na tela do domínio via deep-link).

## 9. Riscos / pontos de atenção

- **`db push` aponta para PROD e quer dropar `users.theme`**: aplicar as duas colunas novas via DDL
  cirúrgico, nunca `push` puro do branch atrasado (memória `drizzle-push-prod-drift-theme`).
- **Mapear unidade/filial das entidades** foi evitado de propósito (escopo pelo responsável); confirmar
  que isso atende a expectativa de "ver a filial".
- **KPI `computeFeedStatus`** vive na rota (`routes/kpi/index.ts`); extrair/forma reutilizável para o
  provedor sem duplicar a regra.
- **Localizar o cadastro de usuário** (onde adicionar o seletor de filial) — confirmar na F1.

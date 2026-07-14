# Plano de Ação: ponto focal + responsáveis por ação

**Data:** 2026-07-14
**Módulo:** Gestão de Ações (`actionPlans`)
**Status:** decisão de desenho fechada. **Sem código** — a implementação pertence à feature de
*ações-item dentro do plano*, que está sendo construída em outra frente.
**Origem:** regra de negócio revalidada pela cliente, duas vezes no mesmo dia.

---

## 1. Como chegamos aqui (e por que este documento não vira código)

A cliente pediu "mais de um responsável no plano de ação". A primeira leitura foi **conjunto
plano**: N responsáveis iguais, sem hierarquia. Chegamos a implementar a fundação disso — uma
tabela de junção `action_plan_responsibles` (commits `0d6de59` e `fd925b5`).

Aí a regra foi revalidada com a cliente e mudou: existe sim um **ponto focal**, e os demais
responsáveis se vinculam às **ações internas do plano** — uma feature em construção, na qual cada
ação tem responsável e prazo próprios.

Com esse modelo, a tabela de junção vira **código morto**: o plano mantém sua coluna única
(`responsible_user_id`), que simplesmente *passa a significar* ponto focal, e a multiplicidade
migra para a tabela de ações. Os dois commits foram revertidos (`ea318ae`).

**Este documento existe para que o trabalho de análise não se perca.** O ativo produzido aqui não
foi a tabela — foi o **mapa completo dos pontos de acoplamento do "responsável"** (§4), que a
feature de ações-item vai precisar inteiro. Quem for implementá-la deve ler §2, §3 e §4.

## 2. O modelo

```
PLANO DE AÇÃO  "Reduzir retrabalho na linha 2"
  Ponto focal:  Maria Silva          ← responde pelo plano inteiro
  Prazo macro:  30/09
  Causa raiz, 5W2H, eficácia         ← inalterados

  Ações:
    1. Revisar procedimento de solda   João Souza   20/08
    2. Treinar operadores              Ana Costa    05/09
    3. Auditar a linha                 João Souza   25/09

  "Outros responsáveis" = {João, Ana}  ← DERIVADO das ações, nunca digitado
```

Três regras:

1. **O plano tem um ponto focal**, e um só. É a coluna `action_plans.responsible_user_id` que já
   existe — **sem migração, sem tabela nova**. Muda o rótulo na UI ("Responsável" → "Ponto focal"),
   não o schema.
2. **Cada ação tem responsável e prazo próprios.** É onde a multiplicidade mora.
3. **"Outros responsáveis" do plano é derivado** — o conjunto distinto dos donos das ações dele.
   Exibido, jamais cadastrado.

E o caso simples continua simples: um plano **sem ações internas** tem exatamente um responsável, o
ponto focal — que é precisamente o comportamento de hoje. Ninguém paga imposto de complexidade pelo
caso que não precisa dela.

## 3. Onde as pessoas entram (decisão de UX)

**Na criação do plano: só o ponto focal. Na ficha, ao criar cada ação: o responsável dela.**

O Daton já tinha decidido isso sozinho, no jeito como foi construído. O diálogo de "Nova ação"
(`_components/nova-acao-dialog.tsx`) pede o mínimo e traz escrito: *"Detalhe 5W2H, causa raiz e
eficácia na ficha."* **Criação é captura; a ficha é onde se trabalha.**

Três razões para não pedir a equipe na criação:

**Criação é uma interrupção.** O plano quase sempre nasce de dentro de outra tela — uma célula
vermelha de indicador, uma não conformidade, uma ameaça do SWOT. A pessoa está no meio de outra
tarefa. Cada campo naquele modal é um pedágio cobrado no momento de menor conhecimento e menor
paciência. Pedir a equipe ali rende nomes chutados ou campo em branco.

**Na criação você ainda não sabe quem são.** Você sabe o problema e quem responde por ele. Quem mais
entra depende do desdobramento em ações — e o desdobramento *é a análise* (5 porquês, 5W2H), que
acontece na ficha. Pedir a equipe antes da análise é pedir a resposta antes da pergunta.

**Co-responsável sem ação é um e-mail sem instrução.** Este é o argumento decisivo, porque o sistema
**cobra** essas pessoas: manda e-mail de ação vencida e joga o item em "Suas Pendências". Um alerta
dizendo *"você é co-responsável pelo plano AC-2026-047"* chega sem tarefa e sem prazo — a pessoa
abre, lê e não sabe o que fazer. Já *"você é responsável por: revisar o procedimento de solda —
prazo 20/08"* tem endereço. **Nomear pessoa e atribuir tarefa têm que ser o mesmo gesto**, senão a
cobrança vira ruído e as pessoas param de ler os e-mails do sistema.

É também a disciplina que o módulo existe para impor: o 5W2H tem "quem" e "quando" grudados. Uma
tela que deixa escrever o nome de alguém sem dizer o que a pessoa vai fazer e até quando sabota a
própria metodologia que ela implementa.

**Uma fonte da verdade.** Se existisse uma lista de co-responsáveis no plano **e** um responsável em
cada ação, as duas divergiriam — alguém sai de uma ação e fica na lista como fantasma. Derivar em
vez de duplicar.

## 4. O mapa: todo lugar que hoje toca `responsible_user_id`

Este é o material que a feature de ações-item precisa. Hoje `action_plans.responsible_user_id`
(FK → `users.id`, nullable, `ON DELETE SET NULL`) **não é um rótulo** — é chave em cinco mecanismos.
Quando a ação-item ganhar responsável e prazo, **cada um destes cinco precisa decidir se opera no
nível do plano (ponto focal) ou da ação**.

### 4.1 Autorização — `routes/action-plans.ts:126-153` (`requirePlanAccess`)

```ts
const allowed =
  plan.responsibleUserId === userId ||
  plan.effectivenessEvaluatorUserId === userId ||
  (await userHasModuleAccess(req.auth!, "actionPlans")) ||
  (await userHasModuleAccess(req.auth!, SOURCE_MODULE_OWNER[plan.sourceModule]));
```

Ser responsável **concede acesso ao plano mesmo sem nenhum módulo** — é assim que o operador chega
ao plano dele vindo de "Suas Pendências".

→ **Decisão necessária:** o dono de uma ação-item precisa abrir o plano inteiro (ele precisa ver o
contexto, a causa raiz). Logo, `requirePlanAccess` tem de aceitar também *"é dono de alguma ação
deste plano"*. Sem isso, atribuir uma ação a um operador sem módulo cria um 403.

### 4.2 Suas Pendências — `services/pendencias/providers/action-plans.ts:41-42`

Filtra `inArray(responsibleUserId, ctx.responsibleUserIds)` e emite uma pendência **por plano**.
O tipo `Pendencia` (`services/pendencias/types.ts:21`) exige `responsibleUserId: number` e é
**compartilhado por 4 provedores** (kpi, action_plan, nonconformity, regulatory_document) — o
agregador (`aggregate.ts:73-87`) resolve o nome a partir dele.

→ **Decisão necessária:** a pendência deve passar a ser **a ação, não o plano** — é a ação que tem
prazo real e dono real. Provavelmente uma pendência por ação-item, com o ponto focal ainda vendo o
plano. Cuidado: mudar a granularidade muda a **contagem** que o card da home exibe.

### 4.3 Escalonamento — `services/action-plans/escalation.ts:37,48,92-150`

Varre planos vencidos (`dueDate < hoje`, status não concluído) e, para cada, notifica o responsável:
notificação in-app + e-mail (Resend). **A dedupe já é por (plano + usuário + tipo + dia)**
(`escalation.ts:112-126`), não por plano — então escalar para N pessoas **não exige redesenhar a
dedupe**, basta iterar. Uma segunda passada cobra o avaliador de eficácia
(`runActionPlanEffectivenessEscalationPass`).

→ **Decisão necessária:** cobrar o **prazo da ação** (não só o do plano), notificando o dono da
ação. O ponto focal deveria receber alguma cobrança agregada quando o plano tem ações vencidas.

### 4.4 Listagem e filtros — `_components/lista-screen.tsx:47,54-56,159,182`

- Query param `?responsibleUserId=` (`openapi.yaml:9251`) → filtro do servidor
  (`routes/action-plans.ts:175-177`)
- Botão **"Atribuídas a mim"** força `responsibleUserId = user.id` (`lista-screen.tsx:54-56`)
- Coluna "Responsável" (`:159,:182`) + busca textual sobre `responsibleUserName` (`:73-77`)
- Painel operacional mostra o responsável no alerta de vencimento (`painel-operacional.tsx:48`)

→ **Decisão necessária:** "Atribuídas a mim" tem de trazer o plano em que sou **ponto focal OU dono
de alguma ação** — senão o operador não acha o próprio trabalho.

### 4.5 Eficácia — independência do avaliador

`routes/action-plans.ts:380-388` (create) e `:591-599` (update): o
`effectivenessEvaluatorUserId` **deve ser diferente do responsável** (regra ISO — quem executa não
verifica). O front exclui o responsável das opções (`eficacia-panel.tsx:85-92`). Só admin SGI
designa o avaliador; só o avaliador designado emite o veredito (`:603-618`).

→ **Decisão necessária:** o avaliador deve ser diferente do ponto focal **e** de todos os donos de
ação? Provavelmente sim — mas atenção: isso **rejeita (400) planos existentes** em que a mesma
pessoa é avaliadora e vira dona de uma ação. É comportamento intencional, mas é uma porta de erro
nova.

### 4.6 Os demais pontos de contato

**Backend**
- `serializers.ts:85-86` — `responsibleUserId` + `responsibleUserName` no payload
- `serializers.ts:125-131` — `assertUserBelongsToOrg` (barra atribuição cross-tenant)
- `serializers.ts:135-141` — `userIsAnalyst` (analista não pode ser avaliador: é read-only, nunca
  emitiria o veredito)
- `routes/action-plans.ts:78` — `responsibleUserId` está em `DIFF_FIELDS` (log de auditoria)
- `notify-assignment.ts:23-39` — e-mail + notificação ao ser atribuído
- `derivation.ts:24-79` — **não** herda responsável da origem (KPI/NC têm responsável próprio e ele
  não é herdado; oportunidade em aberto)
- `summary.ts:5-19` — o summary **não** agrega por responsável (dashboards não fatiam por pessoa)

**Contrato** (`lib/api-spec/openapi.yaml` → gera Zod + hooks via Orval; **nunca editar os gerados**)
- `:9251` query param · `:18952-18955` `ActionPlan` · `:19064-19066` `ActionPlanListItem`
- `:19140` `CreateActionPlanBody` · `:19228` `UpdateActionPlanBody`

**Frontend**
- `[id].tsx:136,188,221,599-608` — form + hidratação + payload + o `SearchableSelect` de Responsável
- `_components/responsible-options.ts` — semeia o seletor com o responsável atual quando `orgUsers`
  volta vazia (operador **não pode** listar usuários da org: `GET /organizations/:id/users` é
  admin/gerente — `[id].tsx:110-120`). **Não perca esse detalhe:** sem isso o operador abre o plano
  dele e o campo mostra "Selecione".
- `nova-acao-dialog.tsx:46,107,157-166` · `cell-red-actions-dialog.tsx:64,164,367,459` (criar ação a
  partir de célula vermelha do KPI)
- `comentarios-historico.tsx:62-65` — **renderiza o ID cru**: a troca de responsável aparece como
  `responsibleUserId: 3 → 7`. Nome de campo em inglês, id numérico. Corrija quando mexer no diff:
  grave **nomes** no log (o `action_plan_activity_log` já snapshota `userName` pelo mesmo motivo) e
  ponha um mapa de labels na tela.

**Desacoplados de propósito (não confundir)**
- `plan5w2h.who` (`schema/action-plans.ts:50`) — **texto livre**, nunca sincronizado com o
  responsável. A IA é instruída a escrever o **cargo**, não nomes (`ai-draft.ts:43`).
- `ExternalActionItem.responsibleUserName` (`services/action-plans/external.ts`) — bridge read-only
  das `corrective_actions` da governança, **sem id**. Por isso as ações externas somem sob
  "Atribuídas a mim" (`lista-screen.tsx:84-93`).
- `createdByUserId`, `activity_log.userId` — bookkeeping.

### 4.7 Testes que já cobrem o responsável

- `tests/routes/action-plans-module-access.integration.test.ts:203-235` — responsável e avaliador
  abrem o plano **sem módulo nenhum**
- `tests/services/pendencias/action-plans-provider.integration.test.ts` — filtro por responsável
- `tests/pages/action-plan-responsible-options.unit.test.ts` — o seed do seletor
- **Sem cobertura:** a regra de independência responsável≠avaliador, o `notifyActionPlanAssignment`
  e as duas passadas de escalonamento.

## 5. Armadilhas de infra (custaram tempo real nesta sessão)

- **`pnpm db push` aponta para a PRODUÇÃO** (Neon) e tenta dropar colunas de outras branches. Para o
  banco de teste: `pnpm test:integration:db:push`. Para a produção: DDL cirúrgico.
- **Teste de integração sem `TEST_ENV=integration` bate na PRODUÇÃO** — o Vitest carrega o `.env`.
- **O container Postgres de integração é compartilhado entre worktrees.** Outra sessão rodando
  `test:integration:db:push` **dropou a tabela** no meio da nossa suíte, e o banco carrega drift de
  branches não mergeadas (ex.: `effectiveness_method_id`, do worktree de métodos de verificação).
  Um `push` cru ali propõe dropar coluna alheia. Aplique DDL cirúrgico no banco de teste também.

## 6. O que sobra para fazer, e onde

| Entrega | Onde vive |
|---|---|
| Tabela de ações-item (responsável + prazo por ação) | **feature de ações-item** |
| Os cinco mecanismos (§4.1–4.5) passando a operar no nível da ação | **feature de ações-item** |
| Rótulo "Responsável" → "Ponto focal" | junto com a de ações-item (evita conflito de merge na mesma tela) |
| "Outros responsáveis" derivado, exibido na ficha | **feature de ações-item** |
| Histórico exibindo nomes em vez de ids (§4.6) | oportunista, junto com o diff |

**Nada disso pertence a esta branch.** Ela entrega este documento.

## 7. Fora de escopo (decidido)

- **Lista explícita de co-responsáveis no plano** — rejeitada: duas fontes da verdade que divergem.
  Se um dia aparecer a necessidade de envolver alguém que não executa nenhuma ação (um consultor,
  um gestor acompanhando), isso é **participante/observador**, um conceito diferente de responsável,
  e merece sua própria decisão.
- **Múltiplos avaliadores de eficácia** — continua um só.
- **`plan5w2h.who`** — segue texto livre, desacoplado.
- **Herdar responsável da origem** (KPI/NC) — `derivation.ts` não deriva hoje; segue não derivando.

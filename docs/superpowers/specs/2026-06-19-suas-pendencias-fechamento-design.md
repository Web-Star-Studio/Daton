# Suas Pendências — Fechamento da tela (escopo por papel + calendário legível)

> Iteração de acabamento sobre a feature já construída (F1–F4, PR #102).
> Spec original: `docs/superpowers/specs/2026-06-17-suas-pendencias-design.md`.
> Data: 2026-06-19.

## Contexto e problema

A feature "Suas Pendências" está completa (F1 identidade → F4 calendário) e em teste no PR #102. Ao usar a tela, dois pontos não ficaram bons:

1. **Escopo confuso.** Hoje o seletor mostra três botões (`Minhas / Por filial / Organização`) **só para admin** (`usePermissions().isAdmin`), e o papel novo `manager` é tratado como *mine-only* no backend (adiado na F2). Na cabeça do usuário, operador e gestor estão vinculados a uma **filial** (operam serviços daquela unidade); para o admin os três escopos fazem sentido, mas para os demais o modelo "três botões pra todo mundo" não fecha.

2. **Calendário ilegível.** A visão de calendário plota cada item como um **pontinho** de 1,5px (vermelho/âmbar/azul) + um contador. Os pontinhos "passam despercebidos" — não dá pra bater o olho num dia e saber **o que** tem ali.

Esta spec fecha os dois pontos. Nada além disso muda (lista priorizada, cards, bloco de identidade, "concluídos hoje" permanecem como estão).

## Objetivo

- Tornar o escopo **ciente do papel**: cada papel vê apenas o seletor que faz sentido para ele, e o gestor passa a enxergar a filial que gere.
- Tornar o calendário **legível à primeira vista**: cada dia mostra mini-cartões ("chips") com cor da urgência + título curto do item, em vez de pontinhos.

## Não-objetivos (YAGNI)

- **Sem visão "agenda/linha do tempo"** — mantemos o grid mensal, só trocamos a célula. (Opção descartada na decisão de design.)
- **Sem picker de filial para o gestor** — o gestor é travado na própria filial (`users.unitId`); só o admin escolhe filial arbitrária.
- **Sem mudança** na lista priorizada (P1/P2/P3), nos cards de resumo, no bloco de identidade nem em "Concluídos hoje".
- **Sem mudança no agregador/providers** — os escopos continuam resolvendo `responsibleUserIds` e o motor (`aggregatePendencias`) não muda.

---

## Parte 1 — Modelo de escopo por papel

### Comportamento por papel

| Papel | Vê por padrão | Seletor na tela | Escopos permitidos |
|---|---|---|---|
| **operador / analista** | só as **suas** pendências | **nenhum** | `mine` |
| **gestor** (`manager`) com filial | **a filial dele** (todos os responsáveis com `unitId` = filial do gestor) | toggle **Minha filial ⇄ Só as minhas** (sem picker) | `mine`, `unit` (travado na própria filial) |
| **gestor sem filial vinculada** | só as **suas** | **nenhum** (cai no caso operador) | `mine` |
| **admin** (`org_admin` / `platform_admin`) | só as **suas** | botões **Minhas · Por filial · Organização** + SearchableSelect de filial quando "Por filial" | `mine`, `unit` (qualquer filial), `org` |

Regras de negócio:
- "Filial do gestor" = `users.unitId` do próprio gestor (vem do `/auth/me`, já exposto pela F1; no client via `useAuth().unitId`).
- O gestor **nunca** escolhe outra filial; o backend ignora qualquer `unitId` enviado por um gestor e usa o dele.
- Admin segue podendo escolher qualquer filial (`unit` + `unitId`) ou a organização inteira (`org`).
- Default do admin permanece **"Minhas"** (condizente com "**Suas** pendências"); ele alterna manualmente.

### Backend — `artifacts/api-server/src/routes/pendencias.ts`

Hoje (linhas 31–39) a autorização é binária: `isAdmin` pode `unit`/`org`, todo o resto só `mine`. Precisamos liberar `unit` para o gestor, travado na filial dele.

**Mudanças:**

1. **Buscar o `me` (caller, incluindo `unitId`) ANTES da resolução de escopo.** Hoje o `me` é buscado depois da agregação (linhas 68–86). Mover a query do `me` para antes da resolução de `responsibleUserIds`, porque o gestor precisa do próprio `unitId` para resolver `scope=unit`. O bloco de identidade (`filial`) continua usando esse mesmo `me`.

2. **Substituir a checagem de autorização** por uma matriz por papel:

```ts
const isAdmin = role === "org_admin" || role === "platform_admin";
const isManager = role === "manager";

// scope=org só para admin
if (scope === "org" && !isAdmin) {
  res.status(403).json({ error: "Sem permissão para este escopo" });
  return;
}

// resolve a filial efetiva para scope=unit
let effectiveUnitId: number | undefined;
if (scope === "unit") {
  if (isAdmin) {
    if (!unitId) {
      res.status(400).json({ error: "unitId é obrigatório para scope=unit" });
      return;
    }
    effectiveUnitId = unitId;
  } else if (isManager) {
    if (!me?.unitId) {
      res.status(403).json({ error: "Gerente sem filial vinculada" });
      return;
    }
    effectiveUnitId = me.unitId; // trava na filial do próprio gestor; ignora o param
  } else {
    res.status(403).json({ error: "Sem permissão para este escopo" });
    return;
  }
}
```

3. **Usar `effectiveUnitId`** (em vez de `unitId!`) na query que resolve os usuários da filial (linha 49).

`scope=mine` continua liberado para todos (incluindo gestor/operador/analista). Operador/analista pedindo `unit` ou `org` → 403 (inalterado na prática).

> Observação: `me` pode ser `undefined` apenas se o usuário autenticado não existir mais no banco — caso degenerado; o `!me?.unitId` já cobre.

### Frontend — `artifacts/web/src/pages/app/pendencias.tsx`

Hoje o seletor inteiro está dentro de `{isAdmin && (...)}` (linhas 172–200). Trocar por seleção **ciente do papel**.

1. **Ler papel e filial do contexto** (já disponíveis no mount, rota protegida):

```ts
const { organization, user: authUser, role, unitId: myUnitId } = useAuth();
const { isAdmin } = usePermissions();
const isManager = role === "manager";
const managerHasUnit = isManager && myUnitId != null;
```

2. **Estado inicial ciente do papel** (gestor abre na filial dele):

```ts
const [scope, setScope] = useState<PendenciasScope>(() =>
  managerHasUnit ? "unit" : "mine",
);
const [unitId, setUnitId] = useState<number | null>(() =>
  managerHasUnit ? myUnitId : null,
);
```

3. **Render do seletor:**
   - **admin** → os três botões `mine/unit/org` + SearchableSelect quando `scope === "unit"` (igual ao atual; mantém o hint "Selecione uma filial para ver as pendências." e o `units` via `useListUnits`).
   - **gestor com filial** → um toggle de **dois botões**: "Minha filial" (`setScope("unit")`, `unitId` = `myUnitId`) e "Só as minhas" (`setScope("mine")`). **Sem** SearchableSelect.
   - **operador / analista / gestor sem filial** → **nada** (sem bloco de seletor).

   O `useListUnits` continua habilitado só para admin (`enabled: !!orgId && isAdmin`) — o gestor não precisa da lista de filiais.

4. `usePendencias(orgId, { scope, unitId })` permanece. Para o gestor, `unitId = myUnitId`; o backend trava na filial dele de qualquer forma.

> Visual: reaproveitar o mesmo estilo de "pill" já usado nos botões de escopo (linhas 175–188) para o toggle do gestor — consistência com o toggle Lista/Calendário e com os botões do admin.

---

## Parte 2 — Calendário legível (chips em vez de pontinhos)

### Arquivo — `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx`

Manter toda a estrutura (navegação de mês, `itemsByDay`, reset de seleção ao trocar de mês, painel de detalhe do dia clicado). **Trocar apenas a renderização da célula do dia.**

**Antes (linhas 21–25, 102–112):** `DOT_COLOR` + pontinhos de 1,5px (`slice(0,3)`) + contador.

**Depois:**

1. **Remover `DOT_COLOR`.** Adicionar um mapa de estilo de chip por **urgência** (não por `badgeVariant`, para dar ao "futuro" um tom neutro distinto do azul de "aberto"):

```ts
const CHIP_STYLE: Record<Pendencia["urgency"], string> = {
  overdue: "bg-red-500/10 text-red-700 dark:text-red-300",
  due_soon: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  upcoming: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  no_due: "bg-slate-500/10 text-slate-600 dark:text-slate-300", // nunca aparece (sem dueDate), mapeado por completude de tipo
};
```

2. **Célula mais alta, alinhada à esquerda, com chips empilhados.** Trocar `aspect-square ... items-center justify-start` (linha 95) por um cartão de altura mínima:

```
flex min-h-[92px] flex-col gap-1 rounded-lg border p-1.5 text-left text-[12px]
```

   - Número do dia no topo (pequeno, `text-[11px]`).
   - Abaixo, **até 2 chips**; cada chip = `truncate rounded px-1 py-0.5 text-[10px] leading-tight` + `CHIP_STYLE[it.urgency]`, mostrando `it.title` (truncado).
   - Se `dayItems.length > 2`, uma linha de estouro: `+{dayItems.length - 2} mais` (`text-[10px] text-muted-foreground`, `px-1`).
   - **Só renderiza chips para dias do mês corrente** (`inMonth`); dias de meses adjacentes ficam só com o número esmaecido (sem chips, menos ruído). Hoje os pontinhos apareciam em qualquer dia.

3. **Interação inalterada:** clicar no dia (`onClick={() => setSelected(...)}`) abre o painel de detalhe abaixo do grid (linhas 118–137), que lista os itens do dia com os deep-links "Ver plano ↗" etc. O `aria-label` continua "Dia N: X pendência(s)".

4. **Continua plotando só itens com `dueDate`** (`itemsByDay` já pula `dueDate` nulo) e **não** mostra "concluídos hoje" (recebe `data.items`, não `completedToday`) — inalterado.

> Responsivo: em telas estreitas (grid de 7 colunas), o título do chip trunca bastante, mas a **cor** continua sendo um sinal forte (muito melhor que o pontinho de 1,5px) e o toque abre a lista completa do dia. Aceitável; não introduzimos layout alternativo para mobile.

---

## Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `artifacts/api-server/src/routes/pendencias.ts` | Mover busca do `me` para antes; autorização de escopo por papel; gestor `scope=unit` travado na própria filial (`effectiveUnitId`). |
| `artifacts/web/src/pages/app/pendencias.tsx` | Seletor de escopo ciente do papel (operador: nenhum; gestor: toggle Minha filial/Só as minhas; admin: 3 botões + picker); estado inicial por papel. |
| `artifacts/web/src/components/pendencias/PendenciasCalendar.tsx` | Chips (cor da urgência + título) no lugar dos pontinhos; célula mais alta; chips só no mês corrente. |
| Testes (ver abaixo) | Casos novos de escopo do gestor (integração) + render do seletor por papel e dos chips (unit). |

`pendencias-format.ts` **não muda** (o estilo do chip vive no componente, único consumidor).

## Testes

**Integração — `artifacts/api-server` (rota pendencias):**
- Gestor com filial, `scope=unit` → vê itens de todos os responsáveis daquela filial (inclui os dele).
- Gestor enviando `unitId` de **outra** filial em `scope=unit` → resultado continua escopado na filial **dele** (param ignorado).
- Gestor `scope=org` → 403.
- Gestor `scope=mine` → só os dele.
- (Regressão) operador `scope=unit` → 403; admin `scope=unit` com `unitId` arbitrário → funciona.

**Unit (web):**
- `pages/app/pendencias.tsx`: seletor por papel — operador/analista: nenhum botão de escopo; gestor (com `unitId`): dois botões, default "Minha filial"; admin: três botões + picker ao escolher "Por filial". (Mockar `useAuth` role/unitId + `usePendencias`.)
- `PendenciasCalendar.tsx`: dia com itens renderiza chips com o **título** visível (não pontinho); dia com >2 itens mostra "+N mais"; clicar no dia abre o painel de detalhe. (Substitui o teste antigo de contagem por pontinhos.)

## Critérios de aceite

- Operador/analista não vê nenhum seletor; vê só as próprias pendências.
- Gestor abre o painel já na filial dele (com a coluna "Responsável" povoada nos itens de terceiros), e consegue alternar para "Só as minhas".
- Gestor não consegue ver outra filial nem a organização (backend barra).
- Admin mantém os três escopos + escolha de filial.
- No calendário, cada dia do mês mostra, de relance, **o que** tem (cor + título), com "+N mais" no estouro; clicar abre a lista do dia.

---
hora: "16:38"
autor: João Pedro
branch: fix/plano-acao-5w2h-leitura
modulo: Gestão de Ações
titulo: Legibilidade 5W2H/5-porquês, bloqueio ao encerrar + reabertura por admin, timeline navegável e filial no SWOT
---

Conjunto de ajustes no módulo de Gestão de Ações (e SWOT), parte solicitada diretamente pela cliente (Ana Corrêa / Aline Pivotto) durante a validação e parte de melhoria de legibilidade. Entregue via PR #92 (squash em `main`).

**O que foi feito**
- **Legibilidade do plano (5W2H e 5 porquês):** os campos eram de linha única e cortavam o texto, exigindo arrastar o cursor para ler. Passaram a usar caixas de texto com **altura automática** (largura total, quebram linha e crescem conforme o conteúdo, sem corte nem rolagem interna). Criado componente reutilizável para isso.
- **Bloqueio do plano encerrado (requisito da cliente):** um plano que chega ao estágio **Encerramento** (concluído **com** eficácia avaliada) ou que é **cancelado** fica **somente-leitura para todos os níveis de usuário**. A **reabertura** é exclusiva do **administrador (SGI)**, que devolve o plano para "Em andamento". A trava é aplicada no **servidor** (editar, anexar/remover evidência e excluir retornam erro) e refletida na **interface** (aviso de bloqueio, campos travados e botão "Reabrir" apenas para admin). Comentários seguem liberados.
- **Linha do tempo navegável:** cada etapa do fluxo (Identificação → Encerramento) ficou clicável e rola a página até a seção correspondente, com destaque ao chegar.
- **Filial visível:** a filial passou a aparecer na lista de fatores do SWOT que requerem ação e no rótulo de **origem** da ação, para identificar de qual filial é a ação ao abri-la.

**Por quê:** atender aos pontos levantados pela cliente (bloqueio pós-encerramento com exceção do admin; mostrar a filial; melhorar a leitura dos campos) e a navegação entre as etapas do plano.

**Impacto/área:** módulo Gestão de Ações e SWOT — frontend, backend (rotas e resolução de origem) e regra compartilhada de "encerrado" no pacote de schema.

**Status:** concluído e integrado ao `main` (PR #92 mergeado).

**Validações:** `pnpm typecheck` (libs + api-server + web + e2e) verde; checks de CI (typecheck + CodeQL) verdes; teste manual na organização Demo cobrindo edição normal, concluído-com-eficácia-pendente (não bloqueia), encerrado (bloqueia + Reabrir), cancelado, reabertura por admin e exibição da filial.

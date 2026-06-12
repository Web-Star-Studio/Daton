---
hora: "22:08"
autor: João Pedro
branch: fix/acoes-autosave
modulo: Gestão de Ações
titulo: Autosave e fim da perda de edições na ficha da ação (com investigação por workflow e 5 rodadas de review de IA)
---

Correção de **perda de dados** relatada pela cliente: ao preencher um plano de ação, "tem hora q salva, tem hora q não salva; estava completinha, entra na ação e está tudo vazio". Entregue via PR #94 (squash em `main`).

**Investigação (workflow multiagente):** rodou-se uma investigação paralela (8 hipóteses + síntese) que confirmou a causa-raiz no frontend e **inocentou o backend** (persiste tudo corretamente) e a trava de encerrado.

**Causa-raiz (frontend):** o salvamento dependia exclusivamente do clique manual em "Salvar" (botão que some quando não há alteração), e o efeito de hidratação do formulário o repovoava em **qualquer** refetch do plano (conclusão, anexar evidência, invalidações), sobrescrevendo silenciosamente o que havia sido digitado. "Concluir ação" enviava só o status e disparava esse clobber — daí "concluí e ficou vazio".

**O que foi feito:**
- Hidrata o formulário apenas na **troca de plano**; refetches do mesmo plano não sobrescrevem mais edições não salvas (form limpo re-sincroniza; form com edição é protegido).
- **Autosave com debounce (~1s)**, serializado por uma fila de promessas (cada gravação roda em sequência e salva o estado mais recente), com indicador persistente (Salvando/Salvo/Alterações não salvas/Erro). Botão "Salvar" mantido como alternativa.
- "Concluir"/"Reabrir" e o botão "Voltar" gravam o formulário mais recente antes de mudar de estado; aviso ao fechar a aba e flush ao sair com pendências.

**Status:** concluído e integrado ao `main` (PR #94).

**Validações:** `pnpm typecheck` (libs + api + web + e2e) verde; CI verde (typecheck + CodeQL); **teste E2E com login real** na org Demo (autosave persiste sem clicar Salvar, dado sobrevive ao reload, e "Concluir" preserva a edição). Revisado por dois revisores de IA (cubic e Codex) ao longo de 5 rodadas, com correção dos apontamentos de concorrência (serialização do salvamento, navegação pelo retorno do save). Uma borda remanescente (digitar exatamente durante o PATCH de conclusão de um plano já com eficácia avaliada) foi registrada como limitação conhecida, não-bloqueante.

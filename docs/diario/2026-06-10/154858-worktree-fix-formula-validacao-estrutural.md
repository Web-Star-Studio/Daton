---
hora: "15:48"
autor: Aimlock
branch: worktree-fix-formula-validacao-estrutural
modulo: KPI
titulo: Correção do preview vazio em 'Como será calculado' (validação estrutural de fórmulas)
---

**O que foi feito:** Diagnóstico e correção do bug em que o preview "Como será calculado" do diálogo de edição de indicador (KPI) aparecia vazio, sem mensagem de erro, para algumas fórmulas — caso reportado por cliente ("tá diferente dos outros de ajeitar o cálculo").

**Causa raiz:** a validação de fórmulas (`validateFormula`) checava apenas caracteres válidos, variáveis declaradas e balanceamento de parênteses via shunting-yard, aceitando fórmulas estruturalmente malformadas (ex.: variável colada em parêntese sem operador, ou operador pendurado no fim como `... × 100 ÷`). O renderizador do preview usa um parser mais rigoroso que rejeita essas fórmulas — resultado: validação "ok", preview vazio e nenhum erro exibido. Essas fórmulas podiam inclusive ser salvas, embora nunca calculassem resultado.

**Correção:**
- Nova validação estrutural (alternância operando/operador e parênteses) em `validateFormula`, com mensagens claras em PT-BR apontando o ponto exato do erro (ex.: «Faltou um operador (+, −, × ou ÷) entre "Demitidos nos últimos 3 meses" e "("», «Fórmula incompleta: faltou um valor depois de "÷"»). Aplicada nas duas cópias espelhadas do avaliador (web e api-server), fechando também a brecha de salvar fórmula inválida pela API.
- Ajuste de UX no construtor visual de fórmulas: editar uma "pill" para texto inválido mantém o conteúdo anterior em vez de apagá-la silenciosamente.

**Impacto/área afetada:** módulo KPI (web: avaliador de fórmulas, construtor visual; api-server: avaliador de fórmulas). Garantia restabelecida: validação aceita ⇔ preview renderiza — o box vazio sem explicação não pode mais ocorrer. Indicadores legados com fórmula malformada passam a exibir o erro explicitamente e exigem correção da fórmula ao editar (comportamento aceito: essas fórmulas nunca produziram cálculo). Observação: a correção do "x" dentro de palavras já existe no branch `fix/formula-x-operador` e não foi duplicada.

**Status e validações:** concluído no branch de trabalho (worktree `fix-formula-validacao-estrutural`), alterações ainda não commitadas (aguardando autorização). Validações: 57 testes unitários do avaliador de fórmulas passando (7 novos, incluindo os dois casos reais reportados com asserção das mensagens exatas), `pnpm typecheck` limpo em todos os pacotes, e revisão adversarial multi-agente (3/3 aprovaram; fuzz de ~2 milhões de expressões sem divergência entre validação e renderização do preview). Falha pré-existente e não relacionada em `operational-planning.unit.test.tsx` (reproduzida sem as alterações).

---
hora: "14:29"
autor: João Pedro
branch: worktree-turma-multi-filial
modulo: Aprendizagem
titulo: Migração de banco da turma multi-filial aplicada em produção
---

**O que foi feito:** aplicada em produção a migração de banco que sustenta a turma com múltiplas filiais (tabela de vínculo turma × filial, com o responsável de cada filial), incluindo a migração das turmas já existentes.

**Por quê:** era a pendência que faltava para a funcionalidade poder ir ao ar. A migração é aditiva — nenhuma coluna existente foi alterada —, portanto o sistema em produção continuou funcionando normalmente durante e após a aplicação.

**Impacto / área afetada:** banco de produção (módulo Aprendizagem). Todas as turmas que já tinham filial receberam o vínculo correspondente; a conferência entre o número de turmas com filial e o número de turmas vinculadas fechou exatamente. A execução foi repetida para confirmar que o script é idempotente (rodar de novo não duplica nem altera nada), o que o torna seguro caso seja reexecutado durante o deploy.

**Status:** migração concluída e verificada. A funcionalidade em si segue em revisão (PR draft #204) — ela só ficará visível para o usuário após a aprovação e o deploy da aplicação.

**Validações:** verificação pós-aplicação da estrutura criada (colunas, índices e chaves estrangeiras) e da consistência dos dados migrados; segunda execução do script sem qualquer alteração de dados.

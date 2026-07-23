---
hora: "14:16"
autor: João Pedro
branch: worktree-turma-multi-filial
modulo: Aprendizagem
titulo: Turma com múltiplas filiais e responsável por filial
---

**O que foi feito:** a turma de treinamento passou a abranger **múltiplas filiais**, com **um responsável por filial** dentro da mesma turma. Na criação (passo 2 do assistente "Nova turma"), o campo Filial virou multi-seleção com a opção **"Selecionar todas as filiais"**; para cada filial marcada aparece uma linha com o seu responsável.

**Por quê:** o campo era de seleção única, mas a inscrição de participantes nunca foi restrita a uma filial. Num treinamento corporativo/EAD que atende várias unidades, o usuário era obrigado a escolher uma filial arbitrária — a informação da tela não correspondia à realidade da turma. A condição do cliente para adotar o modelo de turma única (em vez de replicar a turma por filial) foi poder indicar um responsável em cada filial.

**Impacto / área afetada:** módulo Aprendizagem.
- Banco: nova tabela de vínculo `training_class_units` (turma × filial + responsável). A coluna antiga `training_classes.unit_id` foi mantida como espelho da primeira filial, escrita na mesma transação dos vínculos, para não quebrar consumidores existentes nem criar duas fontes de verdade.
- Regra corrigida: o filtro por filial agora encontra a turma que **inclui** aquela filial. Antes, uma turma de duas filiais só aparecia no filtro da primeira.
- Telas: Gestão de turmas, Gestão de Treinamentos e ficha do catálogo passam a resumir a coluna Filial ("N filiais" / "Todas as filiais"), com a lista completa na dica de tela; a exportação em Excel lista todas por extenso.
- Contrato de API: campo `units` em criar/editar/listar turma; o campo antigo continua aceito como atalho de uma filial só (compatibilidade).

**Status:** entregue em PR draft (#204), aguardando revisão. **Pendente para o deploy:** aplicar a migração `scripts/sql/20260723_add_training_class_units.sql`, que cria a tabela e migra as turmas já existentes.

**Validações:** `pnpm typecheck` limpo; 6 testes de integração novos (multi-filial, responsável por filial, filtro por inclusão, substituição da lista, atalho legado, isolamento entre organizações e filial repetida) somados a 27 das suítes já existentes de turma/catálogo/programa anual; 14 testes unitários novos (rótulo da coluna e assistente de criação) somados a 134 do conjunto de Aprendizagem. Não foi executada verificação em servidor de desenvolvimento (preferência do projeto) — a checagem de tela foi feita renderizando a página real em teste de componente.

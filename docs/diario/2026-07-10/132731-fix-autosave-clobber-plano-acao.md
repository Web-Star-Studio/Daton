---
hora: "13:27"
autor: João Pedro
branch: fix/autosave-clobber-plano-acao
modulo: Planos de Ação
titulo: Autosave de aba desatualizada apagava o trabalho da outra
---

## Planos de Ação — autosave de uma aba desatualizada apagava o trabalho da outra

**PR:** #144 (squash em `main`, SHA `bee123a`).

**O que foi corrigido:** ao editar um plano de ação, o salvamento automático enviava o
**formulário inteiro** a cada alteração. Com duas pessoas no mesmo plano, a última aba a
salvar revertia silenciosamente tudo o que a outra havia mudado — inclusive campos que ela
nem tinha aberto.

**Como apareceu:** foi um caso real em produção. Uma administradora atribuiu um plano a uma
colaboradora; vinte segundos depois, o salvamento automático da aba da colaboradora —
carregada antes da atribuição — apagou o responsável. A tela da administradora continuava
mostrando o nome atribuído, mas no sistema o campo estava vazio. Foi assim que o problema
foi notado.

**O que foi feito:** o salvamento passou a enviar **apenas os campos que aquela aba
alterou**, comparados com a última versão que ela carregou do servidor. Um campo que a aba
não tocou não entra na requisição e, portanto, não pode ser sobrescrito. De quebra, um
salvamento sem mudança real deixou de gerar requisição inútil.

**Impacto/área:** ficha de Plano de Ação (salvamento automático). Elimina perda silenciosa
de dados em edição por mais de uma pessoa.

**Ressalva registrada:** se duas pessoas editarem exatamente o **mesmo** campo, a última
ainda vence — muito melhor do que perder campos não tocados, mas o tratamento completo
(aviso de edição concorrente) fica como evolução futura, por mudar o comportamento do
salvamento.

**Validações:** reproduzido em duas abas com o defeito ligado (responsável apagado) e
desligado (preservado, com a edição da outra pessoa salva); testes automatizados novos;
`pnpm typecheck` limpo; revisão automática sem apontamento bloqueante.

**Status:** concluído, mergeado e em produção.

---
hora: "13:27"
autor: João Pedro
branch: fix/sugerir-plano-ia
modulo: Planos de Ação
titulo: Sugerir plano (IA) falhava em silêncio e o rascunho se perdia
---

## Planos de Ação — "Sugerir plano (IA)" falhava em silêncio e o rascunho se perdia

**PR:** #143 (squash em `main`, SHA `ad95d5b`).

**Origem:** a cliente relatou que uma administradora não conseguia usar o botão **Sugerir
plano (IA)**, enquanto outra pessoa, no mesmo plano, conseguia — e ficou a dúvida se era
algo da conta dela.

**Diagnóstico:** não tinha relação com o usuário. A investigação (com apoio do registro de
auditoria da própria ficha) mostrou dois defeitos independentes:

1. **Orçamento de tokens.** O modelo de IA usado raciocina antes de responder, e esse
   raciocínio consome o mesmo limite reservado para a resposta. O limite estava apertado,
   então às vezes o raciocínio o esgotava e a IA devolvia **vazio** — de forma
   intermitente, dependendo do tamanho do texto. A tela mostrava "a IA não retornou
   sugestões", sem erro.
2. **O rascunho gerado não era salvo.** Mesmo quando a IA respondia, o texto aparecia na
   tela mas **se perdia ao recarregar a página**, por uma falha na hora de marcar o
   formulário como alterado.

**O que foi feito:** o limite de tokens foi ampliado e o esforço de raciocínio ajustado
para a tarefa; a sugestão passou a **falhar de forma clara** (com mensagem específica ao
usuário e registro no log do servidor) em vez de silenciosa; e o rascunho gerado passa a
ser efetivamente salvo.

**Impacto/área:** ficha de Plano de Ação (assistente de IA). Corrige diretamente o problema
que a cliente vivenciou.

**Validações:** verificado ponta a ponta com um servidor de IA simulado (respostas ok,
vazia, cortada e inválida) e no navegador (o rascunho persiste após recarregar); testes
automatizados novos; `pnpm typecheck` limpo; revisão automática sem apontamento bloqueante.

**Status:** concluído, mergeado e em produção.

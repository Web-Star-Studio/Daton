---
hora: "13:27"
autor: João Pedro
branch: fix/ia-orcamento-tokens-tres-callsites
modulo: IA
titulo: Dois recursos de IA quebrados em produção voltaram a funcionar
---

## IA — dois recursos que estavam quebrados em produção voltaram a funcionar

**PR:** #146 (squash em `main`, SHA `ffd197c`).

**Contexto:** a correção do orçamento de tokens da IA feita para o assistente de plano de
ação (#143) expôs que o **mesmo defeito** existia em outros três recursos que usam IA. Com
acesso à chave real da IA, foi possível testá-los — e o resultado foi pior que o esperado:
**dois estavam quebrados em produção, em silêncio.**

**O que estava quebrado:**
- **Sugestão de requisitos normativos** (na criação/edição de documentos): o limite de
  tokens era tão apertado que o raciocínio da IA o consumia inteiro e a resposta vinha
  **sempre vazia**. Nunca funcionou desde que passou a usar esse modelo.
- **Sugestão de legislação aplicável** (no módulo Ambiental / LAIA): o mesmo, e ainda pior —
  a falha era engolida internamente e não aparecia nem no registro do servidor.
- **Classificação automática de legislações (auto-tag):** este funcionava; recebeu o mesmo
  reforço por precaução.

Em ambos os casos quebrados, a cliente clicava no botão, não via nada acontecer, e concluía
que a IA "não encontrou nada".

**O que foi feito:** os três recursos passaram a ter limite de tokens adequado, esforço de
raciocínio ajustado, e o mesmo tratamento de falha explícita criado no #143 (mensagem clara
e registro no servidor, em vez de silêncio).

**Impacto/área:** sugestão de requisitos normativos (Documentos), sugestão de legislação
(Ambiental/LAIA) e auto-tag (Legislações). Recupera duas funcionalidades que a cliente
provavelmente considerava "sem resultado".

**Validações:** testado com a chave real da IA — a sugestão de requisitos passou a devolver
8 itens e a de legislação 3, ambas antes vazias; o auto-tag segue devolvendo tags. Testes
automatizados atualizados (dois deles fixavam os limites antigos e mascaravam o problema);
`pnpm typecheck` limpo; revisão automática sem apontamento bloqueante. Com isto, **todos os
pontos do sistema que usam IA passam pelo mesmo tratamento de falha** — não resta nenhum com
o defeito.

**Status:** concluído, mergeado e em produção.

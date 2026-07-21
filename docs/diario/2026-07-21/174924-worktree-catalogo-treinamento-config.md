---
hora: "17:49"
autor: João Pedro
branch: worktree-catalogo-treinamento-config
modulo: Aprendizagem
titulo: Catálogo de treinamentos: campos de classificação configuráveis (entregue em produção)
---

## Catálogo de treinamentos: campos de classificação configuráveis (entregue em produção)

**Status:** PR #195 mergeado na main; DDL e backfill de produção aplicados; deploy de backend e frontend disparado.

**O que foi entregue:** Os campos de classificação do formulário "Novo treinamento" do catálogo passaram a ser gerenciáveis por organização, com uma engrenagem "Gerenciar" ao lado de cada um que leva à nova aba Configurações → Sistema → Treinamentos:
- "Categoria" foi renomeada para "Tipo de Treinamento" (apenas rótulo).
- Tipo de Treinamento, Modalidade e Tipo de evidência viraram catálogos gerenciáveis, já semeados com os valores atuais.
- Dois campos novos foram adicionados, a pedido da cliente, e sobem sem opções (o cliente cadastra depois): Natureza do desenvolvimento e Área do conhecimento.

**Por quê:** Padroniza com o restante do sistema (Normas, Métodos de verificação já eram gerenciáveis) e dá autonomia à cliente para adaptar o vocabulário do catálogo sem depender de desenvolvimento.

**Cuidados técnicos:** O Tipo de evidência preserva a semântica que governa o elo treinamento↔competência (o que "comprova competência"); as regras passaram a ser calculadas por organização a partir do catálogo, com fallback ao vocabulário legado para não quebrar a derivação entre o deploy e a carga. Categoria/Modalidade/Natureza/Área continuam como texto (sem migração de linha). Correções da revisão de código aplicadas antes do merge: campos opcionais agora podem ser limpos, fallback replicado no frontend, e o DDL das colunas ficou atômico.

**Produção:** Tabela do catálogo de opções criada; 36 opções semeadas nas organizações; colunas de Natureza do desenvolvimento e Área do conhecimento adicionadas. Os dois campos novos sobem vazios (sem carga inicial).

**Validações:** typecheck (todos os pacotes) e build do frontend OK; testes unitários e de integração (rota nova, validação de tipo de evidência, resolvedor de competência, round-trip e limpeza dos campos, novos tipos de lista) verdes. Branch atualizado com a main (integrando #193 e #194) e revalidado antes do merge.

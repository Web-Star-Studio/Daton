---
hora: "15:54"
autor: João Pedro
branch: chore/carga-gabardo-cpf
modulo: Carga Gabardo
titulo: Correção crítica: merge-fantasmas.mjs parava de confiar em lista estática de FKs
---

**O que foi feito:** correção de revisão de código no `merge-fantasmas.mjs`
(script de carga Gabardo que funde colaboradores "fantasma" duplicados no
colaborador ativo real). O script tinha uma lista **hardcoded** de tabelas
que referenciam `employees` — levantada uma única vez contra o banco docker
(20 FKs) — mas o banco onde o `DELETE` roda de fato (produção) tem **21**: a
21ª é `users.employee_id` (`ON DELETE SET NULL`), criada por DDL cirúrgica
fora do `drizzle-kit push`. Apagar um fantasma com usuário vinculado teria
**anulado o vínculo em silêncio** (sem recusa, sem registro no manifesto, sem
possibilidade de rollback).

**Correção aplicada:**
1. `users.employee_id` catalogada na lista de dependentes verificados (par
   recusado se o fantasma tiver usuário vinculado).
2. Novo pré-voo: o script agora consulta o `information_schema` do banco
   **conectado** em toda execução e aborta o lote inteiro se aparecer
   qualquer FK que não conhece — deixa de depender de uma lista congelada;
   a próxima FK criada por DDL vira parada barulhenta, não vazamento
   silencioso.
3. Corrigidos um comentário enganoso (afirmava que uma checagem pegava uma
   inversão de ordem que na prática não pega — quem garante a ordem são os
   testes) e um cabeçalho que citava contagens fixas desatualizadas.
4. Três correções menores: guard de entrypoint em `main()` (evita disparo
   acidental por `import`), texto de uso corrigido, typo.

**Por quê:** revisão de código identificou que a segurança do script contra
apagar/anular dado real dependia de sorte (nenhum fantasma em produção tem
usuário vinculado hoje), não de desenho. A correção torna a proteção
estrutural: qualquer FK nova para `employees` — hoje ou no futuro — precisa
ser catalogada ou o script recusa rodar.

**Impacto/área afetada:** ferramenta de migração (`scripts/carga-funcoes-
treinamentos/`), ainda não aplicada em produção — a aplicação real (Task 12,
carga dos 9 pares confirmados da Gabardo) segue pendente e agora se
beneficia automaticamente desta proteção.

**Validações:**
- 8 testes novos em `test-merge-fantasmas.mjs` (réplica da FK real de
  produção no banco de teste + usuário vinculado ao fantasma → recusado,
  vínculo intacto; comparação da lista conhecida contra o `information_schema`
  do banco conectado, com prova de falsificabilidade via CLI).
- Suíte principal: 40/40 (32 originais + 8 novos).
- Regressão nas suítes vizinhas: `test-dedup-cpf` 6/6, `test-match-cpf` 9/9,
  `test-normalize-qualityweb` 13/13, `test-apply-cpf` 66/66 assertivas.
- `pnpm typecheck` (workspace inteiro): limpo.
- Prova de falsificabilidade documentada: revertendo a introspecção ou a
  entrada de `users.employee_id` na lista conhecida, os testes voltados a
  essa proteção falham de forma previsível (documentado em
  `.superpowers/sdd/task-11-report.md`).

**Status:** concluído. Nenhuma escrita em produção durante o trabalho — tudo
rodou contra o banco docker de integração.

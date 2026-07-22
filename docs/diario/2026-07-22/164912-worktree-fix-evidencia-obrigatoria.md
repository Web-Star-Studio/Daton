---
hora: "16:49"
autor: João Pedro
branch: worktree-fix-evidencia-obrigatoria
modulo: Aprendizagem
titulo: Evidência obrigatória ao registrar requisito de competência (PR #200)
---

## Aprendizagem — Evidência obrigatória ao registrar requisito de competência (PR #200, aberto)

**O que foi feito:** no diálogo "Registrar evidência" da ficha do colaborador (linha do requisito de cargo, em Formação e qualificações), o campo "Evidência" passou a ser **obrigatório**. Antes era possível salvar em branco, o que registrava a competência como atendida sem nenhuma comprovação anexada ao texto de evidência.

**Por quê:** solicitação direta do usuário após revisar a tela — evidência sem descrição não serve como comprovação auditável do requisito.

**Mudança:** contrato da API (OpenAPI `CreateCompetencyRequirementEvidenceBody.evidence` movido para `required`, com `minLength: 1`) + regeneração dos schemas Zod e hooks React Query via `pnpm --filter @workspace/api-spec codegen` + validação no formulário (botão "Salvar" desabilitado e mensagem de erro inline enquanto o campo estiver vazio). O comportamento de "salvar já registra imediatamente" (upsert direto, sem etapa extra) já existia e foi apenas confirmado, sem alteração.

**Impacto/área:** módulo Aprendizagem (LMS) → ficha do colaborador → competências do cargo. Sem migração de banco (a coluna `evidence` já existia como texto livre).

**Validações:** `pnpm typecheck` (workspace completo, sem erros); build de `api-server` e `web`; testes unitários da tela (5 casos, incluindo novo teste do campo obrigatório) e de toda a suíte de Aprendizagem (141 testes) — todos passando; testes de integração do endpoint (7 casos, incluindo novo caso de erro 400 por evidência ausente; 2 testes existentes ajustados para incluir evidência no payload) — todos passando.

**Status:** PR #200 aberto em draft (branch `worktree-fix-evidencia-obrigatoria`), aguardando revisão/merge.

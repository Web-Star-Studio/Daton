---
hora: "16:03"
autor: João Pedro
branch: worktree-catalogo-treinamento-config
modulo: Aprendizagem
titulo: Catálogo de treinamentos: categoria/modalidade/tipo de evidência configuráveis
---

## Catálogo de treinamentos: categoria, modalidade e tipo de evidência configuráveis

**O que:** Os três campos do formulário "Novo treinamento" (Categoria, Modalidade e Tipo de evidência) — que eram listas fixas em código — passaram a ser **catálogos gerenciáveis por organização**. Uma engrenagem "Gerenciar" ao lado de cada campo leva à nova aba **Configurações → Sistema → Treinamentos**, onde o cliente adiciona, renomeia, reordena e ativa/desativa as opções. Os valores atuais são semeados automaticamente.

**Por quê:** Padroniza com o restante do sistema (Normas, Métodos de verificação, Perspectivas SWOT já eram gerenciáveis) e dá autonomia ao cliente para adaptar o vocabulário do catálogo sem depender de desenvolvimento.

**Como (técnico):**
- Nova tabela `training_catalog_options` (org-scoped, discriminador `kind` = category/modality/evidence_type; `label`+`active`+`sort_order`). Para tipo de evidência há colunas semânticas `code`, `proves_competency` e `requires_validity`.
- Rota CRUD `/organizations/:orgId/training-catalog-options` (leitura livre; escrita restrita a `org_admin`). Criação idempotente por rótulo com reativação. Semeada no cadastro de nova organização e via script de backfill.
- **Semântica preservada:** o Tipo de evidência não é só rótulo — governa o elo treinamento↔competência (o que "comprova competência"). As flags substituem os valores fixos: o resolvedor de competência agora calcula por organização quais tipos comprovam, com fallback aos códigos legados enquanto o backfill não roda (não quebra a derivação entre o deploy e a carga).
- Categoria/Modalidade continuam texto (sem migração de linha); o catálogo governa apenas as opções ofertadas. Enum de tipo de evidência do contrato de API relaxado para aceitar códigos do catálogo, com validação server-side que rejeita códigos inexistentes.

**Área afetada:** Aprendizagem (catálogo de treinamentos, ficha, filtros), Configurações do Sistema, motor de competência.

**Status:** Implementado; PR #195 aberto em draft. **Pendente:** DDL de produção (criar a tabela) e backfill dos valores atuais nas organizações — portão humano.

**Validações:** `pnpm typecheck` (todos os pacotes) e build do frontend OK. Testes unitários (defaults, geração de código, helpers) e de integração (rota nova, validação de tipo de evidência, resolvedor de competência e mais 5 suítes afetadas) todos verdes.

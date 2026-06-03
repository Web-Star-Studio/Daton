---
hora: "23:18"
autor: João Pedro
branch: feat/gestao-acoes
modulo: Gestão de Ações
titulo: Ficha rica + lista priorizada + criação manual
---

- **O que:** Nova ficha rica da ação ("tela única"): linha do tempo de etapas, priorização GUT (eixos 1–5 com banda de relevância e prioridade derivada), plano 5W2H, causa-raiz (5 porquês), avaliação de eficácia (método, antes×depois, veredito), evidências, comentários e histórico/log de auditoria, e vínculos normativos/ODS. Lista priorizada com cards-resumo, filtros e tabela (GUT, origem, responsável, prazo, status, eficácia). Criação manual de ação ("Nova ação") com GUT que sugere a prioridade automaticamente.
- **Por quê:** Centralizar o tratamento numa tela única robusta e reduzir a digitação do usuário, conforme o protótipo enviado pelo cliente.
- **Impacto/área:** `artifacts/web/src/pages/app/planos-acao` (shell + _components: ficha, lista, gut-input, plano-5w2h, causa-raiz, timeline, eficacia-panel, comentarios-historico, vinculos, nova-acao-dialog) e `artifacts/web/src/lib/action-plans-client`.
- **Status:** concluído.
- **Validação:** `pnpm typecheck`/`pnpm build` verdes; testado no navegador (Playwright) num replica local da Aurora Demo — login, lista e ficha renderizando com dados reais (screenshots).

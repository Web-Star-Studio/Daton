---
hora: "23:18"
autor: João Pedro
branch: feat/gestao-acoes
modulo: Gestão de Ações
titulo: Hub unificado: origens do SGI + ponte com Governança
---

- **O que:** Expansão do módulo para hub unificado: a origem da ação passa a cobrir todo o SGI (KPI, SWOT, manual, não conformidade, achado de auditoria, risco, treinamento, ambiental/LAIA, segurança viária, incidente), com resolução de contexto e validação por origem. Botão reutilizável "Criar plano de ação" embutido nos módulos de Governança (não conformidades, riscos, auditorias), Treinamentos, LAIA e Segurança Viária. Leitura unificada (somente leitura) das ações corretivas da Governança dentro do hub, via ponte.
- **Por quê:** Tornar "Gestão de Ações" o ponto central de tratamento de todas as origens, sem reescrever o corretivo já em produção na Governança (decisão deliberada de **ponte, não migração**).
- **Impacto/área:** `lib/db` (sourceModule e sourceRef estendidos) + contrato/clientes; `artifacts/api-server` (source-context, validate-source, derivation, external); `artifacts/web` (CriarAcaoButton + 6 páginas de módulo + seção de ações da Governança na lista).
- **Status:** concluído.
- **Validação:** `pnpm typecheck`/`pnpm build` verdes; criação por origem (manual/SWOT/treinamento/incidente) e o endpoint-ponte exercitados via API no replica local; posicionamento dos botões revisado no diff.

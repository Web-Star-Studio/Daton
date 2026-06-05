---
hora: "13:24"
autor: João Pedro
branch: feat/swot-metodologia-tolerancia
modulo: SWOT
titulo: Metodologia SWOT configurável por empresa e por tipo
---

**O que foi feito:** A metodologia de pontuação da SWOT — antes fixa no código — passou a ser configurável por empresa e por tipo de fator (Fraqueza, Oportunidade e Ameaça). Para cada tipo define-se o valor de corte: resultado (desempenho × relevância, escala 1–16) **maior ou igual** a esse valor exige plano de ação; abaixo, o fator está dentro da tolerância (conforme). Força permanece sempre positiva. O valor padrão é 8, preservando o critério operante histórico (rev 17 do formulário de planejamento).

**Simplificação:** Removido o conceito de "risco extremo" e as faixas de risco (baixo/alto/extremo) de todo o módulo — a decisão passou a ser binária (dentro da tolerância × requer plano de ação), conforme alinhado.

**Onde reflete:** os valores configurados aparecem na tela de lançamento de fatores (tabela de apoio), na decisão/cor de cada fator, nos dashboards por pilar (corte por tipo) e no histórico de versões. A aba Metodologia traz os três campos, prévia ao vivo e o histórico (entrada "Padrão" quando a empresa ainda não configurou).

**Auditoria:** persistência versionada/imutável (quem alterou e quando), espelhando a metodologia do módulo LAIA. Cada alteração gera uma nova versão.

**Área afetada:** módulo SWOT (frontend), API (`/swot/methodology`), banco (tabelas `swot_methodologies` e `swot_methodology_versions`) e contratos gerados (OpenAPI / Zod / React Query).

**Status:** concluído e integrado ao `main` (PR #86, squash).

**Validações:** `pnpm typecheck` em todos os pacotes (libs, API, web, e2e) e 10 testes unitários do `swot-client` (decisão ≥, padrão 8, corte por tipo). Revisão automatizada (cubic + Codex) executada e os apontamentos corrigidos: rejeição de cortes não-inteiros na API, restrição de uma metodologia por organização (unique) e consumo único do deep-link de fator.

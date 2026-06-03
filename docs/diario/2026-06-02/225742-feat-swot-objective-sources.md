---
hora: "22:57"
autor: João Pedro
branch: feat/swot-objective-sources
modulo: SWOT
titulo: Importação dos 85 fatores do FPLAN na Gabardo (objetivos do KPI)
---

- **O que:** Populada a SWOT da **Gabardo (org 2)** com os **85 fatores do FPLAN 001**, todos vinculados ao **objetivo do KPI correto** (6/6 objetivos mapeados por nome). Feito de forma **não-destrutiva**: 24 fatores já existentes vinculados (UPDATE) + 61 novos criados (INSERT), sem apagar nada nem orfanar planos de ação.
- **Por quê:** Carregar a base real da SWOT da Gabardo a partir da planilha oficial, com rastreabilidade fator → objetivo estratégico.
- **Impacto/área:** Dados de produção (org 2, Neon). 49 Forças / 14 Fraquezas / 8 Oportunidades / 14 Ameaças.
- **Status:** concluído.
- **Validação:** auditoria fator-a-fator contra a coluna de objetivo da planilha — **85/85 corretos**, 0 sem objetivo, 0 divergente.

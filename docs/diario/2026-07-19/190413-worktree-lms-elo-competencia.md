---
hora: "19:04"
autor: João Pedro
branch: worktree-lms-elo-competencia
modulo: Aprendizagem
titulo: Elo treinamento↔competência (fundação de conformidade)
---

## Aprendizagem — elo treinamento↔competência (fundação de conformidade)

**O que foi feito.** Estabelecemos a ligação que faltava no módulo de Aprendizagem entre "o cargo exige a competência X" e "o colaborador comprovou X ao concluir um treinamento". O catálogo de treinamentos passou a declarar **o que cada treino comprova** (tipo de evidência — capacitação/habilitação/conscientização — e a lista de competências comprovadas, podendo ser mais de uma por treino). Um resolvedor único calcula, por colaborador, a conformidade do cargo combinando competências atestadas manualmente e competências derivadas de treinamentos concluídos e válidos.

**Por quê.** Antes, o sistema não sabia qual treino comprova qual competência; tratava "sem registro" como "não tem a competência" e marcava lacuna em massa — por falta de dado, não por lacuna real. Além disso, havia dois cálculos de conformidade paralelos (listagem/indicadores × ficha) que podiam se contradizer.

**Impacto / área afetada.** Módulo de Aprendizagem: catálogo de treinamentos, ficha do colaborador (bloco "Conformidade do Cargo"), listagem de colaboradores e indicadores de lacunas críticas passam todos a usar o mesmo motor. A conformidade agora distingue **três** estados por requisito — atende, lacuna e **não avaliável** (quando nenhum treino classificado poderia comprovar o requisito) —, eliminando a lacuna falsa. Editar o vínculo de um treino recalcula a conformidade na hora. A tela do catálogo ganhou os campos de tipo de evidência e seleção de competências comprovadas, por onde a equipe alimenta esse vínculo daqui pra frente.

**Status e validações.** Migração de banco **aditiva e segura** aplicada em produção (duas colunas novas no catálogo, antes do deploy do código). Cobertura de testes de integração e unidade; a distinção lacuna × não-avaliável e o vínculo com múltiplas competências foram validados de forma falsificável. `pnpm typecheck` limpo. Código publicado em PR (rascunho) aguardando revisão/deploy. A reconstrução da ficha no layout idealizado (próxima etapa) parte desta fundação.

---
hora: "15:26"
autor: João Pedro
branch: chore/carga-gabardo
modulo: Gestão de Aprendizagem
titulo: Ferramenta de carga FUNÇÕES + TREINAMENTOS (migração não-destrutiva)
---

Construída a ferramenta de carga (migração não-destrutiva) para popular o sistema com os dados que a cliente (Gabardo) trouxe em duas planilhas: cargos + competências (FUNÇÕES) e o histórico de treinamentos dos colaboradores (TREINAMENTOS, ~32,7 mil registros de 2009–2017).

**Análise dos dados**
- Confirmadas as 16 filiais reais da empresa (a partir da carga anterior de colaboradores). Um ponto de atenção importante foi identificado e resolvido: o rótulo "Anápolis" (14 mil registros) corresponde a duas filiais no sistema (Carregamento e Frota) — desambiguado pela coluna Área. E "Corporativo" (21 registros) são os treinamentos de liderança dos 3 diretores, mapeados para a filial guarda-chuva.
- As competências dos cargos (169 distintas) e o catálogo de treinamentos (852) foram extraídos e normalizados.

**Ferramenta (validada na base de teste)**
Fluxo em etapas, seguro: leitura/normalização das planilhas → simulação (dry-run, que gera um relatório de divergência sem tocar o banco) → carga (não-destrutiva e idempotente, marcada por lote) → validação → desfazer (rollback cirúrgico, que remove só o que aquele lote criou). Regra de casamento por nome do colaborador; quem não casa com o cadastro entra no relatório e não é importado.

**Qualidade e segurança**
Cada etapa foi construída com teste automatizado e passou na base de teste. Uma revisão final independente elevou a barra e apontou riscos para a carga em produção, todos corrigidos: a carga agora roda dentro de uma transação (uma falha no meio não deixa registros órfãos), o casamento por nome ganhou proteção contra homônimos (confere admissão/filial), e a simulação e a carga passaram a tratar unidades desconhecidas do mesmo jeito (a simulação é a fonte de verdade da revisão).

**Status**
Ferramenta pronta e preservada em branch próprio (separada da feature). A carga real na base da Gabardo será feita de forma controlada após a publicação do módulo de Aprendizagem, com uma nova simulação revisada pela cliente antes de aplicar (e a opção de desfazer disponível).

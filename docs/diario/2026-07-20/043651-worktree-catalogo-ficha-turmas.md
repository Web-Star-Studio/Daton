---
hora: "04:36"
autor: João Pedro
branch: worktree-catalogo-ficha-turmas
modulo: Aprendizagem
titulo: Catálogo: coluna Realizados nas turmas da ficha (paridade com o layout de referência)
---

Complemento da entrega anterior no Catálogo de treinamentos (Aprendizagem): inclusão da coluna "Realizados" na tabela de turmas da ficha do treinamento, fechando a paridade com o layout de referência.

**O que foi feito.** A tabela de turmas mostrava apenas "Inscritos". Passou a mostrar também "Realizados" — quantos participantes concluíram e foram aprovados. A leitura útil é a diferença entre as duas colunas: uma turma com 24 inscritos e 23 realizados revela que uma pessoa não concluiu, informação que interessa à avaliação de eficácia e à auditoria.

**Por que não estava pronto.** O dado já existia no banco (resultado de cada participante da turma), mas a listagem de turmas não o agregava nem o expunha. Foi necessário incluir a contagem de aprovados na resposta da listagem e no contrato da API, com a consequente regeneração do código cliente. Não houve alteração de estrutura de banco.

**Ganho colateral de desempenho.** A contagem de participantes era feita varrendo a tabela inteira, de todas as organizações, a cada listagem de turmas. Passou a ser restrita às turmas efetivamente carregadas — sem esse ajuste, a segunda contagem dobraria o desperdício.

**Impacto/área:** Aprendizagem (Catálogo e Turmas), backend e frontend. Sem alteração de banco.

**Status:** PR #173 atualizado (segue em draft, não mergeado), agora contemplando as duas frentes: correção do badge de norma que quebrava o card e a ficha com turmas, "Abrir turma" e a coluna de realizados.

**Validações:** `pnpm typecheck` limpo; suíte de integração de turmas 7/7, incluindo teste novo que cobre o filtro por treinamento e a contagem com um aprovado, um reprovado e um sem lançamento; 33 testes das bibliotecas de normas e catálogo. Conferido na interface com banco descartável, depois removido: 24→23, 18→17 e turma agendada em zero, mesma leitura do layout de referência. Registre-se que a suíte de integração tem 3 falhas pré-existentes (governance-system, laia e training-snapshot), reproduzidas na base sem estas mudanças e portanto anteriores a este trabalho.

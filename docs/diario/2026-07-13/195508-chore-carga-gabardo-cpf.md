---
hora: "19:55"
autor: João Pedro
branch: chore/carga-gabardo-cpf
modulo: Aprendizagem
titulo: Carga de treinamentos por CPF: 63.823 registros na produção, zero em revisão
---

## O que foi feito

Carregamos na produção o histórico de treinamentos que faltava para os colaboradores ativos da Transportes Gabardo, agora casando cada linha da planilha ao colaborador **pelo CPF**, e não mais pelo nome.

**Resultado:** 63.823 treinamentos e 1.875 itens de catálogo inseridos. Das 75.335 linhas da planilha, **nenhuma ficou sem vínculo** — zero linhas em revisão, zero ambiguidade, zero colaborador criado.

## Por quê

A carga anterior (06/07) usou uma planilha **sem coluna de CPF**. O único vínculo possível era o nome: quem casou, casou; quem não casou virou um "ex-colaborador" criado na hora. A cliente enviou a versão com CPF, o que permitiu um vínculo determinístico.

## Descobertas que mudaram o plano

**As duas planilhas são complementares, não versões da mesma coisa.** Apenas 31% da planilha antiga existe dentro da nova: a antiga é um dump histórico que inclui 1.498 pessoas que **já saíram da empresa**; a nova é um export só do **quadro atual**. Recarregar por cima teria destruído 22.658 registros de histórico sem reposição possível. Decisão: **nada foi apagado** — a carga é puramente aditiva.

**A carga horária precisava virar decimal antes.** A coluna era inteira, e 4.874 treinamentos da planilha duram menos de 30 minutos — todos entrariam como **0 h** e sumiriam do indicador de horas. Isso virou um PR próprio (#150), com a coluna passando a `numeric(6,2)` em três tabelas e a interface aceitando e exibindo decimal em pt-BR.

## Impacto

- Treinamentos da Gabardo: 33.810 → **97.633**
- Catálogo: 840 → **2.715** itens
- Horas de treinamento registradas: 177.775h → **337.963h**
- Colaboradores: **3.820 intactos** (nenhum criado, nenhum inativado)
- Registros históricos que entraram no board de avaliação de eficácia: **0** — o histórico não inunda a tela dos avaliadores

As 9.560 horas fracionadas só sobreviveram por causa da mudança da coluna: a menor carga gravada foi de **0,15h**.

## Validações

- Testes da ferramenta: 13 (normalização) + 9 (matcher) + 6 (dedup) + 66 (apply/rollback) + 40 (merge) — todos verdes contra banco local.
- `pnpm typecheck` verde; PR #150 com CI verde e revisão automática.
- Dry-run contra a produção antes de escrever, com os números conferidos.
- Pós-carga: contagens, integridade dos colaboradores e ausência de registros no board de eficácia, todas verificadas em produção.
- DDL de produção aplicada de forma atômica, com contagem e soma de horas idênticas antes e depois.

## Rede de segurança

Manifesto com os 65.698 identificadores inseridos e a identidade do banco, guardado fora de diretório temporário. O rollback se recusa a rodar contra outro banco ou outra organização, e preserva qualquer item de catálogo em que a cliente já tenha criado obrigatoriedade ou turma.

## Pendências

- **Relatório de pendências para a cliente:** um CPF duplicado entre dois colaboradores ativos (erro na origem), um ativo sem CPF, 73 títulos que são descrição em vez de nome, e 73 linhas com carga horária `00:00` na planilha.
- **Fusão de 9 colaboradores duplicados** criados pela carga anterior (mesma pessoa, nome grafado com/sem partícula): a ferramenta está pronta e testada, mas **não será executada** sem confirmação da cliente sobre 12 casos duvidosos.
- **Trava de visibilidade por filial** na avaliação de eficácia (Perfil Gerente) continua pendente: o dado está correto (a filial vem do cadastro do colaborador), mas o avaliador ainda não é restringido automaticamente à sua filial.

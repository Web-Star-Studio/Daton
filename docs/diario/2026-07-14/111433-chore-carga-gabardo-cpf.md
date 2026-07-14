---
hora: "11:14"
autor: João Pedro
branch: chore/carga-gabardo-cpf
modulo: Aprendizagem
titulo: Correção das horas, fusão de cadastros duplicados e revisão final da migração
---

## O que foi feito

Três operações em produção fecharam a migração do histórico de treinamentos da Transportes Gabardo, todas validadas e reversíveis.

**1. Correção das horas de treinamento.** A carga anterior (06/07) arredondava a carga horária, porque a coluna do banco era um número inteiro na época. Isso inflava o indicador de horas e fazia treinamentos curtos aparecerem como "0 h". Corrigimos **3.814 registros**, removendo **1.550,72 horas infladas**. Cento e quarenta e sete treinamentos que apareciam como zero na ficha do colaborador voltaram a mostrar sua duração real.

**2. Fusão de colaboradores duplicados.** A carga anterior casava colaborador pelo nome e, quando não encontrava, criava um novo cadastro. Como o processo não normalizava partículas ("de", "da"), oito colaboradores ativos acabaram com um cadastro duplicado carregando parte do seu histórico. Fundimos os oito no cadastro correto: os treinamentos exclusivos migraram, as duplicatas foram descartadas e os cadastros fantasmas foram removidos. **Oito colaboradores deixaram de aparecer duas vezes na lista.**

A confirmação de que eram a mesma pessoa não veio de semelhança de nome — veio dos dados: os treinamentos presos no cadastro duplicado **reapareciam no colaborador ativo**, trazidos pela carga por CPF (95% a 100% de coincidência). Esse critério inverteu duas classificações que a semelhança de nome tinha errado, em ambas as direções.

**3. Revisão final da ferramenta.** Uma revisão independente do conjunto encontrou dois problemas graves antes que causassem dano, ambos corrigidos: o mecanismo de reversão perdia o rastro de colaboradores já removidos numa re-execução, e o script mais destrutivo era o que tinha a menor proteção contra apontar para o banco errado.

## Impacto

| | Antes | Depois |
| --- | --- | --- |
| Treinamentos registrados | 33.810 | **97.346** |
| Catálogo de treinamentos | 840 | **2.715** |
| Horas de treinamento | 177.775h | **336.412h** |
| Colaboradores duplicados | 8 | **0** |
| Colaboradores ativos | 1.861 | **1.861 (intactos)** |

## Validações

- Suíte da ferramenta: **179 casos**, todos verdes. Cada correção crítica tem um teste que falha se a correção for revertida.
- Verificação pós-operação em produção: contagens conferidas, colaboradores ativos intactos, nenhum treinamento órfão, nenhum registro histórico entrando indevidamente no fluxo de avaliação de eficácia.
- Todas as três operações têm manifesto e rollback guardados fora do ambiente de trabalho.

## Governança de dados

Durante o trabalho, identificamos arquivos com dados pessoais de colaboradores (nome, cargo, filial, admissão) versionados no repositório de código. Um branch com esse conteúdo foi removido do repositório remoto e a documentação técnica passou a usar exclusivamente dados fictícios. **Permanece em aberto** uma exposição semelhante no branch principal, cuja resolução depende de decisão sobre a visibilidade do repositório.

## Pendências com a cliente

Enviado relatório com cinco pontos que dependem da Gabardo: um CPF duplicado entre dois colaboradores, três colaboradores ativos sem CPF, treze casos de possível duplicação de cadastro (basta o CPF para resolver), 73 treinamentos cujo nome é um texto de descrição, e treinamentos exportados com carga horária zerada.

## Limitação conhecida

Cerca de 1.190 registros antigos não puderam ter a carga horária corrigida, porque o nome do colaborador na planilha antiga corresponde a mais de uma pessoa no cadastro (há 46 grupos de homônimos). A ferramenta se recusa a adivinhar. O erro residual estimado é de 50 a 60 horas em 336 mil — 0,02%.

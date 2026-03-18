---
title: Questionário, tags de compliance e filtragem de legislações por unidade
suggested_slug: questionario-tags-de-compliance-e-filtragem-de-legislacoes
category: Qualidade
priority: P2
summary: Explica como respostas do questionário geram unit_compliance_tags e como essas tags ajudam a identificar legislações relevantes para cada unidade, além do papel da avaliação de conformidade por unidade.
source_files:
  - artifacts/api-server/src/routes/questionnaire.ts
  - artifacts/api-server/src/routes/legislations.ts
  - artifacts/api-server/src/routes/unit-legislations.ts
  - lib/db/src/schema/questionnaire.ts
---

# Questionário, tags de compliance e filtragem de legislações por unidade

## Visão geral

O Daton usa o questionário da unidade para gerar tags de compliance. Essas tags ajudam a relacionar a realidade operacional da unidade com legislações potencialmente aplicáveis e com a avaliação de conformidade por unidade.

## Quando usar

Use este artigo quando a dúvida for:

- como o questionário influencia a compliance da unidade
- de onde vêm as tags da unidade
- por que determinada legislação aparece como relevante para uma unidade

## Quem pode executar ou aprovar

- Usuários com escrita podem salvar respostas e submeter o questionário da unidade.
- Usuários com acesso de leitura podem consultar respostas e tags já geradas.

## Regras e estados do sistema

- O questionário é estruturado por temas e perguntas.
- Perguntas podem mapear respostas para uma ou mais tags.
- Ao submeter o questionário, o backend recalcula as tags da unidade.
- As tags são gravadas em `unit_compliance_tags`.
- A relação entre unidade e legislação é persistida separadamente em `unit_legislations`, com `complianceStatus`, notas, evidências e data de avaliação.

## Fluxo passo a passo

1. A unidade responde o questionário.
2. O sistema salva ou atualiza as respostas por pergunta.
3. Na submissão, o backend lê as respostas e procura o mapeamento de tags de cada pergunta.
4. O conjunto anterior de tags da unidade é substituído pelo novo resultado calculado.
5. Essas tags ajudam a identificar legislações relevantes para o perfil operacional da unidade.
6. A organização pode então avaliar a conformidade da unidade em relação às legislações vinculadas.

## Exceções, bloqueios e erros comuns

- Salvar resposta não é o mesmo que submeter o questionário; as tags oficiais são recalculadas na submissão.
- Unidade fora do tenant não pode ter respostas ou tags manipuladas.
- A presença de tags não substitui a avaliação formal de conformidade por unidade.
- Auto-tag de legislação usa vocabulário controlado e não inventa tags fora do conjunto conhecido.

## Relação com outros módulos

- Qualidade: questionário e tags
- Legislações: cadastro das normas e avaliação por unidade
- Evidências: anexos de conformidade associados à relação unidade-legislação

## Limites atuais

- O Daton AI pode explicar como as tags são geradas e como elas se relacionam com legislações, mas não responde o questionário nem altera avaliações automaticamente.
- O artigo cobre o fluxo implementado de perguntas, tags e vínculo com compliance por unidade.

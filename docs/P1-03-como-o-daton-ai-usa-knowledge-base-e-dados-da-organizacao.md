---
title: Como o Daton AI usa knowledge base e dados da organização
suggested_slug: como-o-daton-ai-usa-knowledge-base-e-dados-da-organizacao
category: IA
priority: P1
summary: Explica quando o Daton AI responde com a knowledge base global, quando usa consultas read-only no banco da organização e como ele combina as duas fontes sem misturar regras do produto com dados do tenant.
source_files:
  - artifacts/api-server/src/lib/daton-ai.ts
  - artifacts/api-server/src/lib/daton-ai-assistant.ts
---

# Como o Daton AI usa knowledge base e dados da organização

## Visão geral

O Daton AI combina duas fontes diferentes de informação:

- a knowledge base global do produto
- consultas read-only nos dados da organização do usuário

O objetivo é separar explicação de produto de informação factual do tenant.

## Quando usar

Use este artigo quando a dúvida for:

- por que o assistente respondeu com explicação e não com números
- quando ele consulta o banco
- como ele lida com perguntas mistas
- quais são os limites operacionais da IA

## Quem pode executar ou aprovar

- Usuários autenticados da organização usam o assistente dentro do escopo do próprio tenant.
- O comportamento do assistente é controlado pelo backend e pelo system prompt.

## Regras e estados do sistema

O assistente segue esta lógica:

- perguntas sobre uso do sistema, fluxos, módulos e limites atuais priorizam a knowledge base
- perguntas sobre contagens, pendências, responsáveis, status e registros reais usam consulta ao banco
- perguntas mistas combinam KB e banco

Regras adicionais:

- consultas SQL são somente leitura
- o prompt reforça isolamento por `organizationId`
- tabelas sem `organization_id` direto devem ser filtradas por join com a entidade pai
- o assistente não deve inventar dados nem executar mutações

## Fluxo passo a passo

1. O usuário envia uma mensagem.
2. O backend monta o system prompt com regras do produto e do banco.
3. Se a KB estiver habilitada, o assistente usa `file_search` para recuperar artigos publicados e indexados.
4. Se a resposta exigir dados reais, o assistente chama a ferramenta `query_database`.
5. O backend executa apenas `SELECT` ou `WITH ... SELECT`.
6. A resposta final pode trazer conteúdo explicativo, dados reais e fontes recuperadas da KB.

## Exceções, bloqueios e erros comuns

- Artigos em rascunho não entram no RAG.
- Sem vector store configurado, a KB não é usada via `file_search`.
- Perguntas operacionais como aprovar ou criar registros não devem ser executadas pela IA.
- Consultas fora do tenant devem ser bloqueadas pela regra de isolamento.

## Relação com outros módulos

- A knowledge base global é mantida pelo módulo administrativo da plataforma.
- Os módulos operacionais, como Governança e Documentação, fornecem o conteúdo factual consultado no banco.

## Limites atuais

- O Daton AI não cria, edita, aprova, distribui ou arquiva registros no sistema.
- Ele explica fluxos e lê dados; não substitui o usuário em ações críticas.
- O comportamento conceitual do assistente depende dos artigos publicados e indexados na KB.

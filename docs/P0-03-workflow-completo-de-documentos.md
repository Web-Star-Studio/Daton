---
title: Workflow completo de documentos
suggested_slug: workflow-completo-de-documentos
category: Documentação
priority: P0
summary: Descreve o ciclo completo do documento controlado no Daton, cobrindo draft, in_review, approved, distributed e acknowledge, além das transições, automatismos e bloqueios operacionais.
source_files:
  - artifacts/api-server/src/routes/documents.ts
---

# Workflow completo de documentos

## Visão geral

O módulo de Documentação controla o ciclo de vida de documentos internos com versionamento, revisão, aprovação, distribuição e confirmação de leitura.

## Quando usar

Use este artigo para entender:

- em que ordem o documento avança no sistema
- quando um documento pode ser editado ou reenviado
- quando a distribuição acontece automaticamente
- quem pode confirmar o recebimento e a leitura

## Quem pode executar ou aprovar

- Usuários com acesso ao módulo de Documentação e permissão de escrita podem criar, editar, submeter e distribuir documentos, conforme o estado.
- A aprovação e a rejeição só podem ser registradas por um aprovador pendente do ciclo atual.
- Destinatários são os únicos que confirmam recebimento e leitura.
- `analyst` não executa ações de escrita.

## Regras e estados do sistema

Os estados principais do documento são:

- `draft`
- `in_review`
- `approved`
- `rejected`
- `distributed`

Regras importantes:

- Somente documentos em `draft` ou `rejected` podem ser submetidos para revisão.
- O envio para revisão exige pelo menos um aprovador.
- A aprovação só ocorre quando todos os aprovadores pendentes do ciclo atual aprovam.
- Se houver destinatários cadastrados, o documento pode ir para `distributed` automaticamente logo após a aprovação final.
- O acknowledge só acontece para documento em `distributed`.

## Fluxo passo a passo

1. Criar o documento em `draft`.
2. Definir metadados, unidades, elaboradores, aprovadores, destinatários, referências e anexos.
3. Submeter o documento para revisão, mudando o estado para `in_review`.
4. Cada aprovador pendente do ciclo atual registra aprovação ou rejeição.
5. Se um aprovador rejeitar, o documento passa para `rejected`.
6. Se todos aprovarem, o documento passa para `approved`.
7. Se existirem destinatários, o sistema pode marcar `distributed` automaticamente após a aprovação.
8. Se não houver distribuição automática, um usuário com escrita pode distribuir manualmente um documento já `approved`.
9. Cada destinatário confirma recebimento e leitura por meio do acknowledge.

## Exceções, bloqueios e erros comuns

- Documento sem aprovadores não pode ser submetido.
- Documento em `in_review` não deve ser tratado como editável.
- Documento em `approved` não volta a `draft` automaticamente; o fluxo depende das regras já previstas no módulo.
- Apenas destinatários do documento podem fazer acknowledge.
- O acknowledge falha se o documento ainda não estiver em `distributed`.

## Relação com outros módulos

- Notificações avisam aprovadores, participantes e destinatários em momentos-chave do fluxo.
- O módulo de Governança pode gerar documentos de evidência automaticamente.
- Referências cruzadas ajudam a relacionar documentos controlados entre si.

## Limites atuais

- O Daton AI pode explicar o fluxo e responder dúvidas sobre estados, mas não cria, edita, aprova, distribui ou confirma leitura por conta própria.
- O sistema trata os estados do documento como fonte oficial; o artigo não substitui o estado real salvo na base.
- O fluxo descrito é o workflow implementado hoje, não um manual genérico de gestão documental.

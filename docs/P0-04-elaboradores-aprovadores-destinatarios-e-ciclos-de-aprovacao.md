---
title: Elaboradores, aprovadores, destinatários e ciclos de aprovação
suggested_slug: elaboradores-aprovadores-destinatarios-e-ciclos-de-aprovacao
category: Documentação
priority: P0
summary: Explica os papéis operacionais do módulo de Documentação, o funcionamento do approvalCycle, reenvio para revisão, aprovação parcial, rejeição e confirmação de leitura por destinatários.
source_files:
  - artifacts/api-server/src/routes/documents.ts
---

# Elaboradores, aprovadores, destinatários e ciclos de aprovação

## Visão geral

O módulo de Documentação separa claramente quem prepara o documento, quem aprova e quem recebe o conteúdo controlado. O fluxo de aprovação também é organizado em ciclos.

## Quando usar

Use este artigo quando a dúvida for:

- quem participa do fluxo documental
- como o sistema trata reenvio para revisão
- o que significa `approvalCycle`
- por que um documento já aprovado por uma pessoa ainda não foi concluído

## Quem pode executar ou aprovar

- Elaboradores participam da preparação do documento.
- Aprovadores registram aprovação ou rejeição quando estão pendentes no ciclo atual.
- Destinatários recebem o documento distribuído e confirmam leitura.
- Usuários com escrita no módulo podem montar a configuração do fluxo, mas não aprovam em nome de outro usuário.

## Regras e estados do sistema

- Os aprovadores são registrados na tabela de aprovadores do documento.
- O sistema trabalha com `approvalCycle` para distinguir cada rodada de revisão.
- Ao submeter um documento, o backend cria novos registros `pending` para o próximo ciclo.
- Enquanto existir aprovador `pending` no ciclo atual, a aprovação global do documento não é concluída.
- Se um aprovador rejeita, o documento vai para `rejected`.
- Ao reenviar o documento, um novo ciclo é aberto.

## Fluxo passo a passo

1. Cadastrar elaboradores, aprovadores e destinatários do documento.
2. Submeter o documento para revisão.
3. O sistema identifica o maior `approvalCycle` existente e abre o próximo ciclo.
4. Cada aprovador do novo ciclo entra como `pending`.
5. Cada aprovação individual registra histórico e comentário opcional.
6. Se ainda houver aprovadores pendentes, o documento continua em revisão.
7. Quando todos os aprovadores do ciclo atual aprovam, o documento avança para `approved`.
8. Se houver destinatários, o documento pode ser distribuído.
9. Cada destinatário registra `receivedAt` e `readAt` ao confirmar o recebimento e a leitura.

## Exceções, bloqueios e erros comuns

- Um usuário não aprova se não for aprovador pendente do ciclo atual.
- Um aprovador antigo de ciclo anterior não conclui o ciclo mais recente.
- Rejeição encerra a rodada corrente e devolve o documento para ajustes.
- Destinatário sem vínculo com o documento não pode fazer acknowledge.
- A distribuição não substitui a aprovação; são etapas diferentes.

## Relação com outros módulos

- Notificações informam aprovação registrada, rejeição, documento aprovado, distribuição e confirmação de leitura.
- O versionamento do documento registra as mudanças mais relevantes do fluxo.

## Limites atuais

- O Daton AI explica a diferença entre elaboradores, aprovadores e destinatários, mas não altera participantes nem registra aprovações.
- O sistema usa o ciclo atual como referência oficial; interpretações fora dessa estrutura não devem ser tratadas como verdade operacional.
- O artigo cobre apenas os papéis e ciclos implementados hoje no módulo de Documentação.

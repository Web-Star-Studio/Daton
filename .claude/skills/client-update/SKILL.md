---
name: client-update
description: Gera mensagens padronizadas de atualização do sistema Daton para enviar ao grupo do cliente via WhatsApp. Use quando o usuário quiser redigir ou enviar uma notificação de novo módulo, funcionalidade, guia ou correção implementada.
---

# Skill: client-update

Gera mensagens prontas para copiar e colar no grupo do cliente, seguindo o padrão de comunicação já estabelecido pelo usuário.

## Como usar

O usuário invoca `/client-update` opcionalmente passando argumentos livres descrevendo o que foi implementado. Exemplos:

```
/client-update módulo de gestão de infraestrutura
/client-update guia de recuperação de senha
/client-update módulo de fornecedores, dados de 2025 já registrados
```

Se nenhum argumento for passado, pergunte o que foi implementado antes de gerar a mensagem.

## Passos de execução

1. **Determine o saudação** com base na hora atual do sistema:
   - 05h–11h59 → `Bom dia!`
   - 12h–17h59 → `Boa tarde!`
   - 18h–04h59 → `Boa noite!`
   
   Execute `date +%H` para obter a hora atual.

2. **Identifique o tipo de atualização** a partir dos argumentos:
   - Novo módulo → mencionar que está disponível/implementado
   - Guia/tutorial → mencionar que o guia está em anexo ou segue em seguida
   - Funcionalidade específica → descrever brevemente
   - Dados pré-registrados → mencionar explicitamente

3. **Monte a mensagem** seguindo os padrões abaixo.

## Padrões de mensagem

### Novo módulo (sem dados pré-registrados)
```
{saudação} O módulo de {nome do módulo} já está disponível no sistema de vocês. O guia de utilização está em anexo.
```

### Novo módulo (com dados pré-registrados)
```
{saudação} O módulo de {nome do módulo} já está implementado no sistema de vocês, com os dados de {ano/período} registrados. Segue o guia de utilização.
```

### Guia / tutorial isolado
```
{saudação} Segue o guia de {nome do guia/funcionalidade}.
```

### Correção ou melhoria
```
{saudação} A {funcionalidade} foi atualizada no sistema de vocês. {Breve descrição do que mudou.} O guia atualizado está em anexo.
```

## Regras de estilo

- Sempre iniciar com a saudação seguida de espaço.
- Tom direto e cordial — sem excessos formais ou informais.
- Usar "sistema de vocês" para se referir à instância do cliente.
- Referência ao guia sempre ao final: "está em anexo" ou "segue o guia de utilização" dependendo do contexto.
- Mensagens curtas: idealmente 1–2 frases.
- Escrever em português brasileiro.

## Saída esperada

Apresente a mensagem pronta dentro de um bloco de código para facilitar a cópia, seguido de uma linha de confirmação pedindo ao usuário se quer ajustar algo:

```
{mensagem gerada}
```

> Quer ajustar algo? (ex.: adicionar dados pré-registrados, mudar o guia mencionado, ou gerar uma versão alternativa)

# Tipo da competência com fonte única — Design

**Data:** 2026-07-20
**Módulo:** Aprendizagem — catálogo de competências e competências do cargo
**Origem:** relato da cliente (Ana): *"todas as formações que eu cadastrei como CONHECIMENTO, quando vinculo no cargo, aparece como Habilidade"*.

## Diagnóstico

O vínculo competência↔cargo tem um **campo de tipo próprio**, separado do catálogo. Ele:

1. **Oferece uma taxonomia diferente** — o formulário lista `formacao / experiencia / habilidade`, enquanto o catálogo usa **CHA** (`conhecimento / habilidade / atitude`).
2. **Começa sempre em `habilidade`** (`EMPTY_LINK`) e não herda o tipo do catálogo.
3. Ao criar a competência "na hora", grava `competencyType: "habilidade"` fixo no catálogo também.

Resultado: a competência cadastrada como *Conhecimento* vira *Habilidade* no cargo.

### Consequência funcional (mais grave que o badge)

O resolver de competências monta a chave de correspondência com **nome + tipo**:

```ts
buildCompetencyKey(name, type) => `${name}::${type || "habilidade"}`
```

O requisito usa o **seu** tipo; o treinamento/catálogo usa o **dele**. Quando divergem, as chaves não batem e **o treinamento nunca prova o requisito** — a pessoa fez o curso e o cargo segue exibindo lacuna. A queixa estética da cliente é a ponta visível de um bug que quebra o elo treino↔competência.

### Medição na produção

| | |
|---|---|
| Requisitos com item correspondente no catálogo | **33** |
| Desses, com tipo divergente | **11** — 7 `atitude→habilidade`, 4 `conhecimento→habilidade` |
| Requisitos da Gabardo **sem** item no catálogo | **706** de 717 (carga do V1) |
| Linhas usando `formacao` ou `experiencia` (em qualquer tabela) | **0** |

As 11 divergências colapsam **todas** para `habilidade` — assinatura do valor padrão do formulário. E o enum do contrato (`[formacao, experiencia, habilidade]`) **nunca** correspondeu ao dado real: é ficção, na mesma classe do `em_andamento`.

## Decisões (confirmadas com o usuário)

1. **Fonte única: o catálogo.** O tipo é propriedade da *competência*, não do *requisito*. O requisito passa a dizer apenas **qual** competência e **em que nível**.
2. **Corrigir as 11 linhas divergentes** na produção, alinhando ao tipo do catálogo (com rollback registrado).

## Desenho

### Interface
- O formulário de vínculo **perde o campo "Tipo"**. Ao escolher a competência, o tipo mostrado é o do catálogo (somente leitura).
- Na lista de competências do cargo, o badge de tipo passa a refletir o catálogo.
- Criar competência "na hora" deixa de gravar `habilidade` fixo: o formulário passa a pedir o tipo **no ato da criação** (com a lista CHA), porque aí sim ele é atributo da competência nova.

### Backend
- Ao criar/atualizar um requisito, o `competencyType` gravado é **o do item de catálogo correspondente** (casado por nome, org-scoped), e não mais o que vier do cliente.
- Se não houver item de catálogo correspondente (caso dos 706 legados), preserva-se o tipo já gravado no requisito — **não** se apaga histórico nem se inventa valor.
- O enum do contrato passa de `[formacao, experiencia, habilidade]` para **`[conhecimento, habilidade, atitude]`**, alinhando-o ao dado real. Nenhuma linha usa os valores removidos, então a mudança não invalida registro algum.

### Correspondência (resolver)
Nada muda na mecânica: com o tipo vindo de uma fonte só, as duas pontas da chave `nome::tipo` passam a coincidir naturalmente. As 11 correções de dado, portanto, **também corrigem lacunas falsas** onde o treinamento existia e não era reconhecido.

## Fora de escopo (YAGNI)

- **Os 706 requisitos sem item de catálogo.** Não há tipo "correto" a herdar; ficam como estão. Criar itens de catálogo para eles é decisão de negócio separada.
- Mudar a chave de correspondência para ignorar o tipo (só nome). É alternativa defensável, mas altera a mecânica da Fase 1 sem necessidade, já que a fonte única resolve o problema na raiz.
- Renomear/unificar a taxonomia com outras áreas do sistema.

## Testes

- **Unitários (web-unit):** o formulário de vínculo não oferece campo de tipo; o badge exibido vem do item de catálogo escolhido.
- **Integração (`TEST_ENV=integration`):**
  - criar requisito para competência cujo catálogo é `conhecimento` grava `conhecimento` no requisito, **mesmo que o cliente envie outro valor** no corpo;
  - criar requisito para competência **sem** item de catálogo preserva o tipo enviado (caso legado);
  - regressão do resolver: requisito e treinamento com o mesmo nome e tipo vindo do catálogo **casam** (a competência deixa de ser lacuna).
- `pnpm typecheck` limpo.

## Entrega

- **Sem DDL.** Nenhuma coluna nova; a coluna `competency_type` continua existindo em ambas as tabelas.
- **Correção de dados em produção:** `UPDATE` em 11 linhas de `position_competency_requirements`, alinhando ao tipo do catálogo. Requer autorização explícita e rollback registrado antes de aplicar.

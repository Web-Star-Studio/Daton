# Evidência pela linha do requisito + "Outras competências" — Design

**Data:** 2026-07-21
**Módulo:** Aprendizagem → Ficha do colaborador
**Origem:** relato da cliente (Ana) — "Como eu coloco as evidências aqui?" na tela de competências do cargo.

## Contexto

Depois do redesenho em painel único (PR #171) somado ao elo treinamento↔competência (Fase 1, PR #170), a ficha do colaborador passou a ter **dois blocos de competência**, o que confundiu a cliente:

1. **"Competências do cargo"** (dentro do card "Formação e qualificações") — alimentado por `competencyConformance` (resolvedor compose-on-read). Lista os requisitos do cargo (`position_competency_requirements`, carregados da planilha FUNÇÕES) e, para cada um, calcula ao vivo o veredito `atende` / `gap` / `nao_classificado`. **É somente leitura.** Para a Gabardo, como os treinos ainda não têm `evidence_type` classificado e não há atestado manual casado, todas as linhas saem "Não avaliável".

2. **"Competências"** (seção própria mais abaixo) — `employee_competencies`, o card rico manual com Nível Requerido/Adquirido, Evidência (texto) e Anexos (PDF), editável. **É aqui que a evidência sempre entrou**, mas ficou empurrado para baixo e visualmente desconectado.

**A causa raiz não é só layout.** O resolvedor casa requisito↔atestado pela chave `buildCompetencyKey(nome, tipo)`. A competência manual que a cliente cria tem **nome livre** ("Formação como Auditora Interna da ISO 14001 (última revisão)") que **não bate** com o nome do requisito ("FORMAÇÃO DE AUDITOR INTERNO ISO 14001"). Resultado: mesmo anexando o certificado, o requisito continua "Não avaliável" — a evidência fica órfã. Os dois blocos nunca se conectam.

`employee_competencies` **já é uma das fontes** do resolvedor (`competency-resolver.ts:182-202`, `acquiredLevel = max(manual, treino)`); o problema é exclusivamente o descasamento de nome/tipo.

## Objetivo

Fazer a evidência entrar **pela própria linha do requisito**, herdando `nome + tipo + nível` do requisito — de modo que a chave case por construção, o resolvedor reconheça na hora e a linha vire "Atende" com o anexo à vista. E deixar os dois blocos com papéis inequívocos via nomenclatura + subtítulos.

## Decisões travadas (com o usuário)

- **Direção: Opção A** — linha do requisito acionável (não fundir tudo num só card, não só destacar o editável).
- **Bloco de baixo mantido**, renomeado **"Outras competências"** (competências que **não** são requisito do cargo).
- **Casamento de nome/tipo é autoritativo no backend** (mesmo `buildCompetencyKey` do resolvedor). O frontend **nunca** re-deriva a normalização — foi justamente o descolamento que causou o bug.
- **Sem tabela nova e sem DDL.** Reutiliza `employee_competencies`. Sem correção de dado em produção (os cadastros legados de nome livre passam a aparecer naturalmente em "Outras competências").

## Design

### 1. "Competências do cargo" vira acionável

O bloco (`FormacaoQualificacoes.tsx`) continua exibindo os requisitos com os 3 estados, e ganha ação por linha (só para quem tem escrita em colaboradores):

A ação da linha é roteada pela **presença de atestado manual** (`manualCompetencyId`), não pela fonte resolvida:

- **Sem atestado manual** (`manualCompetencyId == null`) e status `gap` ou `nao_classificado` → botão **"+ Evidência"** (abre o diálogo em branco).
- **Com atestado manual** (`manualCompetencyId != null`, qualquer status) → **lápis** para **editar** o atestado (reabre pré-preenchido). Vale inclusive para uma linha `gap` parcial e para uma `atende` provada por treino que **também** tem atestado manual — o atestado continua editável, nunca fica órfão.
- **`atende` via `treinamento`** → mostra "via treinamento «título»", informativo e **visível também para quem não pode editar** (explica por que o requisito está atendido). Se houver atestado manual junto, o lápis aparece ao lado.

Subtítulo do bloco: **"Exigidas pelo cargo · anexe a evidência de cada uma"**.

### 2. Diálogo "Registrar evidência do requisito"

Diálogo focado (mais simples que o de 3 passos de "Nova Competência"), aberto a partir da linha:

- **Nome** e **Tipo**: exibidos **travados** (read-only) — vêm do requisito, garantem o casamento da chave.
- **Nível adquirido**: numérico 0–5, **default = nível requerido do requisito** (ao salvar já vira "Atende"); pode ser abaixado se a competência for parcial.
- **Evidência** (texto, opcional) — ex.: "Certificado".
- **Anexos** — o mesmo uploader R2 de hoje (`ProfileItemAttachmentsField` + `uploadEmployeeRecordFiles`, aceita PDF/imagem).
- Ao **editar** um atestado existente, o diálogo abre pré-preenchido com os valores atuais.
- **Remoção de atestado fica fora desta versão** (follow-up): apagar só a linha apontada por `manualCompetencyId` deixaria duplicatas legadas de mesma chave para trás — o requisito continuaria "atendido" pela duplicata e o "Remover" pareceria não funcionar. Um remover correto precisa de exclusão **por chave** no backend. Para neutralizar um atestado agora, baixa-se o nível (o upsert atualiza todas as duplicatas da chave).

### 3. Backend: upsert por chave do requisito

Novo endpoint que grava o atestado manual **casando a chave no servidor**:

```text
POST /organizations/{orgId}/employees/{empId}/competency-requirement-evidence
body: { competencyName, competencyType, requiredLevel, acquiredLevel, evidence?, attachments? }
```

Comportamento (reutiliza o padrão já existente em `employees.ts:3958-4003`):

- Carrega `employee_competencies` do colaborador; procura por `buildCompetencyKey(competencyName, competencyType)`.
- **Existe** → `update` (define `acquiredLevel`, `evidence`, `attachments`, e `requiredLevel` do requisito). Aqui o nível é **exatamente** o enviado (edição manual pode baixar; diferente do fluxo de eficácia, que usa `max`).
- **Não existe** → `insert` com `name/type/requiredLevel` do requisito + `acquiredLevel/evidence/attachments`.
- Valida anexos com `validateEmployeeRecordAttachments` (igual aos endpoints atuais).
- Retorna o registro (`formatCompetencyRecord`).

Os endpoints atuais (`POST/PATCH/DELETE .../competencies`) **permanecem** — servem a "Outras competências" (criação livre).

### 4. Split autoritativo entre os dois blocos

Para "Outras competências" mostrar **só** o que não é requisito, e para a linha do requisito saber qual atestado editar, o backend marca o vínculo (nunca o frontend):

- **`ResolvedRequirement.manualCompetencyId: number | null`** — o `employee_competencies.id` que atesta aquele requisito à mão, populado **sempre que há atestado manual casado** (mesmo quando a `source` resolvida é `treinamento` — o atestado manual continua editável pelo id), para a linha abrir o diálogo em modo edição. `null` só quando não há atestado manual.
- **Registro de competência ganha `isPositionRequirement: boolean`** no retorno do GET do colaborador — `true` quando a chave da competência casa com algum requisito do cargo. Computado no handler com `buildCompetencyKey` contra o conjunto de requisitos do cargo.

Frontend:

- **"Competências do cargo"** = `conformance.requirements` (como hoje) + ações.
- **"Outras competências"** = `employee.competencies.filter(c => !c.isPositionRequirement)`. Subtítulo: **"Qualificações além das que o cargo exige"**. Botão "Nova Competência" mantém a criação livre. Se a lista ficar vazia, some (ou mostra estado vazio discreto).

### 5. Contrato (OpenAPI) e codegen

- Adicionar o path `competency-requirement-evidence` (request/response) em `lib/api-spec/openapi.yaml`.
- Adicionar `isPositionRequirement` ao schema do registro de competência e `manualCompetencyId` ao schema de `ResolvedRequirement`/conformance.
- Rodar `pnpm --filter @workspace/api-spec codegen` (gera Zod + hook React Query `useCreateCompetencyRequirementEvidence`).

## Fora de escopo (não fazer agora)

- Fundir os dois blocos num só (Opção B).
- Propagar edição retroativa do tipo do catálogo para requisitos já vinculados (follow-up herdado do PR #186).
- Qualquer correção de dado em produção — esta entrega é feature pura.
- Nível de proficiência mais rico que 0–5 (mantém o modelo atual).

## Modelo de dados / DDL

Nenhuma tabela nova, **nenhuma DDL**. Só leitura/escrita em `employee_competencies` (colunas já existentes) e leitura de `position_competency_requirements`.

## Estados e invariantes preservados

- `nao_classificado` **nunca** conta como lacuna (fora do selo/barra/denominador) — invariante da Fase 1 mantido.
- Uma linha só vira "Atende" quando `acquiredLevel >= requiredLevel` (resolvedor inalterado).
- O selo verde do card não deve dizer "Requisitos atendidos" quando o denominador é 0/0 — corrigir de passagem para refletir "nada avaliado ainda" (achado do diagnóstico, `FormacaoQualificacoes.tsx:84`).

## Testes

- **Backend (integração):** upsert cria quando não existe; atualiza (inclusive baixando nível) quando existe; a linha do requisito correspondente passa a `atende` no GET do colaborador; `isPositionRequirement`/`manualCompetencyId` corretos; permissão (analyst 403); anexo inválido 400.
- **Resolver (unit):** `manualCompetencyId` populado sempre que há atestado manual casado (inclusive quando a fonte resolvida é treino); `null` só quando não há atestado manual; empate de nível entre duplicatas legadas resolve pelo menor id (mesmo desempate do endpoint).
- **Frontend (web-unit):** "Outras competências" filtra os `isPositionRequirement`; a linha escolhe botão/edição conforme status+source; diálogo trava nome/tipo e default de nível = requerido.
- **Navegador (validação final, vira o artifact de prints):** anexar certificado numa linha "Não avaliável" → vira "Atende" com o anexo; competência de nome livre aparece em "Outras competências"; envio de nome divergente pela API não quebra o casamento (o servidor usa a chave).

## Nomenclatura final

| Bloco          | Título                    | Subtítulo                                           |
| -------------- | ------------------------- | --------------------------------------------------- |
| Cargo (topo)   | **Competências do cargo** | Exigidas pelo cargo · anexe a evidência de cada uma |
| Manual (baixo) | **Outras competências**   | Qualificações além das que o cargo exige            |

# Módulo de Fornecedores

## Visão geral

O módulo de fornecedores centraliza o cadastro mestre, a análise documental, a homologação, os recebimentos, o histórico operacional e a avaliação de desempenho de fornecedores da organização.

Ele foi desenhado para atender dois objetivos ao mesmo tempo:

1. manter um cadastro corporativo consistente de fornecedores, categorias, tipos, itens de catálogo e requisitos documentais;
2. sustentar o fluxo operacional de qualificação e acompanhamento contínuo do fornecedor após o cadastro.

Na implementação atual, o módulo está distribuído entre telas administrativas, telas operacionais e uma API dedicada de fornecedores.

## Objetivo do módulo

O módulo existe para responder às seguintes perguntas de negócio:

- quem são os fornecedores ativos da organização;
- quais unidades de negócio e tipos de fornecedor cada fornecedor atende;
- quais documentos são obrigatórios e qual é a situação de cada submissão;
- se o fornecedor está apto documentalmente;
- se o fornecedor foi homologado e até quando;
- como estão os recebimentos, falhas e o desempenho ao longo do tempo.

## Principais entidades

As entidades principais do módulo estão modeladas em [suppliers.ts](/Users/webstar/Documents/projects/daton/lib/db/src/schema/suppliers.ts).

### 1. Categorias de fornecedor

Categorias agrupam fornecedores em grandes famílias de negócio. São usadas para classificação, filtros e também para relacionar tipos e requisitos documentais.

Tabela: `supplier_categories`

Campos principais:

- `name`
- `description`
- `status`
- `organizationId`

### 2. Tipos de fornecedor

Tipos refinam a classificação do fornecedor dentro de uma categoria. Além disso, cada tipo carrega o `documentThreshold`, que define o percentual mínimo de conformidade documental esperado para aprovação na análise documental.

Tabela: `supplier_types`

Campos principais:

- `name`
- `description`
- `categoryId`
- `parentTypeId`
- `documentThreshold`
- `status`

### 3. Fornecedores

É o cadastro mestre da entidade fornecedora. Armazena identificação legal, contato, endereço, criticidade, status e os vínculos organizacionais do fornecedor.

Tabela: `suppliers`

Campos principais:

- `personType`
- `legalIdentifier`
- `legalName`
- `tradeName`
- `responsibleName`
- `email`
- `phone`
- `website`
- `postalCode`, `street`, `streetNumber`, `complement`, `neighborhood`, `city`, `state`
- `status`
- `criticality`
- `notes`
- `documentCompliancePercentage`
- `documentReviewStatus`
- `documentReviewNextDate`
- `lastQualifiedAt`
- `qualifiedUntil`

### 4. Vínculos com unidades e tipos

Um fornecedor pode atender múltiplas unidades da organização e múltiplos tipos de fornecedor.

Tabelas:

- `supplier_units`
- `supplier_type_links`

Esses vínculos são usados para filtros, relatórios e para derivar regras como o threshold documental.

### 5. Catálogo reutilizável de produtos e serviços

O módulo possui um catálogo organizacional reutilizável para produtos e serviços. Esse catálogo evita a recriação local de escopos por fornecedor.

Tabela principal:

- `supplier_catalog_items`

Associação com cada fornecedor:

- `supplier_offerings`

O catálogo armazena o item mestre. A tabela de offerings registra a associação daquele item com um fornecedor específico, incluindo estado e aprovação no escopo homologado.

### 6. Requisitos documentais

O catálogo de requisitos documentais define quais documentos podem ser exigidos dos fornecedores.

Tabela:

- `supplier_document_requirements`

Campos principais:

- `name`
- `description`
- `weight`
- `categoryId`
- `typeId`
- `status`

O `weight` representa o peso do requisito na análise documental.

### 7. Submissões documentais

Cada fornecedor pode ter submissões de documentos para os requisitos aplicáveis.

Tabela:

- `supplier_document_submissions`

Campos principais:

- `supplierId`
- `requirementId`
- `submissionStatus`
- `adequacyStatus`
- `requestedReviewerId`
- `reviewedById`
- `reviewedAt`
- `reviewComment`
- `validityDate`
- `exemptionReason`
- `rejectionReason`
- `observations`
- `attachments`
- `createdById`

### 8. Revisões documentais consolidadas

As revisões documentais consolidadas registram o resultado da análise AVA1, com percentual de conformidade, threshold aplicado e snapshot dos critérios avaliados.

Tabela:

- `supplier_document_reviews`

Campos principais:

- `compliancePercentage`
- `threshold`
- `result`
- `nextReviewDate`
- `criteriaSnapshot`
- `observations`

### 9. Homologação

A homologação formaliza a decisão de aprovar, aprovar com restrições ou rejeitar o fornecedor após a etapa documental.

Tabela:

- `supplier_qualification_reviews`

Campos principais:

- `decision`
- `validUntil`
- `notes`
- `attachments`
- `approvedOfferings`

### 10. Recebimentos

Os recebimentos registram o acompanhamento operacional de produtos e serviços recebidos de um fornecedor.

Tabela:

- `supplier_receipt_checks`

Campos principais:

- `receiptDate`
- `description`
- `referenceNumber`
- `quantity`
- `totalValue`
- `outcome`
- `acceptanceCriteria`
- `notes`
- `nonConformityStatus`
- `nonConformitySummary`
- `attachments`

### 11. Desempenho

As avaliações de desempenho registram a análise AVA2, consolidando notas do fornecedor em um período.

Tabela:

- `supplier_performance_reviews`

Campos principais:

- `periodStart`
- `periodEnd`
- `qualityScore`
- `deliveryScore`
- `communicationScore`
- `complianceScore`
- `priceScore`
- `finalScore`
- `riskLevel`
- `conclusion`
- `observations`

### 12. Histórico de falhas

Falhas operacionais ou documentais relevantes são registradas de forma estruturada para compor o histórico do fornecedor.

Tabela:

- `supplier_failures`

Campos principais:

- `failureType`
- `severity`
- `occurredAt`
- `description`
- `status`
- vínculos opcionais com avaliação de desempenho ou recebimento

## Estrutura de navegação

### Página inicial do módulo

Tela: [index.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/index.tsx)

A página inicial concentra:

- listagem de fornecedores;
- filtros por busca, status, categoria, tipo e unidade;
- criação de fornecedor;
- exportação de fornecedores;
- importação de fornecedores por planilha;
- atalhos para páginas administrativas do módulo.

Essa tela tem foco em busca, criação e acesso ao detalhe operacional.

### Páginas administrativas

O módulo possui páginas dedicadas para cadastros administrativos, evitando gestão por modal solto no header:

- categorias;
- tipos;
- requisitos documentais;
- catálogo de produtos e serviços.

Essas páginas são usadas para manter os cadastros mestres que suportam o restante do fluxo.

Arquivos relevantes:

- [requisitos-documentais.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/requisitos-documentais.tsx)
- [catalogo-itens.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/catalogo-itens.tsx)

### Página de detalhe do fornecedor

Tela: [[id].tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/%5Bid%5D.tsx)

A visão operacional do fornecedor está organizada em abas:

1. `Cadastro`
2. `Documentos`
3. `Homologação`
4. `Recebimentos`
5. `Histórico`
6. `Desempenho`

Essa ordem reflete a sequência operacional atual esperada pela área de negócio.

### Edição de cadastro mestre

Tela: [[id]-cadastro.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/%5Bid%5D-cadastro.tsx)

O cadastro mestre foi separado da visão operacional. Isso evita editar dados cadastrais no mesmo contexto em que o usuário executa análise documental, homologação ou recebimentos.

## Fluxos principais

## 1. Cadastro administrativo base

Antes de operar fornecedores, a organização normalmente precisa cadastrar:

- categorias;
- tipos de fornecedor;
- requisitos documentais;
- itens reutilizáveis do catálogo de produtos e serviços.

Esses cadastros formam a base de configuração do módulo.

### Regras importantes

- tipos podem estar vinculados a categorias;
- cada tipo pode definir um `documentThreshold`;
- requisitos documentais podem ser associados a categoria e tipo;
- itens de catálogo podem ser `product` ou `service`.

## 2. Cadastro mestre do fornecedor

O fluxo de cadastro mestre registra os dados corporativos do fornecedor.

### Dados cobertos

- identificação legal;
- classificação por categoria e tipos;
- unidades atendidas;
- catálogo associado;
- criticidade;
- status;
- contato;
- endereço;
- inscrições e documentos complementares;
- observações.

### Regras principais

- `personType` define se o fornecedor é `pj` ou `pf`;
- `legalIdentifier` é formatado como CNPJ ou CPF conforme o tipo;
- para `pj`, `responsibleName` e `email` são obrigatórios;
- um fornecedor pode estar vinculado a várias unidades e vários tipos;
- o cadastro mestre é mantido fora da tela operacional.

## 3. Importação e exportação de fornecedores

O módulo suporta importação e exportação de fornecedores via planilha.

### Objetivo

Permitir carga inicial, atualização em massa e round-trip usando um template padronizado.

### Funcionamento

1. o usuário baixa o template;
2. preenche a planilha;
3. envia o arquivo para a tela de fornecedores;
4. o sistema gera uma prévia;
5. o usuário confirma a importação;
6. a API aplica os creates/updates.

### Características da implementação atual

- existe fluxo de `preview` antes de `commit`;
- a prévia é persistida temporariamente e identificada por `previewToken`;
- vínculos por nome, como unidade, categoria e tipo, são resolvidos na API;
- linhas inválidas retornam erro de validação em vez de gravação silenciosa;
- nomes repetidos dentro de uma mesma célula são deduplicados antes da resolução dos vínculos.

## 4. Importação e exportação de requisitos documentais

O catálogo de requisitos documentais também suporta importação e exportação via planilha.

### Objetivo

Facilitar a manutenção do catálogo organizacional de documentos obrigatórios.

### Funcionamento

1. o usuário baixa o template de requisitos documentais;
2. preenche as linhas com nome, peso e descrição;
3. envia a planilha;
4. o sistema gera a prévia da importação;
5. o usuário confirma;
6. a API cria ou atualiza os registros.

### Regras principais

- o `weight` deve ficar entre `1` e `5`;
- o sistema evita reativar automaticamente um requisito inativo quando a importação não determina mudança explícita de status;
- a exportação reflete o catálogo atual.

## 5. Catálogo reutilizável de produtos e serviços

Esse fluxo foi criado para remover a dependência de cadastros locais de produtos/serviços dentro de cada fornecedor.

### Conceito

- `supplier_catalog_items` é o catálogo mestre;
- `supplier_offerings` é a associação do item mestre com um fornecedor específico.

### Benefícios

- evita retrabalho;
- padroniza nomes de escopo;
- melhora rastreabilidade entre homologação, recebimento e desempenho;
- permite reutilização de itens entre múltiplos fornecedores.

### Regras importantes

- um item do catálogo pertence à organização;
- o par `supplierId + catalogItemId` deve ser único;
- o vínculo pode registrar se o item faz parte do escopo aprovado do fornecedor.

## 6. Submissão documental

Na aba `Documentos`, o usuário registra a submissão de documentos exigidos para o fornecedor.

### O que pode ser registrado

- requisito documental atendido;
- status da submissão;
- adequação;
- validade;
- anexos;
- observações;
- motivo de rejeição ou isenção quando aplicável.

### Ações possíveis

- aprovar imediatamente;
- solicitar revisão para outro usuário;
- abrir uma submissão existente para revisar.

### Estados principais

O sistema mantém estados técnicos na base, mas a UI busca expor linguagem mais clara em pt-BR.

Exemplos de estado operacional:

- pendente;
- em revisão;
- aprovado;
- rejeitado;
- isento.

## 7. Revisão documental

A revisão documental permite validar uma submissão e consolidar a decisão.

### Regra de autorização

A política atual do sistema é:

- `platform_admin`, `org_admin` e `operator` com acesso ao módulo podem revisar;
- o `requestedReviewerId` funciona como encaminhamento preferencial, não como trava exclusiva de autorização.

### Decisões possíveis

- aprovar;
- rejeitar;
- solicitar ajustes.

### Observação importante

Quando uma submissão é criada com aprovação imediata, a combinação de estados na interface deve ser coerente com um estado terminal. A tela do fornecedor foi ajustada para impedir combinações contraditórias.

## 8. Análise documental consolidada (AVA1)

A análise documental consolidada calcula a conformidade do fornecedor a partir das submissões e dos requisitos aplicáveis.

### Como funciona

- cada requisito tem um peso;
- cada submissão contribui para o cálculo conforme seu estado;
- o sistema gera um `compliancePercentage`;
- o percentual é comparado com o `documentThreshold` derivado dos tipos vinculados ao fornecedor;
- o resultado é registrado em `supplier_document_reviews`.

### Regras importantes

- o threshold não é informado manualmente nessa análise;
- ele vem do maior `documentThreshold` entre os tipos do fornecedor;
- se o fornecedor não tiver tipos vinculados, aplica-se o valor padrão do módulo.

## 9. Homologação

Homologação é a decisão formal de qualificação do fornecedor após a análise documental.

### O que a homologação responde

- o fornecedor está aprovado para atuar;
- o fornecedor está aprovado com condições;
- o fornecedor está rejeitado;
- quais itens do escopo foram aprovados;
- até quando a homologação vale.

### Dependências

Na prática, a homologação depende de uma situação documental satisfatória. Por isso, ela vem depois da etapa de documentos.

## 10. Recebimentos

A aba `Recebimentos` registra o acompanhamento de entregas e prestações recebidas do fornecedor.

### Objetivo

Registrar evidências operacionais da execução do fornecedor.

### Exemplos de dado registrado

- data do recebimento;
- item ou escopo relacionado;
- unidade envolvida;
- quantidade;
- valor total;
- critérios de aceitação;
- resultado do recebimento;
- necessidade de tratamento de não conformidade.

### Relação com o restante do módulo

Recebimentos alimentam o histórico do fornecedor e podem originar falhas.

## 11. Histórico

A aba `Histórico` concentra ocorrências relevantes ao longo do tempo.

### O que aparece no histórico

- falhas abertas ou resolvidas;
- ocorrências vinculadas a desempenho;
- ocorrências vinculadas a recebimentos;
- eventos relevantes de acompanhamento do fornecedor.

O objetivo do histórico é dar contexto para decisões futuras de homologação, restrição ou bloqueio.

## 12. Desempenho (AVA2)

A aba `Desempenho` registra a avaliação periódica do fornecedor com base em métricas operacionais.

### Critérios avaliados

- qualidade;
- entrega;
- comunicação;
- conformidade;
- preço, quando aplicável.

### Resultado

O sistema calcula:

- `finalScore`
- `riskLevel`
- `conclusion`

As conclusões esperadas são:

- manter;
- restringir;
- bloquear.

Esses resultados ajudam a atualizar o status do fornecedor e a compor o histórico decisório.

## Regras de negócio relevantes

## 1. Separação entre cadastro mestre e operação

O cadastro mestre do fornecedor não deve ser alterado dentro da tela operacional. Por isso existe uma rota dedicada para edição cadastral.

## 2. Threshold documental por tipo

O threshold documental é mantido no tipo do fornecedor, não na tela de avaliação documental.

## 3. Catálogo reutilizável

Produtos e serviços devem ser mantidos em catálogo reutilizável da organização, com associação por fornecedor, em vez de criação local ad hoc.

## 4. Prévia obrigatória em importações

As importações relevantes usam fluxo de `preview` antes de `commit`, evitando gravação cega de planilhas.

## 5. Conformidade documental e homologação são etapas diferentes

- análise documental responde se o fornecedor está adequado em termos de documentação;
- homologação responde se o fornecedor está qualificado para operar.

## Papéis e permissões

As permissões detalhadas são controladas pela API, mas o comportamento geral do módulo é:

- `platform_admin`: acesso completo;
- `org_admin`: gestão completa dentro da organização;
- `operator`: atuação operacional em recebimentos e revisão documental;
- perfis sem permissão de escrita: acesso restrito à visualização conforme a política de autenticação da organização.

Na API, as mutações mais sensíveis usam um guard específico de escrita em fornecedores.

Arquivo relevante: [suppliers.ts](/Users/webstar/Documents/projects/daton/artifacts/api-server/src/routes/suppliers.ts)

## API do módulo

O backend principal do módulo está em [suppliers.ts](/Users/webstar/Documents/projects/daton/artifacts/api-server/src/routes/suppliers.ts).

Ele concentra rotas para:

- categorias;
- tipos;
- fornecedores;
- catálogo de itens;
- offerings;
- requisitos documentais;
- submissões documentais;
- revisão documental;
- revisão documental consolidada;
- homologação;
- desempenho;
- recebimentos;
- falhas e histórico.

Os fluxos mais pesados de importação e sincronização estão apoiados em serviços auxiliares, como:

- [imports.ts](/Users/webstar/Documents/projects/daton/artifacts/api-server/src/services/suppliers/imports.ts)
- [catalog-sync.ts](/Users/webstar/Documents/projects/daton/artifacts/api-server/src/services/suppliers/catalog-sync.ts)

## Frontend do módulo

As principais telas do frontend são:

- [index.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/index.tsx)
- [[id].tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/%5Bid%5D.tsx)
- [[id]-cadastro.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/%5Bid%5D-cadastro.tsx)
- [requisitos-documentais.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/requisitos-documentais.tsx)
- [catalogo-itens.tsx](/Users/webstar/Documents/projects/daton/artifacts/web/src/pages/app/qualidade/fornecedores/catalogo-itens.tsx)

## Limitações e observações atuais

### Fluxo legado de requisitos

Ainda existem estruturas de backend para templates e comunicações de requisitos:

- `supplier_requirement_templates`
- `supplier_requirement_communications`

Porém, o fluxo operacional principal do módulo foi simplificado e hoje o foco está em cadastro mestre, documentos, homologação, recebimentos, histórico e desempenho.

### Importação depende de cadastros prévios válidos

Importações de fornecedores dependem da existência prévia de:

- categorias;
- tipos;
- unidades;
- catálogo, quando houver associação.

### A política de revisão documental é aberta por permissão

O reviewer solicitado é preferencial. Não existe exclusividade obrigatória por `requestedReviewerId` na política atual do módulo.

## Quando usar este módulo

Use o módulo de fornecedores quando a organização precisar:

- cadastrar e qualificar fornecedores;
- acompanhar conformidade documental;
- homologar escopos de fornecimento;
- registrar recebimentos e não conformidades;
- avaliar desempenho ao longo do tempo;
- manter uma trilha operacional e histórica do relacionamento com o fornecedor.

## Resumo executivo

O módulo de fornecedores combina cadastro mestre, configuração administrativa e acompanhamento operacional contínuo. Ele não é apenas um cadastro estático de fornecedores: é um fluxo completo de governança do ciclo de vida do fornecedor, desde a classificação inicial até documentação, homologação, recebimentos, histórico e desempenho.

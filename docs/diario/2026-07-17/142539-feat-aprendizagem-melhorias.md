---
hora: "14:25"
autor: João Pedro
branch: feat/aprendizagem-melhorias
modulo: Aprendizagem
titulo: Cargos e competências (redesenho + matriz) + certificado PDF + instrutor no treinamento
---

## Cargos e competências (redesenho + matriz) + certificado de conclusão em PDF + instrutor no treinamento

**O que foi feito**

Três frentes de melhoria no módulo de Aprendizagem, reunidas na branch guarda-chuva `feat/aprendizagem-melhorias` (PR #165, draft — para merge conjunto):

1. **Cargos e competências — tela redesenhada e consolidada.** A tela passou a ser o lar único dos cargos: tabela com Cargo/Área/Competências/ISO, busca e filtro por área, e um painel de detalhe com abas Descrição/Competências/Habilidades. Ganhou o CRUD de cargo (criar/editar/excluir) e a **edição da matriz de competências** direto na aba (vincular competência escolhendo do banco ou criando na hora, ajustar o nível exigido e remover), com a gestão do banco de competências movida para um modal. O cargo recebeu dois atributos novos — **Área** e **Norma ISO principal** (referenciando o catálogo de normas). O item "Cargos" saiu do menu de Organização e a rota antiga passou a redirecionar para a nova tela.

2. **Certificado de conclusão de treinamento (PDF).** Novo botão "Baixar certificado" na ficha do colaborador (apenas para treino concluído) que gera um certificado em PDF, no navegador, com os dados do treinamento. A **assinatura é do instrutor**, com o nome em fonte cursiva sobre a linha (aparência de assinatura à mão) e fonte de licença aberta carregada sob demanda.

3. **Campo Instrutor no treinamento.** No "Registrar conclusão", passou a existir o campo **Instrutor**, que traz a lista de funcionários (busca) e permite digitar livremente um palestrante externo — atendendo ao pedido da cliente. O instrutor é exibido no registro e alimenta a assinatura do certificado. Também foi corrigida uma inconsistência antiga: o instrutor padrão do catálogo era gravado no campo de "instituição"; agora vai para o campo próprio de instrutor.

**Por quê**

Pedidos da cliente (Ana/Gabardo): consolidar a gestão de cargos e competências no formato do mockup, emitir certificado de conclusão, e registrar o instrutor de cada treinamento. As correções de modelo (Área/ISO no cargo, instrutor separado de instituição) deixam os dados mais consistentes e alinhados à ISO 9001:2015 §7.2 e à ISO 10015.

**Impacto / área afetada**

Módulo de Aprendizagem (cargos, competências, catálogo de normas, ficha do colaborador, certificado) e Organização (remoção do item "Cargos" do menu). Inclui alterações de banco aditivas: colunas `positions.area`, `positions.principal_norm_id` e `employee_trainings.instructor`.

**Status e validações**

Implementado e validado pela cliente em ambiente de teste. Cada frente passou por revisão adversarial de código (bugs encontrados e corrigidos) e por testes automatizados: testes unitários (utilitários da tela de cargos e do certificado) e de integração (rotas de positions e de treinamentos), além de `pnpm typecheck` verde. **Pendente:** aplicação da DDL de produção (as 3 colunas acima) sob autorização, e o merge conjunto do PR #165 (mantido como draft para reunir outras mudanças).

**Observações**

Por escopo, o campo Instrutor está apenas no fluxo "Registrar conclusão" (não no assistente de criação de treino nem nas outras telas de treinamento). Há uma diferença de vocabulário legada entre o banco de competências (Conhecimento/Habilidade/Atitude) e o requisito do cargo (Formação/Experiência/Habilidade), tratada de forma desacoplada — unificação fica como melhoria futura.

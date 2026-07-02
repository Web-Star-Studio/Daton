---
hora: "01:01"
autor: João Pedro
branch: feat/gestao-aprendizagem
modulo: Gestão de Aprendizagem
titulo: SP6/B — indicadores de treinamento no módulo de Indicadores + dashboard operacional
---

Concluído o SP6/B — a integração dos indicadores de treinamento ao módulo de Indicadores (KPI) e o painel operacional do módulo de Aprendizagem. Última peça do módulo de Gestão de Aprendizagem.

**O que foi entregue**
- **Métricas de treinamento viram indicadores de verdade** no módulo de Indicadores que a empresa já usa — com valor calculado automaticamente a partir dos dados do LMS (nada é digitado). São seis indicadores corporativos: % de cumprimento do programa anual, % de eficácia geral, % de cobertura de treinamentos obrigatórios, horas de treinamento por colaborador, colaboradores com lacuna crítica e treinamentos vencidos. Com isso ganham, de graça, meta, semáforo, histórico e o tratamento de desvio (justificativa ou plano de ação) que o módulo já oferece.
- **Tolerância do semáforo configurável** por indicador/ano (antes era fixa) — a empresa define a margem aceitável de desvio; o padrão preserva o comportamento atual.
- **Ativação automática** dos indicadores de treinamento por um botão (não duplica se já existem).
- **Desvio → plano de ação**: um indicador de treinamento fora da meta permite abrir plano de ação, reaproveitando integralmente o fluxo de ações já existente.
- **Visibilidade por perfil**: gerentes e analistas passam a enxergar os indicadores de treinamento (o gerente pode tratar o desvio; o analista visualiza); operadores seguem restritos.
- **Painel operacional (Dashboard)** novo dentro do módulo de Aprendizagem, fiel ao layout do cliente: cartões de cumprimento/eficácia/lacunas/vencidos, desempenho por filial, eficácia por norma ISO, lista de vencidos e de avaliações de eficácia pendentes.
- **Banco de produção**: as novas colunas foram incluídas no script de DDL do módulo para o deploy.

**Decisões e limitações registradas (transparência)**
- Escopo corporativo (um indicador por métrica para a empresa), com o detalhe por filial no painel operacional — como no layout do cliente; indicadores por filial ficam como evolução futura sob demanda.
- "Colaboradores com lacuna crítica" é um retrato do momento: o histórico passa a ser acumulado a partir da ativação (não é reconstruível para trás).
- "Eficácia por norma" considera apenas treinamentos com norma marcada no catálogo.

**Como foi construído e validado**
- Execução guiada por plano, tarefa a tarefa, com revisão independente entre elas e uma revisão final abrangente antes de finalizar. A revisão final não encontrou defeitos críticos (sem vazamento entre empresas, sem criação indevida de registros, contas corretas); os ajustes recomendados (visibilidade para gerentes/analistas e não considerar meses futuros) foram aplicados.
- Verificação completa: checagem de tipos de todo o projeto verde; suíte de testes de integração com 139 casos passando (mais os testes novos do módulo); testes unitários verdes; build do frontend verde; e verificação de que os novos serviços sobem corretamente.

**Status**
Trabalho preservado no branch da feature (backup remoto). Conforme combinado, a entrega será em um único Pull Request cobrindo o módulo inteiro (Aprendizagem + indicadores de treinamento), a ser aberto ao final. Follow-ups menores registrados para uma próxima passada (indicadores por filial sob demanda; refinamentos de consistência menores).

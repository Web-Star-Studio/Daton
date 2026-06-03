---
hora: "23:33"
autor: João Pedro
branch: call-ana
modulo: Reunião (cliente)
titulo: Call de alinhamento — SWOT, Plano de Ação, Indicadores, Documentação
---

Call de alinhamento com a cliente (Ana) revisando os módulos entregues e definindo prioridades.

- **O que (validado pela cliente):**
  - **SWOT:** os objetivos devem vir do módulo **Indicadores/KPI** (não recriar manualmente) — confirmado; a escala **Performance/Relevância por tipo de fator** foi validada como **correta** (Força 1=Frágil…4=Excelente; Fraqueza 1=Excelente…4=Frágil; Oportunidade/Ameaça por "consequência"; relevância 1=baixa…4=muito alta). Dashboard agradou.
- **A fazer — SWOT:**
  1. **Exibir a metodologia na tela** (tabela: resultado **≥8 requer ação**, **≤7 irrelevante**) e torná-la **configurável por empresa** — os limiares podem variar de cliente para cliente.
  2. Permitir/explicar como **adicionar perspectivas**.
  3. Unidade segue como lista (cliente deixou assim por ora).
- **A fazer — Plano de Ação (PRIORIDADE):**
  1. **Bug:** o link **"abrir lançamentos"** ainda aponta para a **tabela antiga** — direcionar para o indicador correto que foi aberto.
  2. Evoluir para **ficha rica** (nos moldes do protótipo "Gestão de Ações" e do módulo de não conformidade v1): origem (indicador/SWOT/…), tipo, ação pontual, **problema identificado**, **causa-raiz (5 porquês, com possível apoio de IA)**, 5W2H, **prazo e responsável** (hoje falta).
  3. **Avaliação de eficácia** passa a ser requisito em vários pontos (não só treinamentos) — gerou **não conformidade**; a planilha F020 exige o campo "foi eficaz?". *(Grande parte já está em construção na branch `feat/gestao-acoes`.)*
- **A fazer — Indicadores:** adicionar **mini-gráfico por indicador** inline no dashboard (gestão à vista — ver tendência sem precisar abrir o lançamento).
- **Deferido — Documentação:** modelo nos moldes do **LAIA** (objetivos separados, sem anexar Word); a cliente vai reenviar a metodologia/arquivo.
- **Prioridade definida:** **Ações primeiro, depois Documentação** (Indicadores e SWOT dependem de ações; não conformidade quase pronta).
- **Status:** call registrada; itens viram backlog priorizado. Sem implementação nesta entrada.

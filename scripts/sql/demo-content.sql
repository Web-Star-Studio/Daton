-- ############################################################################
-- SQL FINAL REVISADO — org 3 (Indústria Aurora Demo). SEM BEGIN/COMMIT.
-- Envolver em UMA transação ao rodar. Ordenado por dependência (pai antes de filho).
-- Revisão adversarial: cross-org=0, todos escopados em organization_id=3 (ou via
-- FK a pai da org 3); idempotente; datas relativas a current_date/now().
-- Blocos rejeitados/reduzidos documentados no relatório que acompanha.
-- ############################################################################


-- ============================================================================
-- MÓDULO 4 — DOCUMENTAÇÃO ISO  (tela prioritária)
-- Roda primeiro: remove o doc de teste antes de reatribuir códigos.
-- ============================================================================

-- 4.1) Remove o documento de teste (id 57: 'Teste'/'dadao'). Dependentes CASCADE;
--      refs de outros módulos SET NULL. Verificado: 0 filhos, nenhum FK RESTRICT.
DELETE FROM documents WHERE id = 57 AND organization_id = 3;

-- 4.2) Identificação: código, área e requisitos normativos (só onde ainda vazio).
UPDATE documents SET code = 'MQ-001', area = 'Qualidade', normative_requirements = ARRAY['ISO 9001:2015 - 4 Contexto da organização','ISO 9001:2015 - 5 Liderança','ISO 9001:2015 - 7.5 Informação documentada']::text[]
WHERE id = 45 AND organization_id = 3 AND code IS NULL;
UPDATE documents SET code = 'PR-QUA-001', area = 'Qualidade', normative_requirements = ARRAY['ISO 9001:2015 - 7.5.2 Criação e atualização','ISO 9001:2015 - 7.5.3 Controle da informação documentada']::text[]
WHERE id = 46 AND organization_id = 3 AND code IS NULL;
UPDATE documents SET code = 'PR-QUA-002', area = 'Qualidade', normative_requirements = ARRAY['ISO 9001:2015 - 9.2 Auditoria interna']::text[]
WHERE id = 47 AND organization_id = 3 AND code IS NULL;
UPDATE documents SET code = 'IT-LOG-001', area = 'Logística', normative_requirements = ARRAY['ISO 9001:2015 - 8.5 Produção e provisão de serviço','ISO 9001:2015 - 8.6 Liberação de produtos e serviços']::text[]
WHERE id = 48 AND organization_id = 3 AND code IS NULL;
UPDATE documents SET code = 'POL-001', area = 'Qualidade', normative_requirements = ARRAY['ISO 9001:2015 - 5.2 Política','ISO 14001:2015 - 5.2 Política ambiental']::text[]
WHERE id = 49 AND organization_id = 3 AND code IS NULL;
UPDATE documents SET code = 'PR-QUA-003', area = 'Qualidade', normative_requirements = ARRAY['ISO 9001:2015 - 10.2 Não conformidade e ação corretiva']::text[]
WHERE id = 50 AND organization_id = 3 AND code IS NULL;
UPDATE documents SET code = 'PL-AMB-001', area = 'Produção', normative_requirements = ARRAY['ISO 14001:2015 - 8.1 Planejamento e controle operacionais']::text[]
WHERE id = 51 AND organization_id = 3 AND code IS NULL;
UPDATE documents SET code = 'RG-RH-001', area = 'Recursos Humanos', normative_requirements = ARRAY['ISO 9001:2015 - 7.2 Competência','ISO 9001:2015 - 7.3 Conscientização']::text[]
WHERE id = 52 AND organization_id = 3 AND code IS NULL;

-- 4.3) Conteúdo (content_sections). Só preenche quando ainda estiver vazio.
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Apresentação","body":"Este Manual da Qualidade descreve o Sistema de Gestão Integrado (SGI) da **Indústria Aurora Demo LTDA**, empresa dedicada à fabricação e à operação logística de produtos industriais, com unidades em São Paulo (Sede Principal), Rio de Janeiro e Belo Horizonte.\n\nO documento apresenta a estrutura, as diretrizes e as responsabilidades adotadas para atender aos requisitos da ABNT NBR ISO 9001:2015 e assegurar a satisfação dos clientes.","order":0},{"id":"sec-2","title":"Escopo do SGI","body":"O SGI abrange os processos de **recebimento, armazenagem, cross-docking, expedição e transporte rodoviário de cargas**, bem como os processos de apoio de compras, recursos humanos, manutenção de frota e infraestrutura.\n\n**Exclusões e aplicabilidade:** todos os requisitos da ISO 9001:2015 são aplicáveis. O requisito 8.3 (Projeto e desenvolvimento) é atendido de forma limitada, restrito à concepção de layouts operacionais e roteiros de distribuição.","order":1},{"id":"sec-3","title":"Referências Normativas","body":"- **ABNT NBR ISO 9001:2015** — Sistemas de gestão da qualidade — Requisitos\n- **ABNT NBR ISO 9000:2015** — Sistemas de gestão da qualidade — Fundamentos e vocabulário\n- **ABNT NBR ISO 14001:2015** — Sistemas de gestão ambiental (aplicável às operações das filiais)","order":2},{"id":"sec-4","title":"Termos e Definições","body":"Aplicam-se os termos e definições da ABNT NBR ISO 9000:2015. Termos específicos da operação:\n\n- **Cross-docking:** movimentação da mercadoria do recebimento diretamente à expedição, sem armazenagem intermediária.\n- **WMS:** sistema de gerenciamento de armazém (*Warehouse Management System*).\n- **Doca niveladora:** equipamento que ajusta o desnível entre a plataforma e o veículo para carga e descarga seguras.\n- **Cavalo mecânico:** veículo trator utilizado no transporte rodoviário de cargas.","order":3},{"id":"sec-5","title":"Descrição do Sistema","body":"O SGI está estruturado segundo o ciclo **PDCA** e a abordagem por processos. A Alta Direção estabelece a Política e os Objetivos da Qualidade, provê recursos e conduz a análise crítica periódica.\n\nOs processos operacionais são monitorados por indicadores de desempenho — **OTIF, índice de avarias, acuracidade de inventário e prazo de entrega**. As não conformidades são tratadas conforme o *Procedimento de Ação Corretiva* (PR-QUA-003) e a eficácia das ações é verificada nas auditorias internas (PR-QUA-002).","order":4}]$js$::jsonb, updated_at = now()
WHERE id = 45 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Objetivo","body":"Estabelecer os critérios para elaboração, análise crítica, aprovação, distribuição, revisão e controle das informações documentadas do SGI, garantindo que as versões vigentes estejam disponíveis nos pontos de uso e que documentos obsoletos sejam retirados de circulação.","order":0},{"id":"sec-2","title":"Aplicação","body":"Aplica-se a todas as informações documentadas exigidas pela ISO 9001:2015 e mantidas pelo SGI da Indústria Aurora, em todas as unidades (Sede Principal, Rio de Janeiro e Belo Horizonte).","order":1},{"id":"sec-3","title":"Definições e Referências","body":"- **Documento vigente:** versão aprovada e em uso.\n- **Documento obsoleto:** versão superada por revisão posterior.\n- **Informação documentada de origem externa:** normas, legislação e documentos de clientes.\n\n**Referência:** Manual da Qualidade (MQ-001).","order":2},{"id":"sec-4","title":"Sequência, Interação, Recursos e Monitoramento","body":"A necessidade de um novo documento ou de revisão é identificada pelo responsável do processo e registrada na plataforma de gestão documental.\n\n**Recursos:** sistema de gestão documental Daton.\n**Monitoramento:** indicadores de *documentos vencidos* e de *revisões pendentes*, acompanhados mensalmente pela Qualidade.","order":3},{"id":"sec-5","title":"Responsabilidade pelo Processo","body":"O **Representante da Direção para a Qualidade** é o responsável pelo processo. Os elaboradores redigem, os analistas críticos revisam e a aprovação cabe ao gestor da área ou à Alta Direção.","order":4},{"id":"sec-6","title":"Procedimento","body":"1. Identificar a necessidade de criação ou revisão.\n2. Elaborar o documento seguindo o modelo padrão (código, área, norma aplicável).\n3. Submeter à análise crítica dos revisores designados.\n4. Aprovar e publicar a versão vigente.\n5. Distribuir aos destinatários e registrar o recebimento.\n6. Retirar de uso as versões obsoletas, mantendo o histórico de revisões.","order":5}]$js$::jsonb, updated_at = now()
WHERE id = 46 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Objetivo","body":"Definir a sistemática para planejar, executar, relatar e acompanhar as auditorias internas do SGI, verificando a conformidade com a ISO 9001:2015 e a eficácia da implementação.","order":0},{"id":"sec-2","title":"Aplicação","body":"Aplica-se a todos os processos e unidades incluídos no escopo do SGI da Indústria Aurora.","order":1},{"id":"sec-3","title":"Definições e Referências","body":"- **Auditor interno:** colaborador qualificado e independente da área auditada.\n- **Constatação:** conformidade ou não conformidade evidenciada durante a auditoria.\n- **Evidência objetiva:** dado que comprova a existência ou veracidade de algo.\n\n**Referência:** Manual da Qualidade (MQ-001).","order":2},{"id":"sec-4","title":"Sequência, Interação, Recursos e Monitoramento","body":"O **programa anual de auditorias** é aprovado pela Alta Direção, com frequência mínima anual por processo, considerando a importância dos processos e resultados de auditorias anteriores.\n\n**Recursos:** auditores internos qualificados.\n**Monitoramento:** percentual de auditorias realizadas *vs.* programadas e prazo de tratamento das constatações.","order":3},{"id":"sec-5","title":"Responsabilidade pelo Processo","body":"A **Coordenação da Qualidade** elabora o programa e consolida os relatórios. Os auditores conduzem as auditorias com imparcialidade; os responsáveis das áreas auditadas providenciam as ações corretivas.","order":4},{"id":"sec-6","title":"Procedimento","body":"1. Elaborar o programa anual e o plano de cada auditoria.\n2. Notificar as áreas e realizar a reunião de abertura.\n3. Coletar evidências por meio de entrevistas, observação e análise de registros.\n4. Registrar as constatações e classificá-las.\n5. Conduzir a reunião de encerramento e emitir o relatório.\n6. Abrir ações corretivas para as não conformidades e verificar a eficácia.","order":5}]$js$::jsonb, updated_at = now()
WHERE id = 47 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Objetivo","body":"Padronizar a inspeção de recebimento de mercadorias na doca, assegurando que apenas itens conformes sejam liberados para armazenagem ou cross-docking.","order":0},{"id":"sec-2","title":"Aplicação","body":"Aplica-se ao recebimento de cargas em todas as docas das unidades da Indústria Aurora.","order":1},{"id":"sec-3","title":"Definições e Referências","body":"- **NF-e:** Nota Fiscal eletrônica que acompanha a carga.\n- **Divergência:** diferença entre o pedido/NF-e e o material fisicamente recebido.\n- **Avaria:** dano físico identificado na mercadoria ou embalagem.\n\n**Referência:** Manual da Qualidade (MQ-001).","order":2},{"id":"sec-4","title":"Sequência, Interação, Recursos e Monitoramento","body":"**Recursos:** coletor de dados integrado ao WMS, doca niveladora, calços de segurança e EPIs.\n**Monitoramento:** *índice de divergências de recebimento* e tempo médio de conferência, acompanhados pela Supervisão de Logística.","order":3},{"id":"sec-5","title":"Responsabilidade pelo Processo","body":"O **conferente de recebimento** executa a inspeção; a **Supervisão de Logística** trata as divergências e libera as cargas conformes.","order":4},{"id":"sec-6","title":"Procedimento","body":"1. Conferir a NF-e contra o pedido de compra.\n2. Posicionar o veículo na doca e aplicar o calço de segurança.\n3. Acionar a doca niveladora antes de iniciar a descarga.\n4. Realizar a conferência quantitativa e qualitativa dos itens.\n5. Registrar avarias e divergências, retendo o material não conforme.\n6. Dar entrada no WMS e encaminhar à armazenagem ou ao cross-docking.","order":5}]$js$::jsonb, updated_at = now()
WHERE id = 48 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Objetivo","body":"Declarar o compromisso da Alta Direção da **Indústria Aurora** com a qualidade dos serviços, a satisfação dos clientes, a melhoria contínua e a proteção do meio ambiente, orientando os objetivos e as ações do SGI.","order":0},{"id":"sec-2","title":"Abrangência","body":"Aplica-se a todas as unidades e a todos os colaboradores da Indústria Aurora — próprios e terceirizados — envolvidos nos processos industriais e logísticos.","order":1},{"id":"sec-3","title":"Diretrizes","body":"A Indústria Aurora compromete-se a:\n\n- Atender aos requisitos dos clientes e aos requisitos legais e regulamentares aplicáveis;\n- Cumprir os prazos de entrega acordados, medidos pelo indicador **OTIF**;\n- Reduzir avarias e retrabalho nos processos de armazenagem e transporte;\n- Prevenir a poluição e promover a correta gestão dos resíduos;\n- Capacitar continuamente as pessoas;\n- Melhorar continuamente a eficácia do Sistema de Gestão Integrado.","order":2},{"id":"sec-4","title":"Responsabilidades","body":"A **Alta Direção** provê os recursos e conduz a análise crítica. Os **gestores** desdobram esta Política em objetivos mensuráveis. Os **colaboradores** cumprem os procedimentos e contribuem com a melhoria contínua.","order":3},{"id":"sec-5","title":"Referências","body":"- Manual da Qualidade (MQ-001)\n- ABNT NBR ISO 9001:2015 — item 5.2\n- ABNT NBR ISO 14001:2015 — item 5.2","order":4}]$js$::jsonb, updated_at = now()
WHERE id = 49 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Objetivo","body":"Estabelecer a sistemática para tratar não conformidades, eliminar suas causas e evitar a recorrência, assegurando a melhoria contínua do SGI.","order":0},{"id":"sec-2","title":"Aplicação","body":"Aplica-se às não conformidades identificadas em auditorias, reclamações de clientes, indicadores fora da meta e desvios de processo, em todas as unidades.","order":1},{"id":"sec-3","title":"Definições e Referências","body":"- **Correção:** ação imediata para eliminar a não conformidade detectada.\n- **Ação corretiva:** ação para eliminar a causa-raiz e prevenir a recorrência.\n- **Causa-raiz:** origem fundamental do problema.\n\n**Referências:** Manual da Qualidade (MQ-001); Procedimento de Auditoria Interna (PR-QUA-002).","order":2},{"id":"sec-4","title":"Sequência, Interação, Recursos e Monitoramento","body":"**Recursos:** ferramentas de análise de causa (5 Porquês, Diagrama de Ishikawa) e o módulo de Gestão de Ações da plataforma.\n**Monitoramento:** prazo de tratamento das ações e percentual de ações avaliadas como eficazes.","order":3},{"id":"sec-5","title":"Responsabilidade pelo Processo","body":"O **responsável do processo** conduz a análise e implementa as ações; a **Coordenação da Qualidade** acompanha o tratamento e verifica a eficácia.","order":4},{"id":"sec-6","title":"Procedimento","body":"1. Registrar a não conformidade e aplicar a correção imediata.\n2. Avaliar a necessidade de ação corretiva conforme a gravidade.\n3. Analisar a causa-raiz.\n4. Definir o plano de ação (o quê, quem, quando).\n5. Implementar as ações planejadas.\n6. Verificar a eficácia e encerrar o registro.","order":5}]$js$::jsonb, updated_at = now()
WHERE id = 50 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Objetivo e Abrangência","body":"Estabelecer as diretrizes para o gerenciamento dos resíduos gerados nas operações industriais e logísticas da Indústria Aurora, em conformidade com a legislação ambiental e com a ABNT NBR ISO 14001:2015. Abrange todas as unidades e os resíduos gerados na produção, na armazenagem e na manutenção de frota.","order":0},{"id":"sec-2","title":"Classificação dos Resíduos","body":"Os resíduos são classificados conforme a NBR 10.004:\n\n- **Recicláveis:** paletes de madeira, filme *stretch*, papelão e embalagens plásticas;\n- **Não perigosos:** rejeitos de varrição e resíduos orgânicos da copa;\n- **Perigosos (Classe I):** óleo lubrificante usado, estopas contaminadas, filtros e baterias oriundos da manutenção de frota.","order":1},{"id":"sec-3","title":"Acondicionamento e Coleta","body":"Cada unidade dispõe de pontos de coleta segregada, identificados por cores. Os resíduos perigosos são acondicionados em recipientes estanques, em área coberta e sinalizada, com contenção secundária. A coleta interna segue a rotina definida pela equipe de Produção e Manutenção.","order":2},{"id":"sec-4","title":"Destinação e Responsabilidades","body":"A destinação final é realizada por transportadores e receptores **licenciados**, mediante emissão do Manifesto de Transporte de Resíduos (MTR). A **Produção** responde pela segregação; a **Manutenção** pelos resíduos de frota; a **Qualidade/SGA** valida as licenças dos fornecedores e arquiva os comprovantes de destinação.","order":3},{"id":"sec-5","title":"Monitoramento e Indicadores","body":"São monitorados os indicadores de **volume de resíduos por classe**, **percentual de reciclagem** e **regularidade dos MTR**. Os resultados são apresentados na análise crítica do SGI, subsidiando metas de redução na fonte.","order":4}]$js$::jsonb, updated_at = now()
WHERE id = 51 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;
UPDATE documents SET content_sections = $js$[{"id":"sec-1","title":"Instruções de Preenchimento","body":"Este registro comprova a realização do **treinamento de integração** de novos colaboradores da Indústria Aurora.\n\nPreencher os campos:\n\n- **Identificação:** nome, cargo e unidade do colaborador;\n- **Data e carga horária** do treinamento;\n- **Instrutor** responsável;\n- **Conteúdo programático:** apresentação do SGI, Política da Qualidade, regras de segurança, uso de EPIs e procedimentos da área;\n- **Avaliação de eficácia:** resultado da verificação de aprendizagem;\n- **Assinatura** do colaborador e do instrutor.\n\nO registro deve ser arquivado no prontuário do colaborador e mantido conforme a tabela de temporalidade do RH.","order":0}]$js$::jsonb, updated_at = now()
WHERE id = 52 AND organization_id = 3 AND jsonb_array_length(content_sections) = 0;

-- 4.4) Tratativa de Registros (§7.5.3) nos documentos que geram registros.
UPDATE documents SET records_treatment = $js${"storageLocation":"Módulo de Documentação da plataforma Daton — pasta Auditorias","retentionMonths":60,"disposalMethod":"Exclusão lógica após o período de guarda","responsible":"Coordenação da Qualidade","notes":"Relatórios de auditoria e planos de ação associados."}$js$::jsonb
WHERE id = 47 AND organization_id = 3 AND records_treatment IS NULL;
UPDATE documents SET records_treatment = $js${"storageLocation":"WMS e arquivo digital da Logística","retentionMonths":24,"disposalMethod":"Descarte seguro dos arquivos após o período de guarda","responsible":"Supervisão de Logística","notes":"Registros de inspeção de recebimento e tratativa de divergências."}$js$::jsonb
WHERE id = 48 AND organization_id = 3 AND records_treatment IS NULL;
UPDATE documents SET records_treatment = $js${"storageLocation":"Módulo de Gestão de Ações da plataforma Daton","retentionMonths":60,"disposalMethod":"Exclusão lógica após o período de guarda","responsible":"Coordenação da Qualidade","notes":"Registros de não conformidade, análise de causa e verificação de eficácia."}$js$::jsonb
WHERE id = 50 AND organization_id = 3 AND records_treatment IS NULL;
UPDATE documents SET records_treatment = $js${"storageLocation":"Módulo de Aprendizagem e prontuário do colaborador","retentionMonths":60,"disposalMethod":"Descarte conforme a tabela de temporalidade do RH","responsible":"Recursos Humanos","notes":"Lista de presença e avaliação de eficácia da integração."}$js$::jsonb
WHERE id = 52 AND organization_id = 3 AND records_treatment IS NULL;

-- 4.5) Ancora a validade no tempo: procedimentos publicados com data no passado.
UPDATE documents SET validity_date = current_date + interval '1 year'
WHERE id = 46 AND organization_id = 3 AND validity_date < current_date;
UPDATE documents SET validity_date = current_date + interval '1 year'
WHERE id = 47 AND organization_id = 3 AND validity_date < current_date;
UPDATE documents SET validity_date = current_date + interval '1 year'
WHERE id = 48 AND organization_id = 3 AND validity_date < current_date;


-- ============================================================================
-- MÓDULO 1 — FATORES DE DESEMPENHO + AJUSTES  (tela prioritária)
-- ============================================================================

-- 1.1 Continuidade das medições dos 14 FDs até o mês corrente (periodicidade respeitada).
WITH anchor AS (
  SELECT date_trunc('month', current_date)::date AS m0
),
novas(code, month_offset, value, note) AS (
  VALUES
    ('FD01', -1, 10900.0, 'Volume extra de cross-docking no fechamento do semestre manteve a quilometragem diária da frota acima da meta.'),
    ('FD01',  0, 10400.0, 'Redistribuição de rotas reduziu a média diária; ainda acima do limite planejado.'),
    ('FD02',  0,   100.0, 'Inspeção do 3º trimestre: sinalização e rotograma das rotas críticas 100% conformes.'),
    ('FD03', -1,     1.0, 'Um cavalo mecânico reprovado na inspeção e removido da escala no mesmo dia.'),
    ('FD03',  0,     0.0, 'Nenhum veículo reprovado na inspeção do período.'),
    ('FD04', -2,    17.0, 'Simulado de emergência na doca: acionamento da brigada em 17 minutos.'),
    ('FD04', -1,    16.0, 'Revisão do protocolo de acionamento reduziu o tempo de mobilização.'),
    ('FD04',  0,    15.0, 'Tempo de resposta na meta após redistribuição das equipes de plantão.'),
    ('FD05', -1,    21.0, 'Antecipação das janelas de coleta reduziu a exposição noturna.'),
    ('FD05',  0,    20.0, 'Média de condução noturna por motorista atinge a meta.'),
    ('FD06', -1,     0.2, 'Um afastamento por colisão leve em manobra de pátio.'),
    ('FD06',  0,     0.1, 'Redução sustentada após campanha de manobra assistida no pátio.'),
    ('FD07', -1,    94.0, 'Auditoria de uso de EPI na doca niveladora: desvios pontuais no turno da noite.'),
    ('FD07',  0,    95.0, 'Blitz interna de cinto e EPI com feedback imediato aos turnos.'),
    ('FD08', -2,    80.0, 'Telemetria aponta excesso de velocidade concentrado em trecho urbano.'),
    ('FD08', -1,    82.0, 'Plano de ação em andamento; indicador ainda abaixo da meta e com prazo vencido.'),
    ('FD08',  0,    84.0, 'Evolução gradual; trecho crítico segue puxando o indicador para baixo.'),
    ('FD09',  0,     3.0, 'Campanha de exames do 3º trimestre: 3 ocorrências em acompanhamento médico.'),
    ('FD10', -1,    90.0, 'Rotogramas revisados para as rotas de distribuição da Filial Rio de Janeiro.'),
    ('FD10',  0,    92.0, 'Cobertura ampliada às rotas atendidas pela Filial Belo Horizonte.'),
    ('FD11', -1,    99.0, 'Inspeção mensal da frota: um cavalo mecânico retido para troca de pneus.'),
    ('FD11',  0,   100.0, 'Frota 100% aprovada na inspeção do mês.'),
    ('FD12',  0,   100.0, 'Reciclagem semestral concluída: 100% dos condutores habilitados e treinados.'),
    ('FD13', -1,     0.0, 'Nenhuma lesão fatal registrada no período.'),
    ('FD13',  0,     0.0, 'Nenhuma lesão fatal registrada no período.'),
    ('FD14', -1,    95.0, 'Jornada monitorada por telemetria; pausas cumpridas na maior parte das rotas.'),
    ('FD14',  0,    96.0, 'Ajuste de escala no cross-docking reduziu pausas suprimidas por atraso na doca.')
),
alvo AS (
  SELECT f.id AS factor_id, f.periodicity, f.responsible_user_id,
         n.value::numeric AS value, n.note,
         (a.m0 + make_interval(months => n.month_offset) + interval '14 days')::date AS ref
  FROM novas n
  CROSS JOIN anchor a
  JOIN road_safety_factors f
    ON f.organization_id = 3
   AND f.code = n.code
)
INSERT INTO road_safety_factor_measurements
  (organization_id, factor_id, value, reference_date, note, created_by_user_id)
SELECT 3, t.factor_id, t.value, t.ref, t.note, t.responsible_user_id
FROM alvo t
WHERE (
      t.periodicity = 'monthly'
   OR (t.periodicity = 'quarterly'  AND extract(month from t.ref)::int % 3 = 1)
   OR (t.periodicity = 'semiannual' AND extract(month from t.ref)::int % 6 = 1)
   OR (t.periodicity = 'annual'     AND extract(month from t.ref)::int = 1)
)
AND NOT EXISTS (
  SELECT 1 FROM road_safety_factor_measurements m
  WHERE m.factor_id = t.factor_id
    AND m.reference_date = t.ref
);

-- 1.2 Catálogo de perspectivas SWOT (dedup case-insensitive; índice único lower(name)).
WITH candidatas(name, prioridade) AS (
  SELECT trim(f.perspective), 0
  FROM swot_factors f
  WHERE f.organization_id = 3
    AND f.perspective IS NOT NULL
    AND trim(f.perspective) <> ''
  UNION ALL
  SELECT v.name, 1
  FROM (VALUES
    ('Qualidade'), ('SGI'), ('Ambiental'), ('Segurança Viária'), ('ESG'), ('Saúde e Segurança')
  ) v(name)
),
unicas AS (
  SELECT DISTINCT ON (lower(name)) name
  FROM candidatas
  ORDER BY lower(name), prioridade, name
)
INSERT INTO swot_perspectives (organization_id, name)
SELECT 3, u.name
FROM unicas u
WHERE NOT EXISTS (
  SELECT 1 FROM swot_perspectives p
  WHERE p.organization_id = 3
    AND lower(p.name) = lower(u.name)
);

-- 1.3 "Detalhamento do monitoramento" dos 14 FDs (só onde vazio).
WITH detalhes(code, detail) AS (
  VALUES
    ('FD01', 'Telemetria embarcada — soma dos km rodados pela frota por jornada, extraída semanalmente do sistema de rastreamento.'),
    ('FD02', 'Checklist de inspeção de rotas — percentual de rotas críticas aprovadas na vistoria trimestral de sinalização e projeto.'),
    ('FD03', 'Relatório de inspeção veicular — contagem de veículos reprovados e bloqueados na escala no mês.'),
    ('FD04', 'Registro de ocorrências e simulados — tempo médio entre o acionamento e a chegada da brigada.'),
    ('FD05', 'Telemetria embarcada — média mensal de horas conduzidas entre 22h e 5h por motorista.'),
    ('FD06', 'Registro de acidentes e atestados do SESMT — acidentes com afastamento sobre o total de motoristas expostos.'),
    ('FD07', 'Blitz interna e auditoria de doca — percentual de abordagens conformes no uso de EPI e cinto de segurança.'),
    ('FD08', 'Telemetria embarcada — percentual de trechos percorridos dentro do limite de velocidade da via.'),
    ('FD09', 'Exames periódicos e toxicológicos (ASO) — ocorrências com restrição ou acompanhamento médico no trimestre.'),
    ('FD10', 'Sistema de roteirização — percentual de viagens iniciadas com rotograma aprovado.'),
    ('FD11', 'Checklist diário e plano de manutenção preventiva — percentual de veículos aprovados na inspeção do mês.'),
    ('FD12', 'Gestão da Aprendizagem — percentual de condutores com CNH válida e reciclagem semestral concluída.'),
    ('FD13', 'Registro de ocorrências e comunicação de acidente de trabalho — número de lesões fatais no período.'),
    ('FD14', 'Telemetria e controle de jornada — percentual de jornadas com as pausas obrigatórias cumpridas.')
)
UPDATE road_safety_factors f
SET monitoring_detail = d.detail
FROM detalhes d
WHERE f.organization_id = 3
  AND f.code = d.code
  AND coalesce(trim(f.monitoring_detail), '') = '';


-- ============================================================================
-- MÓDULO 0 — APRENDIZAGEM / LMS  (tela prioritária)
-- Ordem interna: PAT; trainings novos (0.2) antes das reviews que os referenciam (0.4).
-- ============================================================================

-- 0.1 PAT distribuído entre as 3 filiais (JOIN units/training_catalog org 3).
INSERT INTO annual_training_program
  (organization_id, year, catalog_item_id, unit_id, planned_month, modality,
   planned_quantity, responsible, status, notes)
SELECT 3, extract(year from current_date)::int, tc.id, u.id, v.planned_month,
       v.modality, v.planned_quantity, v.responsible, v.status, v.notes
FROM (VALUES
  (20, 2732,  5, 'EAD',        10, 'Qualidade',        'realizada',
   'Turma EAD de gestão ambiental para a equipe da Qualidade — abre o ciclo ISO 14001 na operação.'),
  (21, 2734,  1, 'Presencial',  6, 'Recursos Humanos', 'realizada',
   'Integração dos admitidos do 1º trimestre — expedição e conferência de carga.'),
  (21, 2725,  2, 'Presencial', 24, 'SESMT',            'realizada',
   'Reciclagem anual de EPI — separação, doca e expedição.'),
  (21, 2733,  3, 'Presencial', 18, 'Qualidade',        'realizada',
   'Boas práticas para a equipe de embalagem e paletização.'),
  (21, 2727,  4, 'Presencial',  8, 'Logística',        'realizada',
   'Habilitação e reciclagem dos operadores de empilhadeira do centro de distribuição.'),
  (21, 2740,  5, 'Presencial', 28, 'SESMT',            'realizada',
   'Ciclo de DDS do 1º semestre — foco em circulação de empilhadeira na doca.'),
  (21, 2728,  7, 'Presencial', 14, 'SESMT',            'planejada',
   'Turma para operadores da linha de envase e da paletizadora.'),
  (21, 2736,  9, 'Presencial', 20, 'Qualidade',        'planejada',
   '5S no armazém — preparação para a auditoria de certificação.'),
  (21, 2737, 11, 'EAD',        16, 'Compliance',       'planejada',
   'Reciclagem bienal — dados de clientes e transportadores parceiros.'),
  (22, 2734,  1, 'Presencial',  4, 'Recursos Humanos', 'realizada',
   'Integração dos admitidos do 1º trimestre — manutenção e qualidade.'),
  (22, 2725,  2, 'Presencial', 12, 'SESMT',            'realizada',
   'Reciclagem anual de EPI — oficina e área de manutenção.'),
  (22, 2726,  5, 'Presencial',  3, 'Manutenção',       'realizada',
   'Curso básico NR-10 para a equipe de manutenção elétrica.'),
  (22, 2729,  6, 'Presencial',  3, 'Manutenção',       'planejada',
   'Trabalho em altura — docas niveladoras e cobertura do galpão. Turma remarcada por indisponibilidade do instrutor.'),
  (22, 2733,  8, 'Presencial', 10, 'Qualidade',        'planejada',
   'Boas práticas para a equipe de recebimento e inspeção.'),
  (22, 2735,  9, 'Presencial',  8, 'SESMT',            'planejada',
   'Formação da brigada de emergência da filial.'),
  (22, 2732, 10, 'EAD',        10, 'Qualidade',        'planejada',
   'Extensão do ciclo ISO 14001 à filial — aspectos e impactos da oficina.')
) AS v(unit_id, catalog_item_id, planned_month, modality, planned_quantity, responsible, status, notes)
JOIN units u             ON u.id  = v.unit_id         AND u.organization_id  = 3
JOIN training_catalog tc ON tc.id = v.catalog_item_id AND tc.organization_id = 3
WHERE NOT EXISTS (
  SELECT 1 FROM annual_training_program a
  WHERE a.organization_id = 3
    AND a.year            = extract(year from current_date)::int
    AND a.catalog_item_id = v.catalog_item_id
    AND a.unit_id         = v.unit_id
);

-- 0.2 Treinamentos que faltam para o gráfico por norma cobrir NR-11 e ISO 14001.
INSERT INTO employee_trainings
  (employee_id, title, description, objective, institution, workload_hours,
   completion_date, expiration_date, status, catalog_item_id,
   target_competency_name, target_competency_type, target_competency_level,
   evaluation_method, renewal_months, effectiveness_due_date, effectiveness_assigned_role)
SELECT e.id, tc.title, tc.objective, tc.objective, tc.default_instructor, tc.workload_hours,
       (current_date - make_interval(days => v.days_ago))::date,
       CASE WHEN tc.validity_months IS NULL THEN NULL
            ELSE (current_date - make_interval(days => v.days_ago)
                              + make_interval(months => tc.validity_months))::date END,
       'concluido', tc.id,
       tc.target_competency_name, tc.target_competency_type, tc.target_competency_level,
       tc.evaluation_method, tc.validity_months,
       (current_date - make_interval(days => v.days_ago) + make_interval(days => 60))::date,
       'gestor'
FROM (VALUES
  (2007, 2727, 105),
  (2005, 2732,  70),
  (2006, 2732,  70)
) AS v(employee_id, catalog_item_id, days_ago)
JOIN employees e         ON e.id  = v.employee_id     AND e.organization_id  = 3
JOIN training_catalog tc ON tc.id = v.catalog_item_id AND tc.organization_id = 3
WHERE NOT EXISTS (
  SELECT 1 FROM employee_trainings et
  WHERE et.employee_id = v.employee_id AND et.catalog_item_id = v.catalog_item_id
);

-- 0.3 Avaliações de eficácia nos treinamentos já existentes (org 3 garantido pelos JOINs).
INSERT INTO training_effectiveness_reviews
  (training_id, evaluator_user_id, evaluation_date, score, is_effective,
   result_level, comments, evaluator_role)
SELECT et.id, v.evaluator_user_id,
       CASE WHEN v.current_month
            THEN greatest(current_date - make_interval(days => v.days_ago),
                          date_trunc('month', current_date)::date)::date
            ELSE greatest(current_date - make_interval(days => v.days_ago),
                          et.completion_date + make_interval(days => 15))::date END,
       v.score, v.is_effective, v.result_level, v.comments, 'gestor'
FROM (VALUES
  (97658, 3,   3, true,  88, true,  4,
   'Passou a conduzir a análise crítica dos processos com base nos requisitos; evidência nas atas de análise crítica do 2º trimestre.'),
  (97682, 3,  27, false, 84, true,  4,
   'Conduziu duas auditorias internas com relatórios completos e não conformidades bem caracterizadas.'),
  (97683, 3,   5, true,  58, false, 2,
   'Ainda apresenta os indicadores sem analisar tendência e causa do desvio. Reforço programado com o Gerente da Qualidade.'),
  (97688, 3,  39, false, 81, true,  4,
   'Auditou o processo de recebimento da filial com autonomia; relatório aceito sem retrabalho.'),
  (97689, 3,  64, false, 79, true,  4,
   'Passou a sustentar a análise dos indicadores da filial na reunião mensal.'),
  (97666, 3,   9, true,  90, true,  4,
   'Uso correto e conservação dos EPIs confirmados em inspeção de campo da oficina.'),
  (97671, 54, 16, true,  62, false, 2,
   'Inspeção de doca registrou uso incorreto do protetor auricular em duas ocasiões. Reciclagem antecipada.'),
  (97667, 3,  32, false, 92, true,  4,
   'Aplica o procedimento de bloqueio e etiquetagem nas intervenções elétricas; verificado em acompanhamento.'),
  (97678, 54, 43, false, 55, false, 2,
   'Reprovado na reavaliação prática de operação: falhas no checklist diário e na estabilidade da carga. Nova turma necessária.'),
  (97663, 3,  22, false, 87, true,  4,
   'Passou a exigir e conferir as proteções fixas e os dispositivos de parada de emergência antes de liberar a linha.')
) AS v(training_id, evaluator_user_id, days_ago, current_month, score, is_effective, result_level, comments)
JOIN employee_trainings et ON et.id = v.training_id
JOIN employees e           ON e.id  = et.employee_id       AND e.organization_id  = 3
JOIN users ev              ON ev.id = v.evaluator_user_id  AND ev.organization_id = 3
WHERE NOT EXISTS (SELECT 1 FROM training_effectiveness_reviews r WHERE r.training_id = et.id);

-- 0.4 Avaliações de eficácia dos treinamentos criados em 0.2.
INSERT INTO training_effectiveness_reviews
  (training_id, evaluator_user_id, evaluation_date, score, is_effective,
   result_level, comments, evaluator_role)
SELECT et.id, v.evaluator_user_id,
       CASE WHEN v.current_month
            THEN greatest(current_date - make_interval(days => v.days_ago),
                          date_trunc('month', current_date)::date)::date
            ELSE greatest(current_date - make_interval(days => v.days_ago),
                          et.completion_date + make_interval(days => 15))::date END,
       v.score, v.is_effective, v.result_level, v.comments, 'gestor'
FROM (VALUES
  (2007, 2727, 3, 45, false, 85, true, 4,
   'Conduz a empilhadeira com segurança e passou a auditar o checklist diário da equipe do centro de distribuição.'),
  (2005, 2732, 3, 11, true,  86, true, 4,
   'Levantou os aspectos e impactos ambientais da operação e abriu os controles operacionais associados.'),
  (2006, 2732, 3,  7, true,  83, true, 4,
   'Aplicou o levantamento de aspectos ambientais na área de embalagem; destinação de resíduos revisada.')
) AS v(employee_id, catalog_item_id, evaluator_user_id, days_ago, current_month, score, is_effective, result_level, comments)
JOIN employees e           ON e.id  = v.employee_id AND e.organization_id = 3
JOIN employee_trainings et ON et.employee_id = e.id AND et.catalog_item_id = v.catalog_item_id
JOIN users ev              ON ev.id = v.evaluator_user_id AND ev.organization_id = 3
WHERE NOT EXISTS (SELECT 1 FROM training_effectiveness_reviews r WHERE r.training_id = et.id);

-- 0.5 Escalona os 4 vencidos (removendo a data absoluta 17/05/26); seguem vencidos.
UPDATE employee_trainings et
SET completion_date = (current_date - make_interval(months => v.months_ago)
                                    + make_interval(days   => v.day_off))::date,
    expiration_date = (current_date - make_interval(months => v.months_ago)
                                    + make_interval(days   => v.day_off)
                                    + make_interval(months => tc.validity_months))::date,
    updated_at = now()
FROM (VALUES
  (97669, 25,  -4),
  (97673, 14,   9),
  (97677, 27, -11),
  (97681, 40,   6)
) AS v(training_id, months_ago, day_off),
     employees e,
     training_catalog tc
WHERE et.id = v.training_id
  AND e.id  = et.employee_id     AND e.organization_id  = 3
  AND tc.id = et.catalog_item_id AND tc.organization_id = 3
  AND tc.validity_months IS NOT NULL
  AND et.status = 'vencido';


-- ============================================================================
-- MÓDULO 3 — ORGANIZAÇÃO (colaboradores)
-- MANTIDO: só os ajustes de baixo risco nos 8 colaboradores existentes + gestores.
-- REJEITADO: a inserção de 16 novos colaboradores + competências + treinamentos
-- (position/department sem acento não casavam com positions.name — quebrava os
-- JOINs de competência/treino e gerava registros inconsistentes na tela).
-- Acentos de escolaridade corrigidos aqui (Pós-Graduação/Médio/Técnico).
-- ============================================================================

-- 3.1 'temporario' está fora do enum da API -> 'temporary' (colaborador 2011).
UPDATE employees
SET contract_type = 'temporary',
    updated_at = now()
WHERE organization_id = 3
  AND contract_type = 'temporario';

-- 3.2 Ficha dos 8 colaboradores existentes (gender/education/birth_date), COALESCE idempotente.
UPDATE employees e
SET gender     = COALESCE(e.gender, v.gender),
    education  = COALESCE(e.education, v.education),
    phone      = COALESCE(e.phone, v.phone),
    birth_date = COALESCE(e.birth_date,
                          (current_date - make_interval(years => v.age_years, days => v.birth_off))::date),
    updated_at = now()
FROM (VALUES
  (2005, 'Masculino', 'Pós-Graduação',     47, 132, '(11) 98134-2207'),
  (2006, 'Feminino',  'Superior Completo', 34,  71, '(11) 99642-1180'),
  (2007, 'Masculino', 'Técnico',           40, 205, '(21) 98455-3390'),
  (2008, 'Feminino',  'Superior Completo', 32,  18, '(11) 98770-6642'),
  (2009, 'Masculino', 'Técnico',           36, 249, '(31) 99381-5027'),
  (2010, 'Feminino',  'Médio Completo',    27, 160, '(21) 98219-7734'),
  (2011, 'Masculino', 'Médio Completo',    24,  93, '(11) 99508-4416'),
  (2012, 'Feminino',  'Superior Completo', 39, 311, '(31) 98663-9052')
) AS v(id, gender, education, age_years, birth_off, phone)
WHERE e.organization_id = 3
  AND e.id = v.id;

-- 3.3 E-mails placeholder -> domínio próprio (remove @example.com e a caixa real jpbs@cesar.school).
UPDATE employees e
SET email = v.email,
    updated_at = now()
FROM (VALUES
  (2005, 'roberto.mendes@auroraindustria.com.br'),
  (2006, 'juliana.ferreira@auroraindustria.com.br'),
  (2007, 'marcos.almeida@auroraindustria.com.br'),
  (2008, 'fernanda.lima@auroraindustria.com.br'),
  (2009, 'ricardo.souza@auroraindustria.com.br'),
  (2010, 'camila.nunes@auroraindustria.com.br'),
  (2011, 'lucas.rocha@auroraindustria.com.br'),
  (2012, 'patricia.dias@auroraindustria.com.br')
) AS v(id, email)
WHERE e.organization_id = 3
  AND e.id = v.id
  AND (e.email IS NULL OR e.email LIKE '%@example.com' OR e.email = 'jpbs@cesar.school');

-- 3.4 Gestor por filial (unit_managers). EXISTS garante unidade E usuário org 3. ON CONFLICT idempotente.
INSERT INTO unit_managers (organization_id, unit_id, user_id)
SELECT 3, v.unit_id, v.user_id
FROM (VALUES
  (20, 54),
  (21, 57),
  (22, 55)
) AS v(unit_id, user_id)
WHERE EXISTS (SELECT 1 FROM units u WHERE u.id = v.unit_id AND u.organization_id = 3)
  AND EXISTS (SELECT 1 FROM users us WHERE us.id = v.user_id AND us.organization_id = 3)
ON CONFLICT (unit_id, user_id) DO NOTHING;


-- ============================================================================
-- MÓDULO 2 — GOVERNANÇA (conhecimento crítico + planejamento operacional)
-- MANTIDO: UPDATEs que tiram texto genérico/"fictícia" das telas + 5 novos ativos
--          de conhecimento (volume modesto). REJEITADO: expansão do planejamento
--          operacional (novos planos/ciclos/execuções/mudanças/revisões) — tabela
--          sinalizada como vazia no cliente real + lógica complexa em tela secundária.
-- ============================================================================

-- 2.1 Especializa os 3 ativos de conhecimento existentes (remove texto genérico repetido).
UPDATE knowledge_assets k
SET retention_method     = v.retention_method,
    succession_plan      = v.succession_plan,
    evidence_valid_until = current_date + v.days,
    updated_by_id        = v.updated_by,
    updated_at           = now() - make_interval(days => v.age_days)
FROM (VALUES
  ('Malha de rotas críticas',
   'Mapa de restrições e janelas versionado no controle de documentos, revisado a cada alteração de legislação municipal.',
   'Segundo programador de rotas formado por filial; repasse acompanhado nas duas primeiras programações.',
   100::int, 55::int, 9::int),
  ('Parâmetros de cubagem e embalagem',
   'Tabela de cubagem e critérios de embalagem anexos à instrução de trabalho, com revisão a cada nova família de produto.',
   'Conferentes multiplicadores treinados por turno; revisão conjunta com a Qualidade a cada trimestre.',
   165, 57, 21),
  ('Checklist de liberação de frota',
   'Checklist padronizado no plano operacional, com histórico de liberações e verificação em auditoria interna semestral.',
   'Rodízio de inspetores habilitados; nenhum turno opera sem ao menos dois inspetores treinados.',
   25, 57, 5)
) AS v(title, retention_method, succession_plan, days, updated_by, age_days)
WHERE k.organization_id = 3
  AND k.title = v.title
  AND k.retention_method = 'Procedimento documentado, treinamento interno e base de conhecimento.';

-- 2.2 Novos ativos de conhecimento (3 -> 8; reduzido de 10 para volume modesto).
--     created_by todos org 3; loss_risk_level em enum válido; NOT EXISTS por título.
INSERT INTO knowledge_assets
  (organization_id, title, description, loss_risk_level, retention_method,
   succession_plan, evidence_valid_until, created_by_id, updated_by_id, created_at, updated_at)
SELECT 3, v.title, v.description, v.loss_risk_level, v.retention_method, v.succession_plan,
       CASE WHEN v.days IS NULL THEN NULL ELSE current_date + v.days END,
       v.created_by, v.created_by,
       now() - make_interval(days => v.age_days),
       now() - make_interval(days => v.upd_days)
FROM (VALUES
  ('Parametrização do WMS e regras de endereçamento',
   'Regras de endereçamento, ondas de separação e parâmetros de reposição configurados no WMS. Conhecimento concentrado em poucos usuários-chave da operação.',
   'critical',
   'Manual de parametrização versionado no controle de documentos, exportação periódica das regras e capacitação de administradores suplentes.',
   'Formar segundo administrador do WMS até o fim do ciclo; revisão semestral das regras em conjunto com a Qualidade.',
   45::int, 54::int, 86::int, 12::int),
  ('Regulagem e diagnóstico da doca niveladora',
   'Ajuste de altura, inspeção hidráulica e diagnóstico de falhas recorrentes das docas niveladoras usadas no cross-docking.',
   'high',
   'Instrução de trabalho ilustrada, histórico de manutenções preventivas e registro dos diagnósticos na base de conhecimento.',
   'Habilitar um segundo técnico de manutenção; acompanhar as três primeiras intervenções junto ao técnico titular.',
   120, 57, 74, 26),
  ('Acoplamento e inspeção de cavalo mecânico e semirreboque',
   'Engate, verificação de quinta roda, sistema de freios e amarração de carga antes da liberação do conjunto.',
   'high',
   'Instrução de trabalho com registro fotográfico, checklist de liberação e treinamento prático periódico.',
   'Rodízio de inspetores treinados por turno, garantindo ao menos dois habilitados em cada filial.',
   60, 55, 68, 8),
  ('Tratamento de não conformidade e análise de causa raiz',
   'Condução da análise de causa (5 porquês e Ishikawa), definição da ação corretiva e verificação de eficácia.',
   'critical',
   'Procedimento de ação corretiva, biblioteca de casos resolvidos e mentoria dos analistas a cada abertura relevante.',
   'Formar analistas da Qualidade em cada filial; revisar o repositório de casos a cada análise crítica.',
   30, 54, 55, 4),
  ('Segregação e destinação de resíduos industriais',
   'Classificação, acondicionamento e destinação dos resíduos gerados na produção e na operação logística.',
   'medium',
   'Plano de gerenciamento de resíduos, contratos de destinação arquivados e treinamento anual das equipes.',
   'Designar suplente ambiental por filial; revisar o plano a cada renovação de licença.',
   75, 57, 44, 11)
) AS v(title, description, loss_risk_level, retention_method, succession_plan,
       days, created_by, age_days, upd_days)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_assets k
  WHERE k.organization_id = 3 AND k.title = v.title
);

-- 2.3 Especializa os 3 planos operacionais existentes (hoje texto idêntico).
--     Sem bump de current_revision_number (já existe revisão 1; evitar apontar p/ snapshot inexistente).
UPDATE operational_plans p
SET sequence_description   = v.sequence_description,
    execution_criteria     = v.execution_criteria,
    esg_considerations     = v.esg_considerations,
    required_resources     = v.required_resources,
    inputs                 = v.inputs,
    outputs                = v.outputs,
    updated_by_id          = v.updated_by,
    updated_at             = now() - make_interval(days => v.age_days)
FROM (VALUES
  ('Operação de coleta dedicada',
   '1. Confirmar pedido e janela com o cliente. 2. Alocar veículo dedicado e conferir liberação da frota. 3. Executar a coleta com conferência item a item. 4. Registrar comprovante e ocorrências no coletor.',
   'Checklist crítico concluído, motorista habilitado e documentação fiscal conferida antes da saída.',
   'Roteirização para reduzir quilometragem ociosa; monitorar marcha lenta e registrar desvios ambientais da operação.',
   ARRAY['Veículo dedicado','Motorista habilitado','Coletor WMS','Lacres numerados']::text[],
   ARRAY['Pedido liberado','Janela de coleta acordada','Requisitos do cliente']::text[],
   ARRAY['Coleta registrada','Comprovante digital','Indicador de pontualidade atualizado']::text[],
   54::int, 12::int),
  ('Cross-docking noturno',
   '1. Receber cargas na doca e conferir volumes. 2. Triar por rota de destino. 3. Consolidar e expedir dentro da janela noturna. 4. Fechar o turno com evidências no WMS.',
   'Doca niveladora inspecionada, equipe escalada e endereçamento do WMS confirmado antes do início da triagem.',
   'Operação noturna reduz congestionamento urbano; controlar ruído na doca e destinar corretamente embalagens descartadas.',
   ARRAY['Doca niveladora','Empilhadeira','Coletor WMS','Equipe de triagem']::text[],
   ARRAY['Carga recebida','Romaneio de origem','Escala noturna confirmada']::text[],
   ARRAY['Carga consolidada por rota','Evidência de expedição','Indicador de avaria atualizado']::text[],
   55, 6),
  ('Entrega urbana expressa',
   '1. Conferir a separação por rota. 2. Validar restrições de circulação e janelas de recebimento. 3. Executar a entrega com comprovação digital. 4. Tratar insucessos no mesmo dia.',
   'Checklist crítico concluído, rota homologada e comprovante digital habilitado no dispositivo do motorista.',
   'Priorizar rotas com menor emissão por entrega; consolidar cargas para reduzir viagens no perímetro urbano.',
   ARRAY['Veículo urbano','Motorista habilitado','Dispositivo de comprovação digital']::text[],
   ARRAY['Carga consolidada','Janela de recebimento do cliente','Restrições de circulação vigentes']::text[],
   ARRAY['Entrega comprovada','Registro de insucesso tratado','Indicador de SLA atualizado']::text[],
   57, 3)
) AS v(title, sequence_description, execution_criteria, esg_considerations,
       required_resources, inputs, outputs, updated_by, age_days)
WHERE p.organization_id = 3
  AND p.title = v.title
  AND p.sequence_description = '1. Confirmar demanda. 2. Validar frota. 3. Executar operação. 4. Registrar evidências.';

-- 2.4 Remove "Evidência fictícia..." dos 3 ciclos existentes (texto aparece na tela).
UPDATE operational_cycle_evidences ce
SET cycle_date       = now() - make_interval(days => v.age_days),
    status           = v.status,
    evidence_summary = v.summary
FROM (VALUES
  ('OP-DEMO-001-CICLO-01', 38::int, 'completed', 'Coleta executada dentro da janela acordada; conferência item a item sem divergência.'),
  ('OP-DEMO-002-CICLO-01', 45,      'completed', 'Triagem noturna concluída; cargas consolidadas por rota e expedidas dentro da janela.'),
  ('OP-DEMO-003-CICLO-01', 30,      'completed', 'Entregas urbanas comprovadas digitalmente; dois insucessos tratados no mesmo dia.')
) AS v(cycle_code, age_days, status, summary)
WHERE ce.organization_id = 3
  AND ce.cycle_code = v.cycle_code
  AND ce.evidence_summary = 'Evidência fictícia de execução operacional.';

-- 2.5 Remove "Execução fictícia registrada." das 9 execuções existentes e fecha o item pendente
--     dos ciclos que passaram a "completed" (roda depois de 2.4).
UPDATE operational_readiness_executions e
SET evidence_note = CASE e.status
      WHEN 'ok'      THEN 'Item verificado e liberado antes do início do ciclo.'
      WHEN 'failed'  THEN 'Item reprovado na verificação; ciclo retido para tratativa.'
      WHEN 'waived'  THEN 'Item dispensado com justificativa registrada pelo responsável.'
      ELSE NULL
    END
WHERE e.organization_id = 3
  AND e.evidence_note = 'Execução fictícia registrada.';

UPDATE operational_readiness_executions e
SET status        = 'ok',
    executed_at   = ce.cycle_date + interval '20 minutes',
    evidence_note = 'Item verificado e liberado antes do início do ciclo.'
FROM operational_cycle_evidences ce
WHERE e.organization_id = 3
  AND ce.id = e.cycle_evidence_id
  AND ce.organization_id = 3
  AND ce.status = 'completed'
  AND e.status = 'pending';

-- 2.6 Reancora no tempo a mudança operacional já existente (o seed gravou data absoluta).
UPDATE operational_changes
SET created_at  = now() - make_interval(days => 44),
    approved_at = now() - make_interval(days => 43),
    updated_at  = now() - make_interval(days => 43)
WHERE organization_id = 3
  AND title = 'Alteração de janela de expedição'
  AND created_at < now() - interval '50 days';

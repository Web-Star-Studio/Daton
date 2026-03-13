import { db, questionnaireThemesTable, questionnaireQuestionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type QuestionDef = {
  code: string;
  questionNumber: string;
  text: string;
  type: string;
  options: string[] | null;
  tags: Record<string, string[]> | null;
  conditionalOn?: string;
  conditionalValue?: string;
  sortOrder: number;
};

type ThemeDef = {
  code: string;
  name: string;
  description: string;
  sortOrder: number;
  questions: QuestionDef[];
};

async function seedTheme(themeDef: ThemeDef) {
  const existing = await db.select().from(questionnaireThemesTable).where(eq(questionnaireThemesTable.code, themeDef.code));
  if (existing.length > 0) return;

  const [theme] = await db.insert(questionnaireThemesTable).values({
    code: themeDef.code,
    name: themeDef.name,
    description: themeDef.description,
    sortOrder: themeDef.sortOrder,
  }).returning();

  for (const q of themeDef.questions) {
    await db.insert(questionnaireQuestionsTable).values({
      themeId: theme.id,
      code: q.code,
      questionNumber: q.questionNumber,
      text: q.text,
      type: q.type,
      options: q.options,
      conditionalOn: q.conditionalOn || null,
      conditionalValue: q.conditionalValue || null,
      tags: q.tags,
      sortOrder: q.sortOrder,
    });
  }
}

const instalacoes: ThemeDef = {
  code: "instalacoes",
  name: "Instalações",
  description: "Questões sobre as instalações físicas e infraestrutura da unidade",
  sortOrder: 2,
  questions: [
    { code: "inst_01", questionNumber: "1", text: "As atividades da unidade geram a emissão de vibrações contínuas?", type: "single_select", options: ["Sim", "Não"], tags: { "Sim": ["vibracoes_continuas", "instalacoes_vibracoes"] }, sortOrder: 1 },
    { code: "inst_02", questionNumber: "2", text: "Informe a área (metragem) da empresa — área construída e área total do terreno.", type: "text", options: null, tags: null, sortOrder: 2 },
    { code: "inst_03", questionNumber: "3", text: "Informe a quantidade de colaboradores da empresa — discriminar a quantidade de funcionários próprios e quantidade de terceirizados fixos.", type: "text", options: null, tags: null, sortOrder: 3 },
    { code: "inst_04", questionNumber: "4", text: "Relate todos os serviços e/ou produtos desenvolvidos pela unidade e, no caso desse último, todas as principais matérias primas utilizadas na fabricação do produto.", type: "text", options: null, tags: null, sortOrder: 4 },
    { code: "inst_05", questionNumber: "5", text: "Descreva as atividades realizadas pela unidade e produtos ou serviços desenvolvidos/realizados que fazem parte do escopo do sistema de gestão/de compliance da empresa e que deverão ser abrangidas no monitoramento de requisitos legais.", type: "text", options: null, tags: null, sortOrder: 5 },
    { code: "inst_06", questionNumber: "6", text: "A unidade realiza reformas ou obras de construção civil?", type: "single_select", options: ["Sim", "Não se aplica"], tags: { "Sim": ["construcao_civil", "obras_reformas"] }, sortOrder: 6 },
    { code: "inst_07", questionNumber: "7", text: "Qual tipo de armazenamento/estocagem a unidade utiliza?", type: "multi_select", options: ["Silos (Aéreo, Bag, de Superfície etc)", "Não se aplica"], tags: { "Silos (Aéreo, Bag, de Superfície etc)": ["armazenamento_silos"] }, sortOrder: 7 },
    { code: "inst_08", questionNumber: "8", text: "As instalações são providas de rede pública de água e esgoto?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["rede_publica_agua_esgoto"] }, sortOrder: 8 },
    { code: "inst_08_1", questionNumber: "8.1", text: "Qual a concessionária de serviço público de água e esgoto?", type: "single_select", options: ["Estadual", "Municipal"], conditionalOn: "inst_08", conditionalValue: "Sim", tags: { "Estadual": ["concessionaria_estadual"], "Municipal": ["concessionaria_municipal"] }, sortOrder: 9 },
    { code: "inst_09", questionNumber: "9", text: "Existem subestações elétricas?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["subestacoes_eletricas", "energia_eletrica"] }, sortOrder: 10 },
    { code: "inst_10", questionNumber: "10", text: "Há transformadores?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["transformadores", "energia_eletrica"] }, sortOrder: 11 },
    { code: "inst_11", questionNumber: "11", text: "Existem atmosferas potencialmente explosivas?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["atmosferas_explosivas", "produtos_quimicos_perigosos"] }, sortOrder: 12 },
    { code: "inst_12", questionNumber: "12", text: "Há geradores de energia à diesel?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["geradores_diesel", "emissoes_atmosfericas", "combustiveis_inflamaveis"] }, sortOrder: 13 },
    { code: "inst_13", questionNumber: "13", text: "A unidade possui consultório odontológico?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["consultorio_odontologico", "saude_trabalhador"] }, sortOrder: 14 },
    { code: "inst_14", questionNumber: "14", text: "A unidade possui ambulatório?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["ambulatorio", "saude_trabalhador"] }, sortOrder: 15 },
    { code: "inst_15", questionNumber: "15", text: "A unidade possui refeitório?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["refeitorio"] }, sortOrder: 16 },
    { code: "inst_15_1a", questionNumber: "15.1", text: "O estabelecimento é enquadrado como:", type: "single_select", options: ["Cozinha Industrial", "Apenas Área Para Alimentação (sem Preparo de Alimentos)"], conditionalOn: "inst_15", conditionalValue: "Sim", tags: { "Cozinha Industrial": ["cozinha_industrial"], "Apenas Área Para Alimentação (sem Preparo de Alimentos)": ["area_alimentacao"] }, sortOrder: 17 },
    { code: "inst_15_1b", questionNumber: "15.1b", text: "A prestação de serviço de alimentação é terceirizada?", type: "single_select", options: ["Sim", "Não Se Aplica"], conditionalOn: "inst_15", conditionalValue: "Sim", tags: { "Sim": ["alimentacao_terceirizada"] }, sortOrder: 18 },
    { code: "inst_16", questionNumber: "16", text: "A unidade possui laboratório?", type: "multi_select", options: ["Laboratório de Ensaios E/ou Calibração", "Laboratório Clínico (análise de Amostras de Paciente/funcionário, Incluindo Exames Exigidos No Pcmso)", "Laboratório de Análises Físico-químicas Ou Microbiológica de Potabilidade de Água", "Laboratório de Análises Físico-químicas Ou Microbiológica Em Alimentos (incluindo Seus Resíduos, Embalanges, Etc)", "Laboratório de Análises Ambientais (emissões Atmosféricas, Efluentes, Solo, Águas Subterrâneas, Superficiais, Etc)", "Patologias Clínicas", "Não Se Aplica"], tags: { "Laboratório de Ensaios E/ou Calibração": ["laboratorio_ensaios_calibracao"], "Laboratório Clínico (análise de Amostras de Paciente/funcionário, Incluindo Exames Exigidos No Pcmso)": ["laboratorio_clinico", "saude_trabalhador"], "Laboratório de Análises Físico-químicas Ou Microbiológica de Potabilidade de Água": ["laboratorio_agua", "recursos_hidricos"], "Laboratório de Análises Físico-químicas Ou Microbiológica Em Alimentos (incluindo Seus Resíduos, Embalanges, Etc)": ["laboratorio_alimentos"], "Laboratório de Análises Ambientais (emissões Atmosféricas, Efluentes, Solo, Águas Subterrâneas, Superficiais, Etc)": ["laboratorio_ambiental", "emissoes_atmosfericas"], "Patologias Clínicas": ["laboratorio_patologia", "saude_trabalhador"] }, sortOrder: 19 },
    { code: "inst_17", questionNumber: "17", text: "A unidade possui trabalhadores alojados?", type: "single_select", options: ["Sim", "Não"], tags: { "Sim": ["trabalhadores_alojados"] }, sortOrder: 20 },
    { code: "inst_18", questionNumber: "18", text: "Existem barragens no site da unidade?", type: "single_select", options: ["Sim", "Somente Reservatório de Água, Represa Ou Lagos Artificiais, Não Caracterizados Como Barragem", "Não Se Aplica"], tags: { "Sim": ["barragens"], "Somente Reservatório de Água, Represa Ou Lagos Artificiais, Não Caracterizados Como Barragem": ["reservatorio_agua"] }, sortOrder: 21 },
    { code: "inst_19", questionNumber: "19", text: "Existe alguma área ou instalação na área da unidade alvo de tombamento?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["tombamento_patrimonio"] }, sortOrder: 22 },
    { code: "inst_20", questionNumber: "20", text: "Existe área de armazenamento de contêiner (não considerar IBC's - contetores de plástico)?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["armazenamento_conteiner"] }, sortOrder: 23 },
    { code: "inst_21", questionNumber: "21", text: "A unidade possui heliponto?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["heliponto"] }, sortOrder: 24 },
    { code: "inst_22", questionNumber: "22", text: "Existem escadas rolantes, esteiras ou rampas na empresa?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["escadas_rolantes_esteiras"] }, sortOrder: 25 },
    { code: "inst_23", questionNumber: "23", text: "Na unidade qual a média de circulação/concentração de pessoas?", type: "single_select", options: ["Inferior a 200 pessoas", "Entre 201 a 299 Pessoas", "Igual Ou Superior A 300 Pessoas", "Igual Ou Superior A 500 Pessoas", "Igual Ou Superior A 1000 Pessoas", "Igual Ou Superior A 1.500 Pessoas", "Igual Ou Superior A 2.000 Pessoas", "Igual Ou Superior A 5.000 Pessoas"], tags: { "Igual Ou Superior A 300 Pessoas": ["concentracao_300_mais"], "Igual Ou Superior A 500 Pessoas": ["concentracao_300_mais", "concentracao_500_mais"], "Igual Ou Superior A 1000 Pessoas": ["concentracao_300_mais", "concentracao_500_mais", "concentracao_1000_mais"], "Igual Ou Superior A 1.500 Pessoas": ["concentracao_300_mais", "concentracao_500_mais", "concentracao_1000_mais"], "Igual Ou Superior A 2.000 Pessoas": ["concentracao_300_mais", "concentracao_500_mais", "concentracao_1000_mais"], "Igual Ou Superior A 5.000 Pessoas": ["concentracao_300_mais", "concentracao_500_mais", "concentracao_1000_mais"] }, sortOrder: 26 },
    { code: "inst_24", questionNumber: "24", text: "A unidade realiza atividade de desinfecção e esterilização de produtos ou materiais?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["desinfeccao_esterilizacao", "produtos_quimicos_perigosos"] }, sortOrder: 27 },
    { code: "inst_25", questionNumber: "25", text: "Quais os meios de suspensão ou tração que a unidade utiliza?", type: "multi_select", options: ["Talhas", "Polia", "Correntes", "Ganchos", "Cabos de Aço", "Outros", "Nenhuma das Anteriores"], tags: { "Talhas": ["equipamentos_suspensao_tracao"], "Polia": ["equipamentos_suspensao_tracao"], "Correntes": ["equipamentos_suspensao_tracao"], "Ganchos": ["equipamentos_suspensao_tracao"], "Cabos de Aço": ["equipamentos_suspensao_tracao"], "Outros": ["equipamentos_suspensao_tracao"] }, sortOrder: 28 },
    { code: "inst_26", questionNumber: "26", text: "A unidade realiza (ou pode vir a realizar) parcelamento do solo?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["parcelamento_solo"] }, sortOrder: 29 },
    { code: "inst_27", questionNumber: "27", text: "A unidade possui em seu site cercas energizadas/elétricas?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["cercas_eletricas"] }, sortOrder: 30 },
    { code: "inst_28", questionNumber: "28", text: "A unidade realiza atividade que possa ser foco de atração de pássaros em um raio de 20 km de aeroportos que operem por instrumento ou em raio de 13 km de demais aeródromos?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["atracao_passaros_aeroporto", "localizacao_fauna_flora"] }, sortOrder: 31 },
    { code: "inst_29", questionNumber: "29", text: "Existem fontes de ruído na unidade ou são realizadas atividades que possam produzir ruído além dos limites das instalações da empresa?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["ruido_externo", "emissoes_atmosfericas"] }, sortOrder: 32 },
    { code: "inst_30", questionNumber: "30", text: "A unidade possui lagoa de tratamento? (Lagoa de tratamento: toda e qualquer estrutura em solo destinada ao tratamento e/ou armazenamento temporário de efluentes líquidos e de resíduos sólidos gerados por diversas atividades)", type: "single_select", options: ["Sim", "Não se aplica"], tags: { "Sim": ["lagoa_tratamento", "recursos_hidricos_efluentes", "residuos"] }, sortOrder: 33 },
  ],
};

const produtosInsumos: ThemeDef = {
  code: "produtos_insumos",
  name: "Produtos, Insumos e Demais Substâncias",
  description: "Questões sobre produtos pré-medidos, importação/exportação, transgênicos e conformidade INMETRO",
  sortOrder: 4,
  questions: [
    { code: "pi_01", questionNumber: "1", text: "A unidade fabrica produtos pré-medidos?", type: "single_select", options: ["Sim", "Não se aplica"], tags: { "Sim": ["produtos_pre_medidos", "inmetro"] }, sortOrder: 1 },
    { code: "pi_02", questionNumber: "2", text: "A unidade realiza atividades de importação e/ou exportação? (Aplicável às unidades que efetuam operações comerciais internacionais de compra e/ou venda de produtos, insumos ou equipamentos, ainda que utilizem recintos alfandegados de terceiros para desembaraço ou embarque de mercadorias.)", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["importacao_exportacao", "comercio_internacional"] }, sortOrder: 2 },
    { code: "pi_03", questionNumber: "3", text: "A unidade fabrica ou utiliza produtos transgênicos?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["produtos_transgenicos", "biosseguranca"] }, sortOrder: 3 },
    { code: "pi_04", questionNumber: "4", text: "A unidade fabrica, comercializa ou utiliza produtos sujeitos à avaliação da conformidade pelo INMETRO ou organismo acreditado?", type: "multi_select", options: ["Fabrica", "Comercializa", "Utiliza", "Não Se Aplica"], tags: { "Fabrica": ["inmetro_fabrica", "avaliacao_conformidade"], "Comercializa": ["inmetro_comercializa", "avaliacao_conformidade"], "Utiliza": ["inmetro_utiliza", "avaliacao_conformidade"] }, sortOrder: 4 },
  ],
};

const produtosFlorestais: ThemeDef = {
  code: "produtos_florestais",
  name: "Produtos e Subprodutos Florestais",
  description: "Questões sobre produção orgânica, produtos florestais, carvão vegetal, madeira e fitossanidade",
  sortOrder: 5,
  questions: [
    { code: "pf_01", questionNumber: "1", text: "A unidade possui sistema orgânico de produção?", type: "single_select", options: ["Sim", "Não se aplica"], tags: { "Sim": ["producao_organica", "produtos_florestais"] }, sortOrder: 1 },
    { code: "pf_02", questionNumber: "2", text: "A unidade realiza o plantio, consome/explora ou utiliza produtos (estado bruto ou in natura) e subprodutos (submetido a processo de beneficiamento) florestais?", type: "multi_select", options: ["Não Se Aplica", "Consome ou realiza plantio de Produtos de Origem Nativa", "Consome ou realiza plantio de Produtos de Origem Plantada/exótica", "Consome Subprodutos de Origem Nativa", "Consome Subprodutos de Origem Plantada/exótica", "Apenas Consome Ou Utiliza Palletes de Madeira Plantada/exótica", "Apenas Consome Ou Utiliza Palletes de Madeira Nativa", "Apenas Consome Ou Utiliza Outros Subprodutos de Madeira Acabados, Exceto Palletes (exemplo: Portas, Janelas, Mobiliário, Etc.)", "Realiza Exploração de Florestas Sob Regime de Concessão Federal E/ou Estadual.", "Realiza Exploração Econômica de Produto Acabado Ou Material Reprodutivo Oriundo de Acesso Ao Patrimônio Genético Ou Ao Conhecimento Tradicional Associado"], tags: { "Consome ou realiza plantio de Produtos de Origem Nativa": ["produtos_florestais_nativos", "ibama"], "Consome ou realiza plantio de Produtos de Origem Plantada/exótica": ["produtos_florestais_plantados"], "Consome Subprodutos de Origem Nativa": ["subprodutos_florestais_nativos", "ibama"], "Consome Subprodutos de Origem Plantada/exótica": ["subprodutos_florestais_plantados"], "Apenas Consome Ou Utiliza Palletes de Madeira Plantada/exótica": ["paletes_madeira_plantada"], "Apenas Consome Ou Utiliza Palletes de Madeira Nativa": ["paletes_madeira_nativa", "ibama"], "Apenas Consome Ou Utiliza Outros Subprodutos de Madeira Acabados, Exceto Palletes (exemplo: Portas, Janelas, Mobiliário, Etc.)": ["subprodutos_madeira_acabados"], "Realiza Exploração de Florestas Sob Regime de Concessão Federal E/ou Estadual.": ["concessao_florestal", "ibama"], "Realiza Exploração Econômica de Produto Acabado Ou Material Reprodutivo Oriundo de Acesso Ao Patrimônio Genético Ou Ao Conhecimento Tradicional Associado": ["patrimonio_genetico", "conhecimento_tradicional"] }, sortOrder: 2 },
    { code: "pf_03", questionNumber: "3", text: "A unidade consome ou transporta carvão vegetal?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["carvao_vegetal", "produtos_florestais"] }, sortOrder: 3 },
    { code: "pf_04", questionNumber: "4", text: "É realizada importação e/ou exportação de produtos e subprodutos madeireiros?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["importacao_exportacao_madeira", "comercio_internacional"] }, sortOrder: 4 },
    { code: "pf_05", questionNumber: "5", text: "A unidade realiza importação ou exportação de produtos embalados em madeira?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["embalagem_madeira", "comercio_internacional", "fitossanidade"] }, sortOrder: 5 },
    { code: "pf_06", questionNumber: "6", text: "A unidade importa ou exporta produtos sujeitos a controle de requisitos fitossanitários?", type: "multi_select", options: ["Não Se Aplica", "Produtos Em Paletes Ou Outras Embalagens de Madeira", "Produtos Vegetais Tais Como Madeira, Mudas, Sementes, Frutos, Etc."], tags: { "Produtos Em Paletes Ou Outras Embalagens de Madeira": ["fitossanidade_embalagem_madeira", "comercio_internacional"], "Produtos Vegetais Tais Como Madeira, Mudas, Sementes, Frutos, Etc.": ["fitossanidade_vegetais", "comercio_internacional"] }, sortOrder: 6 },
    { code: "pf_07", questionNumber: "7", text: "A unidade utiliza e/ou comercializa mudas?", type: "multi_select", options: ["Utiliza", "Comercializa", "Não Se Aplica"], tags: { "Utiliza": ["mudas_utiliza", "produtos_florestais"], "Comercializa": ["mudas_comercializa", "produtos_florestais"] }, sortOrder: 7 },
    { code: "pf_08", questionNumber: "8", text: "Há exigência de plano de manejo florestal sustentável para a área da unidade?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["manejo_florestal", "ibama"] }, sortOrder: 8 },
    { code: "pf_09", questionNumber: "9", text: "A unidade realiza ou contrata o transporte rodoviário de toras ou madeira bruta?", type: "multi_select", options: ["Realiza", "Contrata / Adquire de Terceiros", "Não Se Aplica"], tags: { "Realiza": ["transporte_madeira_bruta", "produtos_florestais"], "Contrata / Adquire de Terceiros": ["transporte_madeira_terceiros", "produtos_florestais"] }, sortOrder: 9 },
  ],
};

const combustiveisInflamaveis: ThemeDef = {
  code: "combustiveis_inflamaveis",
  name: "Combustíveis e Inflamáveis",
  description: "Questões sobre armazenamento de combustíveis, GLP, gás natural, postos de abastecimento e GNV",
  sortOrder: 6,
  questions: [
    { code: "ci_01", questionNumber: "1", text: "A unidade possui armazenamento de combustíveis e inflamáveis?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["armazenamento_combustiveis", "combustiveis_inflamaveis"] }, sortOrder: 1 },
    { code: "ci_01_1", questionNumber: "1.1", text: "O armazenamento é em recipientes estacionários ou em transportáveis?", type: "multi_select", options: ["Estacionários", "Transportáveis"], conditionalOn: "ci_01", conditionalValue: "Sim", tags: { "Estacionários": ["tanques_estacionarios", "combustiveis_inflamaveis"], "Transportáveis": ["recipientes_transportaveis", "combustiveis_inflamaveis"] }, sortOrder: 2 },
    { code: "ci_01_2", questionNumber: "1.2", text: "Se em tanque, o mesmo é aéreo ou subterrâneo?", type: "multi_select", options: ["Aéreo Até 15 M³", "Subterrâneo", "Aéreo Acima de 15 M³", "Não Se Aplica"], conditionalOn: "ci_01", conditionalValue: "Sim", tags: { "Aéreo Até 15 M³": ["tanque_aereo_pequeno", "combustiveis_inflamaveis"], "Subterrâneo": ["tanque_subterraneo", "combustiveis_inflamaveis"], "Aéreo Acima de 15 M³": ["tanque_aereo_grande", "combustiveis_inflamaveis"] }, sortOrder: 3 },
    { code: "ci_02", questionNumber: "2", text: "A unidade utiliza GLP - Gás Liquefeito de Petróleo ou Gás Natural?", type: "multi_select", options: ["GLP - Gás Liquefeito de Petróleo", "Gás Natural", "Não Se Aplica"], tags: { "GLP - Gás Liquefeito de Petróleo": ["glp", "combustiveis_inflamaveis"], "Gás Natural": ["gas_natural", "combustiveis_inflamaveis"] }, sortOrder: 4 },
    { code: "ci_02_1", questionNumber: "2.1", text: "O armazenamento de GLP ocorre em recipientes transportáveis ou estacionários?", type: "multi_select", options: ["Não há armazenamento em reservatório", "Transportáveis", "Estacionários"], conditionalOn: "ci_02", conditionalValue: "GLP - Gás Liquefeito de Petróleo", tags: { "Transportáveis": ["glp_transportavel"], "Estacionários": ["glp_estacionario"] }, sortOrder: 5 },
    { code: "ci_03", questionNumber: "3", text: "A unidade faz uso de instalações de transporte dutoviário de gás natural?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["transporte_dutoviario_gas", "gas_natural"] }, sortOrder: 6 },
    { code: "ci_04", questionNumber: "4", text: "Há posto de abastecimento de combustíveis automotivos na unidade?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["posto_abastecimento", "combustiveis_inflamaveis"] }, sortOrder: 7 },
    { code: "ci_04_1", questionNumber: "4.1", text: "Como é o armazenamento de combustível no posto?", type: "multi_select", options: ["Aéreo", "Subterrâneo"], conditionalOn: "ci_04", conditionalValue: "Sim", tags: { "Aéreo": ["posto_tanque_aereo"], "Subterrâneo": ["posto_tanque_subterraneo"] }, sortOrder: 8 },
    { code: "ci_05", questionNumber: "5", text: "A unidade utiliza gás natural veicular (GNV) em sua frota de veículos?", type: "single_select", options: ["Sim", "Não Se Aplica"], tags: { "Sim": ["gnv", "gas_natural", "combustiveis_inflamaveis"] }, sortOrder: 9 },
  ],
};

export async function seedQuestionnaire() {
  await seedTheme(instalacoes);
  await seedTheme(produtosInsumos);
  await seedTheme(produtosFlorestais);
  await seedTheme(combustiveisInflamaveis);
}

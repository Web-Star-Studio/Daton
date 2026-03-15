import { Router, type Request, type Response } from "express";
import { requireAuth, requireWriteAccess } from "../middlewares/auth";
import { db, legislationsTable, type Legislation } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const TAG_VOCABULARY = [
  "administracao_porto_maritimo","aerodromo","aerossol","agricultura","agua_mineral_galoes",
  "alimentacao_terceirizada","ambulancia","ambulatorio","analise_ambiental","analise_clinica_pcmso",
  "analise_medicamentos","analise_potabilidade_agua","anvisa","apa_protecao_ambiental",
  "app_preservacao_permanente","ar_condicionado","area_alimentacao","area_protegida","areas_verdes",
  "armazena_agrotoxicos","armazena_controlados_exercito","armazena_controlados_pf","armazena_medicamentos",
  "armazenamento_combustiveis","armazenamento_conteiner","armazenamento_silos","ascarel_pcb",
  "atendimento_urgencia","aterro_controlado","aterro_industrial","aterro_sanitario","atividade_petrolifera",
  "atividades_aeroporto","atividades_gas_oleo","atividades_hidrogenio","atividades_pintura",
  "atividades_terminais_ferroviarios","atividades_terminais_rodoviarios","atmosferas_explosivas",
  "atracao_passaros_aeroporto","audiencias_publicas","avaliacao_conformidade","bacia_paraiba_sul",
  "bacia_sao_francisco","bacia_uruguai","barragens","bebedouros","bebedouros_tradicionais",
  "biodiversidade","biosseguranca","cabine_audiometrica","cabine_pintura","caixa_separadora_agua_oleo",
  "caldeiras","camaras_frigorificas","caminhao_pipa","captacao_agua_chuva","captacao_subterranea",
  "captacao_superficial","carvao_vegetal","cavidades_subterraneas","central_eolica","central_termeletrica",
  "cercas_eletricas","cestas_aereas","cnen","codigo_defesa_consumidor","coleta_seletiva",
  "combate_incendio","combustiveis_inflamaveis","comercializa_agrotoxicos","comercializa_controlados_exercito",
  "comercializa_controlados_pf","comercializa_medicamentos","comercializacao_energia","comercio_internacional",
  "compensacao_ambiental_financeira","compensacao_ambiental_mitigadora","compostagem_propria",
  "compostagem_terceiros","comunidade_indigena","comunidade_quilombola","concessao_florestal",
  "concessionaria_energia","concessionaria_estadual","concessionaria_municipal","concretagem",
  "conhecimento_tradicional","construcao_civil","consultorio_odontologico","contaminacao_solo_agua",
  "contrata_pcd","contratacao_livre_energia","controle_pragas","controle_pragas_agronomo",
  "controle_pragas_biologo","controle_pragas_quimico","coprocessamento","cota_pcd","cozinha_industrial",
  "ctf_estadual","ctf_ibama","ctf_municipal","curso_agua_distante","curso_agua_proximo",
  "desenvolvimento_limpo","desinfeccao_esterilizacao","dispensa_licenciamento","distribuicao_energia",
  "dragagem","drone_ambiental","eficiencia_energetica","efluentes_rede_publica","eia_rima",
  "elevador_carga","elevador_pessoas","embalagem_madeira","emissoes_atmosfericas","energia_eletrica",
  "energia_eolica","energia_gas_natural","energia_glp","energia_solar","energia_termeletrica",
  "equipamentos","equipamentos_suspensao_tracao","escadas_rolantes_esteiras","esfigmomanometros",
  "estacoes_radio_base","estagiarios","eta","ete_industrial","ete_sanitario","exploracao_florestal",
  "explosivos","exportacao_residuos","exposicao_amianto","exposicao_benzeno","fabrica_agrotoxicos",
  "fabrica_benzeno","fabrica_biodiesel","fabrica_controlados_exercito","fabrica_controlados_pc",
  "fabrica_controlados_pf","fabrica_medicamentos","fabrica_solventes_controlados","fabricacao_cosmeticos",
  "fauna_ameacada_extincao","flora_ameacada_extincao","fossa_septica","frota_propria",
  "fumaca_opacidade","gases_efeito_estufa","gases_especiais","geradores_diesel","gpl_gas_liquefeito",
  "grr_residuos_solidos","grr_residuos_transporte","heliponto","importacao_residuos",
  "incineracao","instalacoes_vibracoes","irrigacao","laboratorio_certificado","lavagem_veiculos",
  "ldo_loa_legislacao_orcamentaria","legislacao_biodiesel","legislacao_etanol",
  "legislacao_tributaria_ambiental","licenca_ambiental","licenca_ambiental_estadual",
  "licenca_ambiental_federal","licenca_ambiental_municipal","licenciamento_simplificado",
  "limpeza_fossa","limpeza_hospitalar","lodo_esgoto","madeira_certificada","manipulacao_alimentos",
  "manipulacao_medicamentos","manometros","manuseio_agrotoxicos","maquinas_equipamentos_nr12",
  "mata_atlantica","mercurio","mineracao","monitoramento_agua_subterranea","monitoramento_efluentes",
  "monitoramento_emissoes","monitoramento_ruido","movimentacao_terra","mudanca_climatica",
  "nr10_eletricidade","nr11_transporte_materiais","nr12_maquinas","nr13_caldeiras_vasos",
  "nr15_insalubridade","nr16_periculosidade","nr17_ergonomia","nr18_construcao",
  "nr20_inflamaveis","nr23_protecao_incendio","nr25_residuos","nr33_espacos_confinados",
  "nr35_trabalho_altura","obras_reformas","oleo_ascarel","oleo_lubrificante_usado",
  "oleos_graxas","operacao_portuaria","outorga_agua","paisagismo","patrimonio_genetico",
  "pcb_bifenilas","pesca","pilhas_baterias","plano_contingencia","plano_emergencia",
  "plano_gerenciamento_residuos","plano_recuperacao_areas","pneus_inservíveis",
  "poco_artesiano","poda_arvores","poluicao_luminosa","poluicao_sonora","poluicao_visual",
  "ppa_plano_plurianual","produtos_controlados_exercito","produtos_controlados_pf",
  "produtos_perigosos","produtos_quimicos_perigosos","programa_ambiental","queima_controlada",
  "radiacao_ionizante","radiacao_nao_ionizante","raio_x","reciclagem","recursos_hidricos",
  "rede_publica_agua_esgoto","reflorestamento","refrigeracao","registro_pocos","reserva_legal",
  "reservatorio_agua","residuos_classe_i","residuos_classe_ii","residuos_construcao_civil",
  "residuos_eletroeletronicos","residuos_logistica_reversa","residuos_radioativos",
  "residuos_saude","residuos_solidos","restaurante_industrial","reuso_agua",
  "ruido_ambiental","ruido_ocupacional","saneamento_basico","saude_trabalhador",
  "silvicultura","sistema_fixo_gases","solventes_materia_prima","spda",
  "spie_inspecao","sprinklers","subestacoes_eletricas","subprodutos_florestais_nativos",
  "subprodutos_florestais_plantados","subprodutos_madeira_acabados","supressao_vegetacao",
  "tanque_aereo_grande","tanque_aereo_pequeno","tanque_subterraneo","tanques_estacionarios",
  "tanques_metalicos","telecomunicacoes","telemarketing","testes_combustiveis",
  "tombamento_patrimonio","torres_energia_aeroporto","trabalhador_avulso","trabalhadores_alojados",
  "trabalho_altura","trabalho_aquaviario","trabalho_portuario_maritimo","trabalho_portuario_seco",
  "trabalho_submerso","transformadores","transmissao_energia","transporte_aeromedico",
  "transporte_dutoviario_gas","transporte_madeira_bruta","transporte_madeira_terceiros",
  "transporte_perigosos_interestadual","transporte_perigosos_intraestadual","unidade_conservacao",
  "utiliza_agrotoxicos","utiliza_benzeno","utiliza_controlados_exercito","utiliza_controlados_pf",
  "utiliza_perigosos_fds","vacinacao_funcionarios","vale_transporte","vasos_pressao",
  "vasos_pressao_seriados","vibracoes_continuas","vigilancia_seguranca_privada","zona_costeira",
];

const SYSTEM_PROMPT = `Você é um especialista em compliance ambiental, qualidade e segurança do trabalho no Brasil, com profundo conhecimento da ISO 14001, legislação ambiental, e regulamentações de SST.

Sua tarefa: dado o conteúdo de uma legislação (título, ementa/descrição, macrotema, subtema), selecione TODAS as tags aplicáveis do vocabulário fornecido.

REGRAS:
1. Analise o título, descrição, macrotema e subtema da legislação
2. Selecione apenas tags que sejam DIRETAMENTE relevantes ao conteúdo da legislação
3. Considere tanto o tema explícito quanto temas implicitamente regulados
4. Retorne APENAS tags do vocabulário fornecido — nunca invente tags
5. Se nenhuma tag se aplicar, retorne array vazio
6. Retorne um JSON com a chave "tags" contendo um array de strings

VOCABULÁRIO DE TAGS DISPONÍVEIS:
${TAG_VOCABULARY.join(", ")}`;

async function autoTagLegislation(leg: Legislation): Promise<string[]> {
  const content = [
    `Título: ${leg.title}`,
    leg.description ? `Descrição/Ementa: ${leg.description}` : null,
    leg.macrotema ? `Macrotema: ${leg.macrotema}` : null,
    leg.subtema ? `Subtema: ${leg.subtema}` : null,
    leg.tipoNorma ? `Tipo de Norma: ${leg.tipoNorma}` : null,
    leg.emissor ? `Órgão Emissor: ${leg.emissor}` : null,
  ].filter(Boolean).join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Analise esta legislação e selecione as tags aplicáveis:\n\n${content}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const raw = response.choices[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(raw);
    const tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    return tags.filter((t: string) => TAG_VOCABULARY.includes(t));
  } catch {
    return [];
  }
}

router.post("/organizations/:orgId/legislations/auto-tag/batch", requireAuth, requireWriteAccess(), async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(String(req.params.orgId), 10);

  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const { ids, force } = req.body || {};

  let conditions = [eq(legislationsTable.organizationId, orgId)];
  if (Array.isArray(ids) && ids.length > 0) {
    conditions.push(inArray(legislationsTable.id, ids));
  }
  if (!force) {
    conditions.push(
      sql`(${legislationsTable.tags} IS NULL OR array_length(${legislationsTable.tags}, 1) IS NULL)`
    );
  }

  const legislations = await db.select().from(legislationsTable)
    .where(and(...conditions));

  if (legislations.length === 0) {
    res.json({ total: 0, tagged: 0, errors: 0, message: "Nenhuma legislação para classificar" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let tagged = 0;
  let errors = 0;

  res.write(`data: ${JSON.stringify({ type: "started", total: legislations.length })}\n\n`);

  for (let i = 0; i < legislations.length; i++) {
    const leg = legislations[i];
    try {
      const tags = await autoTagLegislation(leg);
      await db.update(legislationsTable)
        .set({ tags })
        .where(eq(legislationsTable.id, leg.id));
      tagged++;
      res.write(`data: ${JSON.stringify({ type: "progress", index: i, total: legislations.length, tagged, errors, legislationId: leg.id, title: leg.title, tagsCount: tags.length })}\n\n`);
    } catch (err) {
      errors++;
      console.error(`Auto-tag error for legislation ${leg.id}:`, err);
      res.write(`data: ${JSON.stringify({ type: "progress", index: i, total: legislations.length, tagged, errors, legislationId: leg.id, title: leg.title, error: true })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ type: "complete", total: legislations.length, tagged, errors })}\n\n`);
  res.end();
});

router.post("/organizations/:orgId/legislations/:legId/auto-tag", requireAuth, requireWriteAccess(), async (req: Request, res: Response): Promise<void> => {
  const orgId = parseInt(String(req.params.orgId), 10);
  const legId = parseInt(String(req.params.legId), 10);

  if (orgId !== req.auth!.organizationId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const [leg] = await db.select().from(legislationsTable)
    .where(and(eq(legislationsTable.id, legId), eq(legislationsTable.organizationId, orgId)));

  if (!leg) {
    res.status(404).json({ error: "Legislação não encontrada" });
    return;
  }

  try {
    const tags = await autoTagLegislation(leg);
    await db.update(legislationsTable)
      .set({ tags })
      .where(eq(legislationsTable.id, legId));

    res.json({ legislationId: legId, tags });
  } catch (err) {
    console.error("Auto-tag error:", err);
    res.status(500).json({ error: "Erro ao classificar legislação" });
  }
});

export default router;

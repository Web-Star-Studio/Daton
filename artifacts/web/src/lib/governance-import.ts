import * as XLSX from "xlsx";
import type { GovernanceImportPayload } from "@/lib/governance-client";

export interface GovernanceImportPreview {
  workbookName: string;
  planTitle: string;
  swotCount: number;
  interestedPartyCount: number;
  objectiveCount: number;
  anomalies: string[];
  payload: GovernanceImportPayload;
}

function normalizeValue(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cell(worksheet: XLSX.WorkSheet, ref: string): string {
  return normalizeValue(worksheet[ref]?.v);
}

function rowValues(worksheet: XLSX.WorkSheet, rowIndex: number, startCol = "A", endCol = "Z"): string[] {
  const range = XLSX.utils.decode_range(`${startCol}${rowIndex}:${endCol}${rowIndex}`);
  const values: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    values.push(normalizeValue(worksheet[XLSX.utils.encode_cell({ r: rowIndex - 1, c })]?.v));
  }
  return values;
}

function parseExcelDate(value: unknown): string | null {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = normalizeValue(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return text;
  const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!brMatch) return null;
  return `${brMatch[3]}-${String(brMatch[2]).padStart(2, "0")}-${String(brMatch[1]).padStart(2, "0")}`;
}

function parseHistorySheet(worksheet: XLSX.WorkSheet) {
  const items: GovernanceImportPayload["plan"]["legacyRevisionHistory"] = [];
  const anomalies: string[] = [];
  const seenRevisions = new Set<string>();

  for (let row = 3; row <= 80; row++) {
    const dateCell = worksheet[`B${row}`]?.v;
    const reason = cell(worksheet, `C${row}`);
    const changedItem = cell(worksheet, `D${row}`);
    const revision = cell(worksheet, `E${row}`);
    const changedBy = cell(worksheet, `F${row}`);

    if (!dateCell && !reason && !changedItem && !revision && !changedBy) continue;

    const parsedDate = parseExcelDate(dateCell);
    items?.push({
      date: parsedDate,
      reason: reason || null,
      changedItem: changedItem || null,
      revision: revision || null,
      changedBy: changedBy || null,
    });

    if (!revision) {
      anomalies.push(`Histórico de Revisões: linha ${row} sem número de revisão.`);
    } else if (seenRevisions.has(revision)) {
      anomalies.push(`Histórico de Revisões: revisão ${revision} repetida.`);
    } else {
      seenRevisions.add(revision);
    }
  }

  if (!items || items.length === 0) {
    anomalies.push("Histórico de Revisões sem dados úteis.");
  }

  return { items: items || [], anomalies };
}

function parsePlanSheet(
  scopeSheet: XLSX.WorkSheet,
  coverSheet: XLSX.WorkSheet | undefined,
  methodologySheet: XLSX.WorkSheet | undefined,
  strategySheet: XLSX.WorkSheet | undefined,
) {
  const legacyMethodology = methodologySheet
    ? rowValues(methodologySheet, 19, "B", "E").filter(Boolean).join(" ")
    : "";

  return {
    title: coverSheet ? cell(coverSheet, "B13") || "Planejamento Estratégico" : "Planejamento Estratégico",
    standards: ["ISO 9001:2015", "ISO 9001:2015/Amd 1:2024"],
    executiveSummary: strategySheet ? cell(strategySheet, "B65") : null,
    reviewFrequencyMonths: 12,
    reviewReason: null,
    climateChangeRelevant: null,
    climateChangeJustification: null,
    technicalScope: cell(scopeSheet, "B4") || null,
    geographicScope: cell(scopeSheet, "B6") || null,
    policy: cell(scopeSheet, "B12") || null,
    mission: cell(scopeSheet, "B25") || null,
    vision: cell(scopeSheet, "B27") || null,
    values: cell(scopeSheet, "B29") || null,
    strategicConclusion: strategySheet ? cell(strategySheet, "N65") || cell(strategySheet, "B65") : null,
    methodologyNotes: methodologySheet ? rowValues(methodologySheet, 19, "B", "E").join(" ") : null,
    legacyMethodology: legacyMethodology || null,
    legacyIndicatorsNotes: null,
  };
}

function parseSwotSgiSheet(worksheet: XLSX.WorkSheet) {
  const items: GovernanceImportPayload["swotItems"] = [];

  for (let row = 3; row <= 200; row++) {
    const description = cell(worksheet, `C${row}`);
    if (!description) continue;

    const factorTypeRaw = cell(worksheet, `E${row}`).toLowerCase();
    const environmentRaw = cell(worksheet, `F${row}`).toLowerCase();
    const domainRaw = cell(worksheet, `G${row}`);
    const objectiveCode = cell(worksheet, `O${row}`);
    const objectiveLabel = cell(worksheet, `P${row}`) || cell(worksheet, `M${row}`);

    const swotType =
      factorTypeRaw === "força"
        ? "strength"
        : factorTypeRaw === "fraqueza"
          ? "weakness"
          : factorTypeRaw === "oportunidade"
            ? "opportunity"
            : "threat";

    const domain =
      domainRaw.toLowerCase().includes("ambient")
        ? "sga"
        : domainRaw.toLowerCase().includes("segurança viária") || domainRaw.toLowerCase().includes("sv")
          ? "sgsv"
          : domainRaw.toLowerCase().includes("esg")
            ? "esg"
            : domainRaw.toLowerCase().includes("governan")
              ? "governance"
              : "sgq";

    items.push({
      importKey: `sgi-${row}`,
      domain,
      matrixLabel: "SWOT SGI",
      swotType,
      environment: environmentRaw === "externo" ? "external" : "internal",
      perspective: domainRaw || null,
      description,
      performance: Number(cell(worksheet, `H${row}`)) || null,
      relevance: Number(cell(worksheet, `I${row}`)) || null,
      result: Number(cell(worksheet, `J${row}`)) || null,
      treatmentDecision: cell(worksheet, `K${row}`) || null,
      linkedObjectiveCode: objectiveCode || null,
      linkedObjectiveLabel: objectiveLabel || null,
      importedActionReference: cell(worksheet, `N${row}`) || null,
      notes: null,
      sortOrder: row,
    });
  }

  return items;
}

function parseSwotSgaSheet(worksheet: XLSX.WorkSheet) {
  const items: GovernanceImportPayload["swotItems"] = [];
  let currentType: "strength" | "weakness" | "opportunity" | "threat" = "strength";
  let currentEnvironment: "internal" | "external" = "internal";

  for (let row = 1; row <= 160; row++) {
    const rowLabel = cell(worksheet, `B${row}`).toLowerCase();
    if (rowLabel === "forças") {
      currentType = "strength";
      currentEnvironment = "internal";
      continue;
    }
    if (rowLabel === "fraquezas") {
      currentType = "weakness";
      currentEnvironment = "internal";
      continue;
    }
    if (rowLabel === "oportunidades") {
      currentType = "opportunity";
      currentEnvironment = "external";
      continue;
    }
    if (rowLabel === "ameaças") {
      currentType = "threat";
      currentEnvironment = "external";
      continue;
    }

    const description = cell(worksheet, `B${row}`);
    if (!description || ["forças", "fraquezas", "oportunidades", "ameaças"].includes(rowLabel)) {
      continue;
    }

    const result = Number(cell(worksheet, `E${row}`)) || null;
    const objective = cell(worksheet, `F${row}`);
    const correlation = cell(worksheet, `G${row}`);
    const actionRef = cell(worksheet, `H${row}`);

    items.push({
      importKey: `sga-${row}`,
      domain: "sga",
      matrixLabel: "SWOT SGA",
      swotType: currentType,
      environment: currentEnvironment,
      perspective: "Ambiental",
      description,
      performance: null,
      relevance: null,
      result,
      treatmentDecision: result && result >= 8 ? "Relevante: requer ações" : null,
      linkedObjectiveCode: objective || null,
      linkedObjectiveLabel: objective || null,
      importedActionReference: actionRef || correlation || null,
      notes: correlation || null,
      sortOrder: row,
    });
  }

  return items;
}

function parseInterestedPartiesSheet(worksheet: XLSX.WorkSheet) {
  const items: GovernanceImportPayload["interestedParties"] = [];
  for (let row = 3; row <= 120; row++) {
    const name = cell(worksheet, `C${row}`);
    if (!name) continue;
    const relevant = cell(worksheet, `G${row}`).toLowerCase();
    const legal = cell(worksheet, `H${row}`).toLowerCase();
    items.push({
      name,
      expectedRequirements: cell(worksheet, `D${row}`) || null,
      roleInCompany: cell(worksheet, `E${row}`) || null,
      roleSummary: cell(worksheet, `F${row}`) || null,
      relevantToManagementSystem:
        relevant === "sim" ? true : relevant === "não" || relevant === "nao" ? false : null,
      legalRequirementApplicable:
        legal === "sim" ? true : legal === "não" || legal === "nao" ? false : null,
      monitoringMethod: cell(worksheet, `I${row}`) || null,
      notes: null,
      sortOrder: row,
    });
  }
  return items;
}

function parseIndicatorsSheet(worksheet?: XLSX.WorkSheet) {
  if (!worksheet) return new Map<string, string>();
  const notes = new Map<string, string>();
  const objectiveRows = [7, 13, 19, 25, 31];
  for (const row of objectiveRows) {
    const code = cell(worksheet, `A${row}`);
    const description = cell(worksheet, `C${row}`);
    if (code && description) {
      notes.set(code, description);
    }
  }
  return notes;
}

function parseObjectivesSheet(scopeSheet: XLSX.WorkSheet, indicatorsSheet?: XLSX.WorkSheet) {
  const indicatorNotes = parseIndicatorsSheet(indicatorsSheet);
  const items: GovernanceImportPayload["objectives"] = [];
  for (let row = 16; row <= 22; row++) {
    const systemDomain = cell(scopeSheet, `B${row}`);
    const objective = cell(scopeSheet, `D${row}`);
    if (!objective) continue;
    const codeMatch = objective.match(/^([A-Z]\d\))\s*(.*)$/);
    const code = codeMatch ? codeMatch[1].replace(")", "") : `OBJ-${row}`;
    const description = codeMatch ? codeMatch[2] : objective;
    items.push({
      importKey: code,
      code,
      systemDomain: systemDomain || null,
      description,
      notes: indicatorNotes.get(code) || null,
      sortOrder: row,
    });
  }
  return items;
}

export async function parseGovernanceWorkbook(file: File): Promise<GovernanceImportPreview> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const anomalies: string[] = [];

  const requiredSheets = [
    "Histórico de Revisões",
    "CAPA",
    "A0) METODOLOGIA",
    "A) SWOT SGI",
    "A2) SWOT SGA",
    "B)DIRECIONAMENTO ESTRATÉGICO SV",
    "B) PARTES INTERESSADAS",
    "C) ESCOPO POLíTICA OBJETIVOS",
  ];

  for (const sheetName of requiredSheets) {
    if (!workbook.Sheets[sheetName]) {
      anomalies.push(`Aba obrigatória ausente: ${sheetName}`);
    }
  }

  const coverSheet = workbook.Sheets["CAPA"];
  const methodologySheet = workbook.Sheets["A0) METODOLOGIA"];
  const historySheet = workbook.Sheets["Histórico de Revisões"];
  const swotSgiSheet = workbook.Sheets["A) SWOT SGI"];
  const swotSgaSheet = workbook.Sheets["A2) SWOT SGA"];
  const strategySheet = workbook.Sheets["B)DIRECIONAMENTO ESTRATÉGICO SV"];
  const interestedSheet = workbook.Sheets["B) PARTES INTERESSADAS"];
  const scopeSheet = workbook.Sheets["C) ESCOPO POLíTICA OBJETIVOS"];
  const indicatorsSheet = workbook.Sheets["D) INDICADORES E OBJETIVOS"];

  if (!scopeSheet) {
    throw new Error("A planilha não possui a aba C) ESCOPO POLíTICA OBJETIVOS, necessária para a importação.");
  }

  const history = historySheet ? parseHistorySheet(historySheet) : { items: [], anomalies: ["Aba Histórico de Revisões ausente."] };
  anomalies.push(...history.anomalies);

  const swotItems = [
    ...(swotSgiSheet ? parseSwotSgiSheet(swotSgiSheet) : []),
    ...(swotSgaSheet ? parseSwotSgaSheet(swotSgaSheet) : []),
  ];
  if (swotItems.length === 0) anomalies.push("Nenhum item SWOT foi encontrado.");

  const interestedParties = interestedSheet ? parseInterestedPartiesSheet(interestedSheet) : [];
  if (interestedParties.length === 0) anomalies.push("Nenhuma parte interessada foi encontrada.");

  const objectives = parseObjectivesSheet(scopeSheet, indicatorsSheet);
  if (objectives.length === 0) anomalies.push("Nenhum objetivo estratégico foi encontrado.");

  const plan = parsePlanSheet(scopeSheet, coverSheet, methodologySheet, strategySheet);

  if (!indicatorsSheet) {
    anomalies.push("Aba D) INDICADORES E OBJETIVOS ausente; notas de objetivos não foram importadas.");
  }
  if (!workbook.Sheets["D) OBJETIVOS E METAS "]) {
    anomalies.push("Aba D) OBJETIVOS E METAS ausente ou vazia.");
  }

  const payload: GovernanceImportPayload = {
    workbookName: file.name,
    plan: {
      ...plan,
      legacyRevisionHistory: history.items,
      importedWorkbookName: file.name,
    },
    swotItems,
    interestedParties,
    objectives,
    actions: [],
  };

  return {
    workbookName: file.name,
    planTitle: plan.title,
    swotCount: swotItems.length,
    interestedPartyCount: interestedParties.length,
    objectiveCount: objectives.length,
    anomalies,
    payload,
  };
}

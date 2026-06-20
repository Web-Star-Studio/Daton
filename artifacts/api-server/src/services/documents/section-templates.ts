import type { DocumentContentSection } from "@workspace/db";

const PROCEDIMENTO_SECTIONS = [
  "Objetivo",
  "Aplicação",
  "Definições e Referências",
  "Sequência, Interação, Recursos e Monitoramento",
  "Responsabilidade pelo Processo",
  "Procedimento",
];

export const SECTION_TEMPLATES: Record<string, string[]> = {
  procedimento: PROCEDIMENTO_SECTIONS,
  instrucao: PROCEDIMENTO_SECTIONS,
  politica: ["Objetivo", "Abrangência", "Diretrizes", "Responsabilidades", "Referências"],
  manual: [
    "Apresentação",
    "Escopo do SGI",
    "Referências Normativas",
    "Termos e Definições",
    "Descrição do Sistema",
  ],
  formulario: ["Instruções de Preenchimento"],
  registro: ["Instruções de Preenchimento"],
  outro: ["Conteúdo"],
};

export function seedSectionsForType(type: string): DocumentContentSection[] {
  const titles = SECTION_TEMPLATES[type] ?? SECTION_TEMPLATES.outro;
  return titles.map((title, index) => ({
    id: `sec-${index + 1}`, // IDs de seed; o client pode substituir por IDs estáveis ao editar
    title,
    body: "",
    order: index,
  }));
}

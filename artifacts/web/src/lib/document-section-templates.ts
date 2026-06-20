// Mirror de artifacts/api-server/src/services/documents/section-templates.ts — manter em sincronia.
import type { DocumentContentSection } from "@workspace/api-client-react";

const PROCEDIMENTO = [
  "Objetivo",
  "Aplicação",
  "Definições e Referências",
  "Sequência, Interação, Recursos e Monitoramento",
  "Responsabilidade pelo Processo",
  "Procedimento",
];

export const SECTION_TEMPLATE_TITLES: Record<string, string[]> = {
  procedimento: PROCEDIMENTO,
  instrucao: PROCEDIMENTO,
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
  const titles = SECTION_TEMPLATE_TITLES[type] ?? SECTION_TEMPLATE_TITLES.outro;
  return titles.map((title, i) => ({ id: `sec-${i + 1}`, title, body: "", order: i }));
}

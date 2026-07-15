import type { JSX } from "react";
import { CincoPorques } from "./metodos/cinco-porques";
import { Ishikawa } from "./metodos/ishikawa";
import { A3, A3_SECOES } from "./metodos/a3";
import { Fmea } from "./metodos/fmea";
import { ArvoreFalhas } from "./metodos/arvore-falhas";
import { KepnerTregoe } from "./metodos/kepner-tregoe";
import { RcaApollo } from "./metodos/rca-apollo";
import { Barreiras } from "./metodos/barreiras";
import {
  ISHIKAWA_CATEGORY_LABELS,
  KT_DIMENSIONS,
  fmeaRpn,
  type ActionPlanAnalysis,
  type AnalysisMethodKey,
} from "./types";

/** O `data` que corresponde a uma chave — extraído da própria união discriminada, para que
 *  chave e forma não possam divergir. */
export type DataFor<K extends AnalysisMethodKey> = Extract<
  ActionPlanAnalysis,
  { key: K }
>["data"];

type Adaptador<K extends AnalysisMethodKey> = {
  Component: (props: {
    data: DataFor<K>;
    onChange: (next: DataFor<K>) => void;
    readOnly?: boolean;
  }) => JSX.Element;
  dataVazio: () => DataFor<K>;
  /** Uma linha para o card colapsado e para o diff de versões. */
  resumo: (data: DataFor<K>) => string;
};

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Conta recursivamente os nós de uma árvore (o nó + toda a sua descendência). */
function contarNos<T extends { children: T[] }>(nodes: T[]): number {
  return nodes.reduce((acc, n) => acc + 1 + contarNos(n.children), 0);
}

/**
 * A ponte entre a `key` (que o plano guarda) e o editor. Adicionar um método novo é
 * escrever um adaptador e registrá-lo aqui — nenhuma tela precisa saber que ele existe.
 */
export const ANALYSIS_REGISTRY: { [K in AnalysisMethodKey]: Adaptador<K> } = {
  five_whys: {
    Component: CincoPorques,
    dataVazio: () => ({ whys: [] }),
    resumo: (d) =>
      d.whys?.length ? contar(d.whys.length, "porquê", "porquês") : "",
  },
  ishikawa: {
    Component: Ishikawa,
    dataVazio: () => ({ causes: [], whys: [] }),
    resumo: (d) => {
      const partes: string[] = [];
      if (d.causes?.length) {
        const categorias = new Set(d.causes.map((c) => c.category));
        partes.push(
          `${contar(d.causes.length, "causa", "causas")} em ${contar(categorias.size, "categoria", "categorias")}`,
        );
      }
      const selecionada = d.causes?.find((c) => c.id === d.selectedCauseId);
      if (selecionada?.text) {
        partes.push(
          `mais provável: ${ISHIKAWA_CATEGORY_LABELS[selecionada.category]} — ${selecionada.text}`,
        );
      }
      if (d.whys?.length)
        partes.push(contar(d.whys.length, "porquê", "porquês"));
      return partes.join(" · ");
    },
  },
  a3: {
    Component: A3,
    dataVazio: () => ({}),
    resumo: (d) => {
      const preenchidas = Object.values(d).filter(
        (v) => typeof v === "string" && v.trim(),
      ).length;
      return preenchidas
        ? `${contar(preenchidas, "seção preenchida", "seções preenchidas")} de ${A3_SECOES.length}`
        : "";
    },
  },
  fmea: {
    Component: Fmea,
    dataVazio: () => ({ rows: [] }),
    resumo: (d) => {
      if (!d.rows?.length) return "";
      const rpns = d.rows
        .map((r) => fmeaRpn(r))
        .filter((v): v is number => v != null);
      const base = contar(d.rows.length, "modo de falha", "modos de falha");
      return rpns.length ? `${base} · maior RPN ${Math.max(...rpns)}` : base;
    },
  },
  fault_tree: {
    Component: ArvoreFalhas,
    dataVazio: () => ({ nodes: [] }),
    resumo: (d) => {
      const total = contarNos(d.nodes ?? []);
      const partes: string[] = [];
      if (d.topEvent?.trim()) partes.push(d.topEvent.trim());
      if (total) partes.push(contar(total, "evento", "eventos"));
      return partes.join(" · ");
    },
  },
  kepner_tregoe: {
    Component: KepnerTregoe,
    // Nasce com as 4 linhas: a matriz É / NÃO É não é editável em estrutura.
    dataVazio: () => ({
      rows: KT_DIMENSIONS.map((dimension) => ({ dimension })),
      possibleCauses: [],
    }),
    resumo: (d) => {
      const preenchidas = (d.rows ?? []).filter(
        (r) =>
          r.is?.trim() ||
          r.isNot?.trim() ||
          r.distinction?.trim() ||
          r.change?.trim(),
      ).length;
      const partes: string[] = [];
      if (preenchidas)
        partes.push(`${preenchidas} de ${KT_DIMENSIONS.length} dimensões`);
      if (d.possibleCauses?.length)
        partes.push(
          contar(d.possibleCauses.length, "causa possível", "causas possíveis"),
        );
      const provavel = d.possibleCauses?.find(
        (c) => c.id === d.mostProbableCauseId,
      );
      if (provavel?.text) partes.push(`mais provável: ${provavel.text}`);
      return partes.join(" · ");
    },
  },
  rca_apollo: {
    Component: RcaApollo,
    dataVazio: () => ({ causes: [] }),
    resumo: (d) => {
      const total = contarNos(d.causes ?? []);
      const partes: string[] = [];
      if (d.primaryEffect?.trim()) partes.push(d.primaryEffect.trim());
      if (total) partes.push(contar(total, "causa", "causas"));
      return partes.join(" · ");
    },
  },
  barrier_analysis: {
    Component: Barreiras,
    dataVazio: () => ({ barriers: [] }),
    resumo: (d) => {
      if (!d.barriers?.length) return "";
      const falhas = d.barriers.filter(
        (b) => b.status && b.status !== "funcionou",
      ).length;
      const base = contar(d.barriers.length, "barreira", "barreiras");
      return falhas ? `${base} · ${falhas} falhou(ram)` : base;
    },
  },
};

/** Correlaciona o retorno com a chave recebida — `emptyAnalysisData("fmea")` devolve
 *  `FmeaData`, não a união larga dos 8. É o que faz o `switch` de quem consome ser
 *  verificado pelo compilador. */
export function emptyAnalysisData<K extends AnalysisMethodKey>(
  key: K,
): DataFor<K> {
  return ANALYSIS_REGISTRY[key].dataVazio();
}

/** Texto do card colapsado. "Não preenchida" quando o usuário só adicionou a tratativa. */
export function resumoAnalise(analysis: ActionPlanAnalysis): string {
  // O único cast do módulo, e ele é inevitável: o TS não estreita `registry[k].resumo` e
  // `analysis.data` para a MESMA chave num acesso dinâmico. Isolado aqui — em nenhum
  // adaptador, que continuam integralmente tipados.
  const adaptador = ANALYSIS_REGISTRY[analysis.key] as Adaptador<
    typeof analysis.key
  >;
  const texto = adaptador.resumo(analysis.data as DataFor<typeof analysis.key>);
  return texto || "Não preenchida";
}

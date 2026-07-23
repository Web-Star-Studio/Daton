import { describe, expect, it } from "vitest";
import {
  classUnitNames,
  formatClassUnitsLabel,
} from "@/pages/app/aprendizagem/_components/class-units";

const unit = (unitId: number, unitName: string | null) => ({
  unitId,
  unitName,
  responsibleUserId: null,
  responsibleUserName: null,
});

const orgUnits = new Map([
  [1, "PORTO ALEGRE"],
  [2, "CARIACICA"],
  [3, "DUQUE DE CAXIAS"],
]);

describe("formatClassUnitsLabel", () => {
  it("turma sem filial mostra travessão", () => {
    expect(formatClassUnitsLabel({ units: [] }, orgUnits).text).toBe("—");
    expect(formatClassUnitsLabel({}, orgUnits).text).toBe("—");
  });

  it("uma filial mostra o nome", () => {
    const label = formatClassUnitsLabel(
      { units: [unit(1, "PORTO ALEGRE")] },
      orgUnits,
    );
    expect(label.text).toBe("PORTO ALEGRE");
  });

  it("várias filiais resumem a contagem e listam os nomes no title", () => {
    const label = formatClassUnitsLabel(
      { units: [unit(1, "PORTO ALEGRE"), unit(2, "CARIACICA")] },
      orgUnits,
    );
    expect(label.text).toBe("2 filiais");
    expect(label.title).toBe("PORTO ALEGRE, CARIACICA");
  });

  it("cobrindo todas as filiais da org, diz 'Todas'", () => {
    const label = formatClassUnitsLabel(
      {
        units: [
          unit(1, "PORTO ALEGRE"),
          unit(2, "CARIACICA"),
          unit(3, "DUQUE DE CAXIAS"),
        ],
      },
      orgUnits,
    );
    expect(label.text).toBe("Todas as filiais (3)");
  });

  it("não afirma 'todas' quando as filiais da org ainda não carregaram", () => {
    // Mapa vazio acontece enquanto useListUnits está em voo; dizer
    // "Todas as filiais" nesse instante seria mentira.
    const label = formatClassUnitsLabel(
      { units: [unit(1, "PORTO ALEGRE"), unit(2, "CARIACICA")] },
      new Map(),
    );
    expect(label.text).toBe("2 filiais");
  });

  it("payload legado (só unitId, sem units) ainda mostra a filial", () => {
    // Turma vinda de cache antigo do React Query no momento do deploy.
    const label = formatClassUnitsLabel({ unitId: 2 }, orgUnits);
    expect(label.text).toBe("CARIACICA");
  });

  it("nome ausente cai para o id, em vez de sumir da lista", () => {
    expect(classUnitNames({ units: [unit(9, null)] }, orgUnits)).toEqual(["#9"]);
    expect(classUnitNames({ unitId: 9 }, orgUnits)).toEqual(["#9"]);
  });

  it("units preenchido tem precedência sobre o unitId legado", () => {
    const names = classUnitNames(
      { units: [unit(1, "PORTO ALEGRE"), unit(2, "CARIACICA")], unitId: 1 },
      orgUnits,
    );
    expect(names).toEqual(["PORTO ALEGRE", "CARIACICA"]);
  });
});

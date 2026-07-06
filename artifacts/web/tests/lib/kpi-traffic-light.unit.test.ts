import { getTrafficLight } from "@/lib/kpi-client";
import { describe, it, expect } from "vitest";
describe("getTrafficLight tolerância", () => {
  it("usa a tolerância informada", () => {
    expect(getTrafficLight(78, 80, "up", 5)).toBe("yellow"); // dentro de 5
    expect(getTrafficLight(78, 80, "up")).toBe("red");       // fora do 0.01 padrão
  });
});

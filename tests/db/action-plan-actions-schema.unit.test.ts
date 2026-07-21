import { describe, expect, it } from "vitest";
import { actionPlanActionsTable, actionPlansTable } from "@workspace/db";
import { getTableColumns } from "drizzle-orm";

describe("schema das ações do plano", () => {
  it("a tabela de ações tem o 5W2H, o responsável, o prazo e o status", () => {
    const cols = Object.keys(getTableColumns(actionPlanActionsTable));
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "organizationId",
        "actionPlanId",
        "what",
        "why",
        "whereAt",
        "how",
        "howTasks",
        "howMuch",
        "responsibleUserId",
        "dueDate",
        "status",
        "completedAt",
        "notes",
        "sortOrder",
      ]),
    );
  });

  it("não usa `where` como nome de coluna (palavra reservada em SQL)", () => {
    const cols = Object.keys(getTableColumns(actionPlanActionsTable));
    expect(cols).not.toContain("where");
  });

  it("o plano tem a coluna analyses", () => {
    const cols = Object.keys(getTableColumns(actionPlansTable));
    expect(cols).toContain("analyses");
  });
});

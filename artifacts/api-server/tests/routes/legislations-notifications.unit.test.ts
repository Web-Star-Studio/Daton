import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  selectMock,
  fromMock,
  whereSelectMock,
  updateMock,
  setUpdateMock,
  whereUpdateMock,
  returningUpdateMock,
  eqMock,
  andMock,
  ilikeMock,
  inArrayMock,
  notifyLegislationAddedMock,
  notifyLegislationUpdatedMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereSelectMock: vi.fn(),
  updateMock: vi.fn(),
  setUpdateMock: vi.fn(),
  whereUpdateMock: vi.fn(),
  returningUpdateMock: vi.fn(),
  eqMock: vi.fn((...args: unknown[]) => ({ kind: "eq", args })),
  andMock: vi.fn((...args: unknown[]) => ({ kind: "and", args })),
  ilikeMock: vi.fn((...args: unknown[]) => ({ kind: "ilike", args })),
  inArrayMock: vi.fn((...args: unknown[]) => ({ kind: "inArray", args })),
  notifyLegislationAddedMock: vi.fn(),
  notifyLegislationUpdatedMock: vi.fn(),
}));

vi.mock("../../src/middlewares/auth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = {
      userId: 1,
      organizationId: 1,
      role: "org_admin",
    };
    next();
  },
  requireWriteAccess: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next();
  },
  requireModuleAccess: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next();
  },
}));

vi.mock("../../src/lib/legislations", () => ({
  notifyLegislationAdded: notifyLegislationAddedMock,
  notifyLegislationUpdated: notifyLegislationUpdatedMock,
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: selectMock,
    update: updateMock,
  },
  legislationsTable: {
    id: "legislations.id",
    organizationId: "legislations.organization_id",
    title: "legislations.title",
    number: "legislations.number",
    tipoNorma: "legislations.tipo_norma",
    publicationDate: "legislations.publication_date",
  },
  unitLegislationsTable: {
    legislationId: "unit_legislations.legislation_id",
    unitId: "unit_legislations.unit_id",
  },
  unitsTable: {
    id: "units.id",
    organizationId: "units.organization_id",
  },
  unitComplianceTagsTable: {
    unitId: "unit_compliance_tags.unit_id",
    tag: "unit_compliance_tags.tag",
  },
}));

vi.mock("drizzle-orm", () => {
  const sqlMock = vi.fn((...args: unknown[]) => ({ kind: "sql", args }));
  sqlMock.join = vi.fn((...args: unknown[]) => ({ kind: "sql.join", args }));

  return {
    eq: eqMock,
    and: andMock,
    ilike: ilikeMock,
    inArray: inArrayMock,
    sql: sqlMock,
  };
});

import router from "../../src/routes/legislations";

describe("legislations notification hooks", () => {
  beforeEach(() => {
    selectMock.mockReset();
    fromMock.mockReset();
    whereSelectMock.mockReset();
    updateMock.mockReset();
    setUpdateMock.mockReset();
    whereUpdateMock.mockReset();
    returningUpdateMock.mockReset();
    eqMock.mockClear();
    andMock.mockClear();
    ilikeMock.mockClear();
    inArrayMock.mockClear();
    notifyLegislationAddedMock.mockReset();
    notifyLegislationUpdatedMock.mockReset();
    notifyLegislationAddedMock.mockResolvedValue(undefined);
    notifyLegislationUpdatedMock.mockResolvedValue(undefined);

    fromMock.mockReturnValue({ where: whereSelectMock });
    selectMock.mockReturnValue({ from: fromMock });
    whereUpdateMock.mockReturnValue({ returning: returningUpdateMock });
    setUpdateMock.mockReturnValue({ where: whereUpdateMock });
    updateMock.mockReturnValue({ set: setUpdateMock });
  });

  it("notifies when a relevant legislation is updated via PATCH", async () => {
    const existingLeg = {
      id: 10,
      organizationId: 1,
      title: "NR-17 Ergonomia",
      number: "NR 17",
      tipoNorma: "NR",
      tags: ["saude_trabalhador"],
    };
    const updatedLeg = {
      ...existingLeg,
      title: "NR-17 Ergonomia Revisada",
    };

    whereSelectMock.mockResolvedValue([existingLeg]);
    returningUpdateMock.mockResolvedValue([updatedLeg]);

    const app = express();
    app.use(express.json());
    app.use(router);

    const response = await request(app)
      .patch("/organizations/1/legislations/10")
      .send({ title: "NR-17 Ergonomia Revisada" });

    expect(response.status).toBe(200);
    expect(notifyLegislationUpdatedMock).toHaveBeenCalledWith(1, updatedLeg);
    expect(notifyLegislationAddedMock).not.toHaveBeenCalled();
  });

  it("notifies when an existing legislation is updated during import", async () => {
    const existingLeg = {
      id: 10,
      organizationId: 1,
      title: "NR-17 Ergonomia",
      number: "17",
      tipoNorma: "NR",
      tags: ["saude_trabalhador"],
    };
    const updatedLeg = {
      ...existingLeg,
      title: "NR-17 Ergonomia Atualizada",
    };

    whereSelectMock.mockResolvedValue([existingLeg]);
    returningUpdateMock.mockResolvedValue([updatedLeg]);

    const app = express();
    app.use(express.json());
    app.use(router);

    const response = await request(app)
      .post("/organizations/1/legislations/import")
      .send({
        conflictStrategy: "update",
        legislations: [
          {
            title: "NR-17 Ergonomia Atualizada",
            tipoNorma: "NR",
            number: "17",
            level: "federal",
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(notifyLegislationUpdatedMock).toHaveBeenCalledWith(1, updatedLeg);
    expect(notifyLegislationAddedMock).not.toHaveBeenCalled();
  });
});

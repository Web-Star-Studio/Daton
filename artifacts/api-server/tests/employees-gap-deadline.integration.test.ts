import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  authHeader,
  cleanupTestContext,
  createEmployee,
  createPosition,
  createTestContext,
  createTestUser,
  type TestOrgContext,
} from "../../../tests/support/backend";

const contexts: TestOrgContext[] = [];

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((c) => cleanupTestContext(c)));
});

describe("POST/DELETE .../gaps/deadline — prazo de regularização", () => {
  it("escolaridade: cria o prazo, aparece no GET, e some (self-heal) quando o colaborador passa a atender", async () => {
    const context = await createTestContext({ seed: "gap-deadline-edu" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Auxiliar de Pessoal ${context.prefix}`,
      education: "Ensino Médio Completo",
    });
    const employee = await createEmployee(context, {
      name: `Ana ${context.prefix}`,
      position: position.name,
      education: "Fundamental Incompleto",
    });

    const set = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({ requirementType: "education", dueDate: "2026-08-01" });
    expect(set.status).toBe(200);
    expect(set.body.dueDate).toBe("2026-08-01");
    expect(set.body.resolvedAt).toBeNull();

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    expect(detail.status).toBe(200);
    expect(detail.body.educationDeadline?.dueDate).toBe("2026-08-01");
    expect(detail.body.educationDeadline?.resolvedAt).toBeNull();

    // Colaborador passa a atender — a PRÓXIMA leitura da ficha self-heala o
    // prazo (compose-on-read), sem job separado.
    const updateEmployee = await request(app)
      .patch(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context))
      .send({ education: "Ensino Médio Completo" });
    expect(updateEmployee.status).toBe(200);

    const detailAfter = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    expect(detailAfter.body.educationDeadline?.resolvedAt).not.toBeNull();
  });

  it("competência: prazo aparece na linha do requisito certo (deadline por requirement, não global), e não resolve sozinho enquanto o gap continuar aberto", async () => {
    const context = await createTestContext({ seed: "gap-deadline-comp" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });
    const competencyName = `Auditor Prazo ${context.prefix}`;
    const requirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({ competencyName, competencyType: "conhecimento", requiredLevel: 3 });
    expect(requirement.status).toBe(201);

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
    });

    // Atestado manual ABAIXO do requerido -> status genuinamente "gap" (não
    // "nao_classificado"), para exercitar de fato o caminho que o prazo
    // acompanha.
    const evidence = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/competency-requirement-evidence`,
      )
      .set(authHeader(context))
      .send({
        competencyName,
        competencyType: "conhecimento",
        requiredLevel: 3,
        acquiredLevel: 1,
        evidence: "Certificado parcial",
      });
    expect(evidence.status).toBe(201);

    const set = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({
        requirementType: "competency",
        competencyName,
        competencyType: "conhecimento",
        dueDate: "2026-09-15",
      });
    expect(set.status).toBe(200);

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    const row = (
      detail.body.competencyConformance.requirements as {
        competencyName: string;
        status: string;
        deadline: { dueDate: string; overdue: boolean; resolvedAt: string | null } | null;
      }[]
    ).find((r) => r.competencyName === competencyName);
    expect(row?.status).toBe("gap");
    expect(row?.deadline?.dueDate).toBe("2026-09-15");
    expect(row?.deadline?.overdue).toBe(false);
    expect(row?.deadline?.resolvedAt).toBeNull();
  });

  // Achado do revisor: resolver o prazo por "status !== gap" apagava o prazo
  // por engano sempre que a leitura ficasse ambígua (nao_classificado, ou o
  // cargo deixa de casar por nome). A regra correta é resolver só por
  // confirmação POSITIVA de "atende" — nao_classificado mantém o prazo
  // aberto, porque o sistema não sabe se o requisito foi atendido.
  it("competência nao_classificado (sem atestado manual, sem treino provável) mantém o prazo aberto — não resolve por incerteza", async () => {
    const context = await createTestContext({
      seed: "gap-deadline-nao-classificado",
    });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
    });
    const competencyName = `Auditor Sem Atestado ${context.prefix}`;
    const requirement = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/positions/${position.id}/competency-requirements`,
      )
      .set(authHeader(context))
      .send({ competencyName, competencyType: "conhecimento", requiredLevel: 3 });
    expect(requirement.status).toBe(201);

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
    });

    // Prazo definido via API diretamente (a UI não oferece essa ação numa
    // linha nao_classificado) — cobre o cenário do revisor onde o backend
    // precisa se comportar bem mesmo sem a UI mediar.
    const set = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({
        requirementType: "competency",
        competencyName,
        competencyType: "conhecimento",
        dueDate: "2026-09-15",
      });
    expect(set.status).toBe(200);

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    const row = (
      detail.body.competencyConformance.requirements as {
        competencyName: string;
        status: string;
        deadline: { resolvedAt: string | null } | null;
      }[]
    ).find((r) => r.competencyName === competencyName);
    expect(row?.status).toBe("nao_classificado");
    expect(row?.deadline?.resolvedAt).toBeNull();
  });

  it("cargo deixa de casar por nome (posição renomeada): prazos existentes NÃO são resolvidos por engano", async () => {
    const context = await createTestContext({
      seed: "gap-deadline-position-mismatch",
    });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Auxiliar de Pessoal ${context.prefix}`,
      education: "Ensino Médio Completo",
    });
    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
      education: "Fundamental Incompleto",
    });

    const set = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({ requirementType: "education", dueDate: "2026-09-15" });
    expect(set.status).toBe(200);

    // Cargo renomeado -> employee.position (texto livre) não bate mais com
    // nenhum position.name cadastrado -> resolvedConformance vira null.
    const renamePosition = await request(app)
      .patch(
        `/api/organizations/${context.organizationId}/positions/${position.id}`,
      )
      .set(authHeader(context))
      .send({ name: `Auxiliar de Pessoal Renomeado ${context.prefix}` });
    expect(renamePosition.status).toBe(200);

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    // Sem cargo casado, a ficha não devolve competencyConformance nem
    // recalcula escolaridade — mas o prazo já existente continua intacto,
    // não resolvido por engano.
    expect(detail.body.competencyConformance).toBeNull();
    expect(detail.body.educationDeadline?.resolvedAt).toBeNull();
    expect(detail.body.educationDeadline?.dueDate).toBe("2026-09-15");
  });

  it("prazo vencido e não atendido -> overdue: true", async () => {
    const context = await createTestContext({ seed: "gap-deadline-overdue" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
      education: "Superior Completo",
    });
    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
      education: "Médio Completo",
    });

    const set = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({ requirementType: "education", dueDate: "2020-01-01" });
    expect(set.status).toBe(200);
    expect(set.body.overdue).toBe(true);

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    expect(detail.body.educationDeadline?.overdue).toBe(true);
    expect(detail.body.educationDeadline?.resolvedAt).toBeNull();
  });

  it("DELETE remove o prazo", async () => {
    const context = await createTestContext({ seed: "gap-deadline-delete" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
      education: "Superior Completo",
    });
    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
      education: "Médio Completo",
    });

    await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({ requirementType: "education", dueDate: "2026-12-01" });

    const del = await request(app)
      .delete(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .query({ requirementType: "education" })
      .set(authHeader(context));
    expect(del.status).toBe(204);

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    expect(detail.body.educationDeadline).toBeNull();
  });

  it("reenviar o POST com nova data reabre um prazo já resolvido/vencido (upsert, não duplica)", async () => {
    const context = await createTestContext({ seed: "gap-deadline-upsert" });
    contexts.push(context);

    const position = await createPosition(context, {
      name: `Cargo ${context.prefix}`,
      education: "Superior Completo",
    });
    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
      position: position.name,
      education: "Médio Completo",
    });

    const first = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({ requirementType: "education", dueDate: "2026-01-01" });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({ requirementType: "education", dueDate: "2027-01-01" });
    expect(second.status).toBe(200);
    expect(second.body.dueDate).toBe("2027-01-01");

    const detail = await request(app)
      .get(`/api/organizations/${context.organizationId}/employees/${employee.id}`)
      .set(authHeader(context));
    expect(detail.body.educationDeadline?.dueDate).toBe("2027-01-01");
  });

  it("competência sem competencyName/competencyType -> 400", async () => {
    const context = await createTestContext({ seed: "gap-deadline-400" });
    contexts.push(context);

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
    });

    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set(authHeader(context))
      .send({ requirementType: "competency", dueDate: "2026-08-01" });

    expect(response.status).toBe(400);
  });

  it("analyst não pode definir prazo (403)", async () => {
    const context = await createTestContext({ seed: "gap-deadline-403" });
    contexts.push(context);

    const employee = await createEmployee(context, {
      name: `Colaborador ${context.prefix}`,
    });
    const analyst = await createTestUser(context, { role: "analyst" });

    const response = await request(app)
      .post(
        `/api/organizations/${context.organizationId}/employees/${employee.id}/gaps/deadline`,
      )
      .set({ Authorization: `Bearer ${analyst.token}` })
      .send({ requirementType: "education", dueDate: "2026-08-01" });

    expect(response.status).toBe(403);
  });
});

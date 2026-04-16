import {
  db,
  organizationsTable,
  usersTable,
  userModulePermissionsTable,
  unitsTable,
  departmentsTable,
  positionsTable,
  employeesTable,
  employeeProfileItemsTable,
  employeeProfileItemAttachmentsTable,
  employeeCompetenciesTable,
  employeeTrainingsTable,
  employeeAwarenessTable,
  employeeUnitsTable,
  legislationsTable,
  unitLegislationsTable,
  evidenceAttachmentsTable,
  documentsTable,
  documentUnitsTable,
  documentElaboratorsTable,
  documentApproversTable,
  documentRecipientsTable,
  documentReferencesTable,
  documentAttachmentsTable,
  documentVersionsTable,
  conversations,
  messages,
  questionnaireThemesTable,
  questionnaireQuestionsTable,
  unitQuestionnaireResponsesTable,
  unitComplianceTagsTable,
  notificationsTable,
  invitationsTable,
  strategicPlansTable,
  strategicPlanSwotItemsTable,
  strategicPlanInterestedPartiesTable,
  strategicPlanObjectivesTable,
  strategicPlanActionsTable,
  strategicPlanActionUnitsTable,
  strategicPlanRevisionsTable,
  productKnowledgeArticlesTable,
  productKnowledgeArticleRevisionsTable,
  sgqProcessesTable,
  organizationContactsTable,
  serviceExecutionModelsTable,
  serviceExecutionModelCheckpointsTable,
  serviceExecutionCyclesTable,
  serviceExecutionCycleCheckpointsTable,
  serviceReleaseRecordsTable,
  serviceNonconformingOutputsTable,
  serviceThirdPartyPropertiesTable,
  servicePostDeliveryEventsTable,
  servicePreservationDeliveryRecordsTable,
  serviceSpecialValidationProfilesTable,
  serviceSpecialValidationEventsTable,
  developmentProjectsTable,
  developmentProjectInputsTable,
  developmentProjectStagesTable,
  developmentProjectOutputsTable,
  developmentProjectReviewsTable,
  developmentProjectChangesTable,
  requirementApplicabilityDecisionsTable,
} from "@workspace/db";
import { eq, inArray, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";

type SeedDatabase = Pick<typeof db, "select" | "delete">;

const DEMO_ORGANIZATION_LEGAL_IDENTIFIER = "12.345.678/0001-90";
const DEMO_ACCOUNT_EMAILS = [
  "admin@example.com",
  "ana@example.com",
  "pedro@example.com",
  "mariana@example.com",
  // Legacy demo addresses kept for idempotent cleanup across older seeds.
  "admin@demo.com",
  "ana@demo.com",
  "pedro@demo.com",
  "mariana@demo.com",
];
const DEMO_INVITATION_EMAILS = [
  "novo.auditor@example.com",
  "consultor.externo@example.com",
  // Legacy invitation addresses kept for idempotent cleanup across older seeds.
  "novo.auditor@email.com",
  "consultor.externo@email.com",
];
const DEMO_QUESTION_THEME_CODES = ["ENV", "SST", "QMS"];
const DEMO_QUESTION_CODES = [
  "ENV-01",
  "ENV-02",
  "ENV-03",
  "SST-01",
  "SST-02",
  "QMS-01",
  "QMS-02",
];
const DEMO_ARTICLE_SLUGS = [
  "como-funciona-controle-documentos",
  "gestao-legislacoes-compliance",
  "planejamento-estrategico-iso9001",
];

function mapByKey<K, V>(entries: ReadonlyArray<readonly [K, V]>): Map<K, V> {
  return new Map(entries);
}

function getRequired<K, V>(map: Map<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (!value) {
    throw new Error(`Missing seeded ${label}: ${String(key)}`);
  }
  return value;
}

function buildArticleChecksum(payload: {
  title: string;
  summary: string;
  bodyMarkdown: string;
  status: "draft" | "published" | "archived";
  version: number;
  publishedAt?: Date;
}): string {
  return crypto
    .createHash("md5")
    .update(
      JSON.stringify({
        title: payload.title,
        summary: payload.summary,
        bodyMarkdown: payload.bodyMarkdown,
        status: payload.status,
        version: payload.version,
        publishedAt: payload.publishedAt?.toISOString() ?? null,
      }),
    )
    .digest("hex");
}

async function resetDemoSeedState(db: SeedDatabase) {
  const existingOrgs = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(
      eq(
        organizationsTable.legalIdentifier,
        DEMO_ORGANIZATION_LEGAL_IDENTIFIER,
      ),
    );

  const existingUsers = await db
    .select({ id: usersTable.id, organizationId: usersTable.organizationId })
    .from(usersTable)
    .where(inArray(usersTable.email, DEMO_ACCOUNT_EMAILS));

  const orgIds = Array.from(
    new Set([
      ...existingOrgs.map((org) => org.id),
      ...existingUsers.map((user) => user.organizationId),
    ]),
  );

  const existingArticles = await db
    .select({ id: productKnowledgeArticlesTable.id })
    .from(productKnowledgeArticlesTable)
    .where(inArray(productKnowledgeArticlesTable.slug, DEMO_ARTICLE_SLUGS));

  if (existingArticles.length > 0) {
    await db.delete(productKnowledgeArticlesTable).where(
      inArray(
        productKnowledgeArticlesTable.id,
        existingArticles.map((article) => article.id),
      ),
    );
  }

  await db
    .delete(questionnaireQuestionsTable)
    .where(inArray(questionnaireQuestionsTable.code, DEMO_QUESTION_CODES));
  await db
    .delete(questionnaireThemesTable)
    .where(inArray(questionnaireThemesTable.code, DEMO_QUESTION_THEME_CODES));

  if (orgIds.length === 0) {
    return;
  }

  const users = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.organizationId, orgIds));
  const userIds = users.map((user) => user.id);

  const documents = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(inArray(documentsTable.organizationId, orgIds));
  const documentIds = documents.map((document) => document.id);

  const plans = await db
    .select({ id: strategicPlansTable.id })
    .from(strategicPlansTable)
    .where(inArray(strategicPlansTable.organizationId, orgIds));
  const planIds = plans.map((plan) => plan.id);

  const legislations = await db
    .select({ id: legislationsTable.id })
    .from(legislationsTable)
    .where(inArray(legislationsTable.organizationId, orgIds));
  const legislationIds = legislations.map((legislation) => legislation.id);

  await db
    .delete(notificationsTable)
    .where(inArray(notificationsTable.organizationId, orgIds));
  await db
    .delete(invitationsTable)
    .where(
      or(
        inArray(invitationsTable.organizationId, orgIds),
        inArray(invitationsTable.email, DEMO_INVITATION_EMAILS),
      ),
    );

  if (documentIds.length > 0) {
    await db
      .delete(documentReferencesTable)
      .where(
        or(
          inArray(documentReferencesTable.documentId, documentIds),
          inArray(documentReferencesTable.referencedDocumentId, documentIds),
        ),
      );
    await db
      .delete(documentsTable)
      .where(inArray(documentsTable.id, documentIds));
  }

  if (planIds.length > 0) {
    await db
      .delete(strategicPlansTable)
      .where(inArray(strategicPlansTable.id, planIds));
  }

  if (legislationIds.length > 0) {
    await db
      .delete(legislationsTable)
      .where(inArray(legislationsTable.id, legislationIds));
  }

  // Ciclo E — service execution (cascade deletes most children, but models/processes need explicit cleanup)
  await db
    .delete(serviceExecutionCyclesTable)
    .where(inArray(serviceExecutionCyclesTable.organizationId, orgIds));
  await db
    .delete(serviceNonconformingOutputsTable)
    .where(inArray(serviceNonconformingOutputsTable.organizationId, orgIds));
  await db
    .delete(serviceThirdPartyPropertiesTable)
    .where(inArray(serviceThirdPartyPropertiesTable.organizationId, orgIds));
  await db
    .delete(servicePostDeliveryEventsTable)
    .where(inArray(servicePostDeliveryEventsTable.organizationId, orgIds));
  await db
    .delete(servicePreservationDeliveryRecordsTable)
    .where(inArray(servicePreservationDeliveryRecordsTable.organizationId, orgIds));
  await db
    .delete(serviceExecutionModelsTable)
    .where(inArray(serviceExecutionModelsTable.organizationId, orgIds));
  await db
    .delete(sgqProcessesTable)
    .where(inArray(sgqProcessesTable.organizationId, orgIds));
  await db
    .delete(organizationContactsTable)
    .where(inArray(organizationContactsTable.organizationId, orgIds));

  await db
    .delete(departmentsTable)
    .where(inArray(departmentsTable.organizationId, orgIds));
  await db
    .delete(positionsTable)
    .where(inArray(positionsTable.organizationId, orgIds));
  await db
    .delete(employeesTable)
    .where(inArray(employeesTable.organizationId, orgIds));
  await db.delete(unitsTable).where(inArray(unitsTable.organizationId, orgIds));
  await db
    .delete(conversations)
    .where(inArray(conversations.organizationId, orgIds));

  if (userIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }

  await db
    .delete(organizationsTable)
    .where(inArray(organizationsTable.id, orgIds));
}

async function seed() {
  if (process.env.SEED_DEMO !== "true") {
    throw new Error(
      "Seed demo data is disabled. Set SEED_DEMO=true to run scripts/src/seed.ts.",
    );
  }

  return db.transaction(async (db) => {
    console.log("🌱 Seeding database with comprehensive demo data...\n");
    await resetDemoSeedState(db);

    // ─── 1. Organization ─────────────────────────────────────────────────────────
    const [org] = await db
      .insert(organizationsTable)
      .values({
        name: "Empresa Demo LTDA",
        tradeName: "Daton Demo",
        legalIdentifier: DEMO_ORGANIZATION_LEGAL_IDENTIFIER,
        openingDate: "2018-03-15",
        taxRegime: "Lucro Presumido",
        primaryCnae: "62.01-5-01",
        stateRegistration: "123.456.789.012",
        municipalRegistration: "987654",
        statusOperacional: "ativa",
        onboardingStatus: "completed",
        onboardingData: {
          companyProfile: {
            sector: "manufacturing",
            customSector: null,
            size: "medium",
            goals: ["quality", "compliance", "performance"],
            maturityLevel: "intermediate",
            currentChallenges: [
              "Padronização de processos",
              "Gestão de documentos",
              "Conformidade legal",
            ],
          },
        },
        onboardingCompletedAt: new Date("2024-01-10"),
        authVersion: 1,
      })
      .returning();
    console.log(`✅ Organization: ${org.name} (id: ${org.id})`);

    // ─── 2. Users ─────────────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash("demo123", 10);

    const [adminUser] = await db
      .insert(usersTable)
      .values({
        name: "Carlos Silva",
        email: "admin@example.com",
        passwordHash,
        organizationId: org.id,
        role: "org_admin",
      })
      .returning();

    const [operatorUser] = await db
      .insert(usersTable)
      .values({
        name: "Ana Oliveira",
        email: "ana@example.com",
        passwordHash,
        organizationId: org.id,
        role: "operator",
      })
      .returning();

    const [analystUser] = await db
      .insert(usersTable)
      .values({
        name: "Pedro Santos",
        email: "pedro@example.com",
        passwordHash,
        organizationId: org.id,
        role: "analyst",
      })
      .returning();

    const [operator2User] = await db
      .insert(usersTable)
      .values({
        name: "Mariana Costa",
        email: "mariana@example.com",
        passwordHash,
        organizationId: org.id,
        role: "operator",
      })
      .returning();

    console.log(
      `✅ Users: ${adminUser.name}, ${operatorUser.name}, ${analystUser.name}, ${operator2User.name}`,
    );

    // ─── 3. User Module Permissions ───────────────────────────────────────────────
    const allModules = [
      "documents",
      "legislations",
      "employees",
      "units",
      "departments",
      "positions",
      "governance",
      "suppliers",
      "environmental",
    ];

    // Admin gets all modules
    for (const mod of allModules) {
      await db
        .insert(userModulePermissionsTable)
        .values({ userId: adminUser.id, module: mod });
    }
    // Operator gets documents, employees, units
    for (const mod of ["documents", "employees", "units"]) {
      await db
        .insert(userModulePermissionsTable)
        .values({ userId: operatorUser.id, module: mod });
    }
    // Analyst gets legislations, documents (read-only by role)
    for (const mod of ["legislations", "documents"]) {
      await db
        .insert(userModulePermissionsTable)
        .values({ userId: analystUser.id, module: mod });
    }
    // Operator2 gets departments, positions, employees
    for (const mod of ["departments", "positions", "employees"]) {
      await db
        .insert(userModulePermissionsTable)
        .values({ userId: operator2User.id, module: mod });
    }
    console.log(`✅ User module permissions assigned`);

    // ─── 4. Units ─────────────────────────────────────────────────────────────────
    const [sede] = await db
      .insert(unitsTable)
      .values({
        organizationId: org.id,
        name: "Sede Principal",
        code: "SEDE-SP",
        type: "sede",
        cnpj: "12.345.678/0001-90",
        status: "ativa",
        cep: "01310-100",
        address: "Av. Paulista, 1000",
        streetNumber: "1000",
        neighborhood: "Bela Vista",
        city: "São Paulo",
        state: "SP",
        country: "Brasil",
        phone: "(11) 3000-1000",
      })
      .returning();

    const [filialRJ] = await db
      .insert(unitsTable)
      .values({
        organizationId: org.id,
        name: "Filial Rio de Janeiro",
        code: "FIL-RJ",
        type: "filial",
        cnpj: "12.345.678/0002-71",
        status: "ativa",
        cep: "20040-020",
        address: "Rua da Assembleia, 50",
        streetNumber: "50",
        neighborhood: "Centro",
        city: "Rio de Janeiro",
        state: "RJ",
        country: "Brasil",
        phone: "(21) 3000-2000",
      })
      .returning();

    const [filialBH] = await db
      .insert(unitsTable)
      .values({
        organizationId: org.id,
        name: "Filial Belo Horizonte",
        code: "FIL-BH",
        type: "filial",
        cnpj: "12.345.678/0003-52",
        status: "ativa",
        cep: "30130-000",
        address: "Av. Afonso Pena, 1500",
        streetNumber: "1500",
        neighborhood: "Centro",
        city: "Belo Horizonte",
        state: "MG",
        country: "Brasil",
        phone: "(31) 3000-3000",
      })
      .returning();

    console.log(`✅ Units: ${sede.name}, ${filialRJ.name}, ${filialBH.name}`);

    // ─── 5. Departments ──────────────────────────────────────────────────────────
    const deptValues = [
      {
        name: "Qualidade",
        description:
          "Departamento responsável pelo Sistema de Gestão da Qualidade (SGQ) e melhoria contínua.",
      },
      {
        name: "Produção",
        description:
          "Responsável pela fabricação e controle de processos produtivos.",
      },
      {
        name: "Recursos Humanos",
        description:
          "Gestão de pessoas, recrutamento, treinamento e desenvolvimento.",
      },
      {
        name: "Administrativo / Financeiro",
        description: "Gestão financeira, contábil e administrativa.",
      },
      {
        name: "Comercial",
        description: "Vendas, relacionamento com clientes e pós-venda.",
      },
      {
        name: "Logística",
        description:
          "Armazenagem, expedição e gestão da cadeia de suprimentos.",
      },
      {
        name: "Manutenção",
        description:
          "Manutenção preventiva e corretiva de equipamentos e infraestrutura.",
      },
    ];
    const departments = [];
    for (const d of deptValues) {
      const [dept] = await db
        .insert(departmentsTable)
        .values({ ...d, organizationId: org.id })
        .returning();
      departments.push(dept);
    }
    console.log(`✅ Departments: ${departments.length} created`);

    // ─── 6. Positions ─────────────────────────────────────────────────────────────
    const posValues = [
      {
        name: "Gerente da Qualidade",
        description:
          "Responsável pela coordenação do SGQ e auditorias internas.",
        education: "Ensino Superior em Engenharia ou Administração",
        experience: "5 anos em gestão da qualidade",
        requirements:
          "Certificação ISO 9001 Lead Auditor\nConhecimento de ferramentas da qualidade (PDCA, FMEA, 5W2H)",
        responsibilities:
          "Coordenar auditorias internas\nGerenciar não conformidades\nRelatar desempenho do SGQ à alta direção",
      },
      {
        name: "Analista da Qualidade",
        description: "Apoio na manutenção e melhoria do SGQ.",
        education: "Ensino Superior em andamento ou concluído",
        experience: "2 anos em área da qualidade",
        requirements:
          "Conhecimento em normas ISO 9001:2015\nDomínio de Excel avançado",
        responsibilities:
          "Controlar documentos do SGQ\nAcompanhar indicadores de qualidade\nConduzir inspeções",
      },
      {
        name: "Supervisor de Produção",
        description:
          "Supervisiona as atividades de produção e garante conformidade com padrões.",
        education: "Ensino Técnico ou Superior em Engenharia",
        experience: "3 anos em produção industrial",
        requirements:
          "Liderança de equipe\nConhecimento de processos produtivos",
        responsibilities:
          "Supervisionar equipe de produção\nGarantir cumprimento de metas\nRelatar desvios de processo",
      },
      {
        name: "Técnico de Manutenção",
        description: "Execução de manutenção preventiva e corretiva.",
        education: "Ensino Técnico em Eletromecânica ou Mecatrônica",
        experience: "2 anos em manutenção industrial",
        requirements: "NR-10 e NR-12\nConhecimento em hidráulica e pneumática",
        responsibilities:
          "Executar planos de manutenção preventiva\nAtender chamados de manutenção corretiva\nManter registros de intervenção",
      },
      {
        name: "Analista de RH",
        description:
          "Responsável por processos de RH e desenvolvimento de pessoas.",
        education: "Ensino Superior em Administração ou Psicologia",
        experience: "2 anos em recursos humanos",
        requirements:
          "Conhecimento em legislação trabalhista\nExperiência com treinamento e desenvolvimento",
        responsibilities:
          "Conduzir processos seletivos\nElaborar planos de treinamento\nGerenciar documentação de funcionários",
      },
      {
        name: "Operador de Produção",
        description:
          "Operação de máquinas e equipamentos na linha de produção.",
        education: "Ensino Médio completo",
        experience: "1 ano em ambiente industrial",
        requirements:
          "Disponibilidade para turnos\nConhecimento básico de leitura de desenho técnico",
        responsibilities:
          "Operar máquinas conforme instruções de trabalho\nPreencher registros de produção\nReportar anomalias",
      },
    ];
    const positions = [];
    for (const p of posValues) {
      const [pos] = await db
        .insert(positionsTable)
        .values({ ...p, organizationId: org.id })
        .returning();
      positions.push(pos);
    }
    console.log(`✅ Positions: ${positions.length} created`);

    // ─── 7. Employees ─────────────────────────────────────────────────────────────
    const empValues = [
      {
        name: "Roberto Mendes",
        cpf: "111.222.333-44",
        email: "roberto@example.com",
        phone: "(11) 99000-1001",
        position: "Gerente da Qualidade",
        department: "Qualidade",
        contractType: "clt",
        admissionDate: "2019-02-01",
        status: "active",
        unitId: sede.id,
      },
      {
        name: "Juliana Ferreira",
        cpf: "222.333.444-55",
        email: "juliana@example.com",
        phone: "(11) 99000-1002",
        position: "Analista da Qualidade",
        department: "Qualidade",
        contractType: "clt",
        admissionDate: "2020-06-15",
        status: "active",
        unitId: sede.id,
      },
      {
        name: "Marcos Almeida",
        cpf: "333.444.555-66",
        email: "marcos@example.com",
        phone: "(21) 99000-2001",
        position: "Supervisor de Produção",
        department: "Produção",
        contractType: "clt",
        admissionDate: "2018-09-10",
        status: "active",
        unitId: filialRJ.id,
      },
      {
        name: "Fernanda Lima",
        cpf: "444.555.666-77",
        email: "fernanda@example.com",
        phone: "(11) 99000-1003",
        position: "Analista de RH",
        department: "Recursos Humanos",
        contractType: "clt",
        admissionDate: "2021-01-20",
        status: "active",
        unitId: sede.id,
      },
      {
        name: "Ricardo Souza",
        cpf: "555.666.777-88",
        email: "ricardo@example.com",
        phone: "(31) 99000-3001",
        position: "Técnico de Manutenção",
        department: "Manutenção",
        contractType: "clt",
        admissionDate: "2020-03-05",
        status: "active",
        unitId: filialBH.id,
      },
      {
        name: "Camila Nunes",
        cpf: "666.777.888-99",
        email: "camila@example.com",
        phone: "(21) 99000-2002",
        position: "Operador de Produção",
        department: "Produção",
        contractType: "clt",
        admissionDate: "2022-07-01",
        status: "active",
        unitId: filialRJ.id,
      },
      {
        name: "Lucas Rocha",
        cpf: "777.888.999-00",
        email: "lucas@example.com",
        phone: "(11) 99000-1004",
        position: "Operador de Produção",
        department: "Produção",
        contractType: "temporario",
        admissionDate: "2024-01-15",
        terminationDate: "2024-12-31",
        status: "active",
        unitId: sede.id,
      },
      {
        name: "Patrícia Dias",
        cpf: "888.999.000-11",
        email: "patricia@example.com",
        phone: "(31) 99000-3002",
        position: "Analista da Qualidade",
        department: "Qualidade",
        contractType: "clt",
        admissionDate: "2017-04-22",
        terminationDate: "2024-06-30",
        status: "inactive",
        unitId: filialBH.id,
      },
    ];
    const employees = [];
    for (const e of empValues) {
      const [emp] = await db
        .insert(employeesTable)
        .values({ ...e, organizationId: org.id })
        .returning();
      employees.push(emp);
    }
    const employeeByCpf = mapByKey(
      employees.map((employee) => [employee.cpf ?? "", employee] as const),
    );
    const roberto = getRequired(
      employeeByCpf,
      "111.222.333-44",
      "employee by CPF",
    );
    const juliana = getRequired(
      employeeByCpf,
      "222.333.444-55",
      "employee by CPF",
    );
    const marcos = getRequired(
      employeeByCpf,
      "333.444.555-66",
      "employee by CPF",
    );
    const fernanda = getRequired(
      employeeByCpf,
      "444.555.666-77",
      "employee by CPF",
    );
    const ricardo = getRequired(
      employeeByCpf,
      "555.666.777-88",
      "employee by CPF",
    );
    const camila = getRequired(
      employeeByCpf,
      "666.777.888-99",
      "employee by CPF",
    );
    const lucas = getRequired(
      employeeByCpf,
      "777.888.999-00",
      "employee by CPF",
    );
    console.log(`✅ Employees: ${employees.length} created`);

    // ─── 8. Employee Units (secondary unit assignments) ───────────────────────────
    // Roberto (HQ) also works at RJ filial
    await db
      .insert(employeeUnitsTable)
      .values({ employeeId: roberto.id, unitId: filialRJ.id });
    // Juliana (HQ) also works at BH filial
    await db
      .insert(employeeUnitsTable)
      .values({ employeeId: juliana.id, unitId: filialBH.id });
    console.log(`✅ Employee unit assignments: 2 secondary assignments`);

    // ─── 9. Employee Profile Items ────────────────────────────────────────────────
    const profileItems = [
      {
        employeeId: roberto.id,
        category: "formacao",
        title: "MBA em Gestão da Qualidade",
        description: "Universidade de São Paulo (USP) — Concluído em 2018",
      },
      {
        employeeId: roberto.id,
        category: "formacao",
        title: "Engenharia de Produção",
        description:
          "Universidade Estadual de Campinas (UNICAMP) — Concluído em 2014",
      },
      {
        employeeId: roberto.id,
        category: "experiencia",
        title: "Coordenador da Qualidade — Indústria ABC",
        description:
          "2015 a 2019. Coordenação de auditorias e gestão de não conformidades.",
      },
      {
        employeeId: juliana.id,
        category: "formacao",
        title: "Administração de Empresas",
        description: "PUC-SP — Concluído em 2019",
      },
      {
        employeeId: juliana.id,
        category: "experiencia",
        title: "Estagiária de Qualidade — Fábrica XYZ",
        description: "2018 a 2020. Apoio em inspeções e controle documental.",
      },
      {
        employeeId: marcos.id,
        category: "formacao",
        title: "Engenharia Mecânica",
        description: "UFRJ — Concluído em 2015",
      },
      {
        employeeId: fernanda.id,
        category: "formacao",
        title: "Psicologia Organizacional",
        description: "Universidade Mackenzie — Concluído em 2020",
      },
      {
        employeeId: ricardo.id,
        category: "formacao",
        title: "Técnico em Eletromecânica",
        description: "SENAI — Concluído em 2017",
      },
      {
        employeeId: ricardo.id,
        category: "certificacao",
        title: "NR-10 — Segurança em Instalações Elétricas",
        description: "Certificado válido até 2026-06-30",
      },
    ];
    const createdProfileItems = [];
    for (const pi of profileItems) {
      const [item] = await db
        .insert(employeeProfileItemsTable)
        .values(pi)
        .returning();
      createdProfileItems.push(item);
    }
    const profileItemByTitle = mapByKey(
      createdProfileItems.map((item) => [item.title, item] as const),
    );
    const mbaProfileItem = getRequired(
      profileItemByTitle,
      "MBA em Gestão da Qualidade",
      "profile item by title",
    );
    const nr10ProfileItem = getRequired(
      profileItemByTitle,
      "NR-10 — Segurança em Instalações Elétricas",
      "profile item by title",
    );
    console.log(
      `✅ Employee profile items: ${createdProfileItems.length} created`,
    );

    // ─── 10. Employee Profile Item Attachments (dummy references) ─────────────────
    await db.insert(employeeProfileItemAttachmentsTable).values({
      itemId: mbaProfileItem.id,
      fileName: "diploma_mba_qualidade.pdf",
      fileSize: 245000,
      contentType: "application/pdf",
      objectPath: "demo/employees/roberto/diploma_mba_qualidade.pdf",
    });
    await db.insert(employeeProfileItemAttachmentsTable).values({
      itemId: nr10ProfileItem.id,
      fileName: "certificado_nr10.pdf",
      fileSize: 180000,
      contentType: "application/pdf",
      objectPath: "demo/employees/ricardo/certificado_nr10.pdf",
    });
    console.log(`✅ Employee profile item attachments: 2 created`);

    // ─── 11. Employee Competencies ────────────────────────────────────────────────
    const competencies = [
      {
        employeeId: roberto.id,
        name: "Auditoria Interna ISO 9001",
        type: "formacao",
        requiredLevel: 5,
        acquiredLevel: 5,
        evidence: "Lead Auditor certificado IRCA",
        description: "Capacidade de conduzir auditorias internas do SGQ",
      },
      {
        employeeId: roberto.id,
        name: "Análise de Causa Raiz",
        type: "habilidade",
        requiredLevel: 4,
        acquiredLevel: 4,
        evidence: "Experiência em Ishikawa e 5 Porquês",
        description: "Ferramentas de análise de não conformidades",
      },
      {
        employeeId: juliana.id,
        name: "Controle de Documentos",
        type: "conhecimento",
        requiredLevel: 4,
        acquiredLevel: 3,
        evidence: "Treinamento interno concluído",
        description: "Gestão documental conforme requisitos ISO 9001",
      },
      {
        employeeId: juliana.id,
        name: "Metrologia Básica",
        type: "formacao",
        requiredLevel: 3,
        acquiredLevel: 2,
        evidence: "Curso SENAI em andamento",
        description: "Calibração e verificação de instrumentos",
      },
      {
        employeeId: marcos.id,
        name: "Gestão de Equipes",
        type: "habilidade",
        requiredLevel: 4,
        acquiredLevel: 4,
        evidence: "Supervisão de 15 operadores",
        description: "Liderança de equipes em ambiente fabril",
      },
      {
        employeeId: ricardo.id,
        name: "Manutenção Preventiva",
        type: "conhecimento",
        requiredLevel: 4,
        acquiredLevel: 4,
        evidence: "3 anos de experiência documentada",
        description:
          "Planejamento e execução de planos de manutenção preventiva",
      },
      {
        employeeId: ricardo.id,
        name: "NR-10 Segurança Elétrica",
        type: "formacao",
        requiredLevel: 3,
        acquiredLevel: 3,
        evidence: "Certificado NR-10 válido",
        description: "Segurança em instalações e serviços em eletricidade",
      },
      {
        employeeId: camila.id,
        name: "Operação de CNC",
        type: "habilidade",
        requiredLevel: 3,
        acquiredLevel: 2,
        evidence: "Treinamento on-the-job",
        description: "Operação de máquinas CNC",
      },
    ];
    for (const c of competencies) {
      await db.insert(employeeCompetenciesTable).values(c);
    }
    console.log(`✅ Employee competencies: ${competencies.length} created`);

    // ─── 12. Employee Trainings ───────────────────────────────────────────────────
    const trainings = [
      {
        employeeId: roberto.id,
        title: "Lead Auditor ISO 9001:2015",
        institution: "Bureau Veritas",
        workloadHours: 40,
        completionDate: "2022-09-15",
        expirationDate: "2025-09-15",
        status: "concluido",
        description:
          "Formação de auditor líder em sistemas de gestão da qualidade.",
      },
      {
        employeeId: roberto.id,
        title: "FMEA — Análise de Modos de Falha",
        institution: "IQA",
        workloadHours: 16,
        completionDate: "2023-03-20",
        status: "concluido",
        description: "Metodologia FMEA aplicada a processos industriais.",
      },
      {
        employeeId: juliana.id,
        title: "Formação em Auditor Interno ISO 9001",
        institution: "ABNT",
        workloadHours: 24,
        completionDate: "2024-05-10",
        expirationDate: "2027-05-10",
        status: "concluido",
        description: "Habilitação para conduzir auditorias internas do SGQ.",
      },
      {
        employeeId: juliana.id,
        title: "Excel Avançado para Qualidade",
        institution: "Udemy",
        workloadHours: 12,
        status: "em_andamento",
        description:
          "Dashboards e análise de dados para indicadores de qualidade.",
      },
      {
        employeeId: marcos.id,
        title: "Liderança e Gestão de Equipes",
        institution: "FGV Online",
        workloadHours: 30,
        completionDate: "2023-11-05",
        status: "concluido",
        description: "Desenvolvimento de habilidades de liderança.",
      },
      {
        employeeId: fernanda.id,
        title: "Gestão de Treinamento e Desenvolvimento",
        institution: "ABRH",
        workloadHours: 20,
        completionDate: "2024-02-28",
        status: "concluido",
        description: "Metodologias de T&D e avaliação de eficácia.",
      },
      {
        employeeId: ricardo.id,
        title: "NR-10 Reciclagem",
        institution: "SENAI",
        workloadHours: 8,
        completionDate: "2024-06-30",
        expirationDate: "2026-06-30",
        status: "concluido",
        description: "Reciclagem obrigatória da NR-10.",
      },
      {
        employeeId: camila.id,
        title: "Operação de CNC Básico",
        institution: "SENAI",
        workloadHours: 40,
        status: "pendente",
        description: "Treinamento programado para operação de máquinas CNC.",
      },
      {
        employeeId: lucas.id,
        title: "Integração — Segurança do Trabalho",
        institution: "Interno",
        workloadHours: 4,
        completionDate: "2024-01-15",
        status: "concluido",
        description: "Treinamento de integração para novos colaboradores.",
      },
    ];
    for (const t of trainings) {
      await db.insert(employeeTrainingsTable).values(t);
    }
    console.log(`✅ Employee trainings: ${trainings.length} created`);

    // ─── 13. Employee Awareness Records ───────────────────────────────────────────
    const awarenessRecords = [
      {
        employeeId: roberto.id,
        topic: "Política da Qualidade",
        description:
          "Apresentação da política da qualidade revisada para 2024.",
        date: "2024-02-01",
        verificationMethod: "Assinatura em lista de presença",
        result: "Satisfatório",
      },
      {
        employeeId: juliana.id,
        topic: "Política da Qualidade",
        description:
          "Apresentação da política da qualidade revisada para 2024.",
        date: "2024-02-01",
        verificationMethod: "Assinatura em lista de presença",
        result: "Satisfatório",
      },
      {
        employeeId: marcos.id,
        topic: "Objetivos da Qualidade 2024",
        description:
          "Comunicação dos objetivos e metas da qualidade para o ano.",
        date: "2024-01-15",
        verificationMethod: "Questionário online",
        result: "Satisfatório",
      },
      {
        employeeId: fernanda.id,
        topic: "LGPD — Proteção de Dados Pessoais",
        description:
          "Treinamento sobre tratamento de dados pessoais de colaboradores.",
        date: "2024-03-10",
        verificationMethod: "Avaliação escrita",
        result: "Satisfatório",
      },
      {
        employeeId: ricardo.id,
        topic: "Procedimentos de Emergência",
        description: "Simulado de evacuação e uso de extintores.",
        date: "2024-04-22",
        verificationMethod: "Participação em simulado",
        result: "Satisfatório",
      },
      {
        employeeId: camila.id,
        topic: "5S — Organização do Posto de Trabalho",
        description: "Palestra sobre metodologia 5S aplicada à produção.",
        date: "2024-05-10",
        verificationMethod: "Checklist de verificação",
        result: "Parcialmente satisfatório — necessita reforço",
      },
    ];
    for (const a of awarenessRecords) {
      await db.insert(employeeAwarenessTable).values(a);
    }
    console.log(
      `✅ Employee awareness records: ${awarenessRecords.length} created`,
    );

    // ─── 14. Legislations ─────────────────────────────────────────────────────────
    const legislationValues = [
      {
        title: "Política Nacional do Meio Ambiente",
        number: "Lei 6.938/1981",
        description:
          "Dispõe sobre a Política Nacional do Meio Ambiente, seus fins e mecanismos de formulação e aplicação.",
        tipoNorma: "Lei Federal",
        emissor: "Congresso Nacional",
        level: "federal",
        status: "vigente",
        macrotema: "Meio Ambiente",
        subtema: "Política Ambiental",
        applicability:
          "Todas as unidades com atividades potencialmente poluidoras",
        publicationDate: "1981-08-31",
        sourceUrl: "https://www.planalto.gov.br/ccivil_03/leis/l6938.htm",
        applicableArticles: "Art. 2°, Art. 4°, Art. 9°, Art. 10",
        reviewFrequencyDays: 365,
        tags: ["meio_ambiente", "licenciamento"],
      },
      {
        title: "Política Nacional de Resíduos Sólidos",
        number: "Lei 12.305/2010",
        description:
          "Institui a Política Nacional de Resíduos Sólidos; altera a Lei 9.605/1998.",
        tipoNorma: "Lei Federal",
        emissor: "Congresso Nacional",
        level: "federal",
        status: "vigente",
        macrotema: "Meio Ambiente",
        subtema: "Resíduos Sólidos",
        applicability: "Unidades que geram resíduos industriais",
        publicationDate: "2010-08-02",
        sourceUrl:
          "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm",
        applicableArticles: "Art. 3°, Art. 6°, Art. 9°, Art. 20, Art. 33",
        reviewFrequencyDays: 365,
        tags: ["meio_ambiente", "residuos"],
      },
      {
        title: "Dispõe sobre padrões de qualidade do ar",
        number: "Resolução CONAMA 491/2018",
        description:
          "Dispõe sobre padrões de qualidade do ar e dá outras providências.",
        tipoNorma: "Resolução",
        emissor: "CONAMA",
        level: "federal",
        status: "vigente",
        macrotema: "Meio Ambiente",
        subtema: "Qualidade do Ar",
        applicability: "Unidades com emissões atmosféricas",
        publicationDate: "2018-11-19",
        sourceUrl:
          "https://www.in.gov.br/materia/-/asset_publisher/Kujrw0TZC2Mb/content/id/51058895",
        applicableArticles: "Art. 3°, Art. 4°, Anexo I",
        reviewFrequencyDays: 180,
        tags: ["meio_ambiente", "emissoes"],
      },
      {
        title: "Licenciamento Ambiental",
        number: "Resolução CONAMA 237/1997",
        description:
          "Regulamenta os aspectos de licenciamento ambiental estabelecidos na Política Nacional do Meio Ambiente.",
        tipoNorma: "Resolução",
        emissor: "CONAMA",
        level: "federal",
        status: "vigente",
        macrotema: "Meio Ambiente",
        subtema: "Licenciamento",
        applicability: "Todas as unidades sujeitas a licenciamento ambiental",
        publicationDate: "1997-12-19",
        sourceUrl:
          "https://www.ibama.gov.br/sophia/cnia/legislacao/MMA/RE0237-191297.PDF",
        applicableArticles: "Art. 1°, Art. 2°, Art. 8°, Art. 10",
        reviewFrequencyDays: 365,
        tags: ["meio_ambiente", "licenciamento"],
      },
      {
        title: "Programa de Gerenciamento de Riscos",
        number: "NR-9 / Portaria 6.735/2020",
        description:
          "Avaliação e controle das exposições ocupacionais a agentes físicos, químicos e biológicos.",
        tipoNorma: "Norma Regulamentadora",
        emissor: "Ministério do Trabalho",
        level: "federal",
        status: "vigente",
        macrotema: "Saúde e Segurança",
        subtema: "Riscos Ocupacionais",
        applicability: "Todas as unidades com empregados CLT",
        publicationDate: "2020-03-12",
        sourceUrl: "https://www.gov.br/trabalho-e-emprego/pt-br",
        applicableArticles: "Item 9.1, Item 9.3, Item 9.5",
        reviewFrequencyDays: 365,
        tags: ["sst", "riscos"],
      },
      {
        title: "Política Estadual de Mudanças Climáticas",
        number: "Lei 13.798/2009 (SP)",
        description:
          "Institui a Política Estadual de Mudanças Climáticas do Estado de São Paulo.",
        tipoNorma: "Lei Estadual",
        emissor: "Assembleia Legislativa de SP",
        level: "estadual",
        status: "vigente",
        uf: "SP",
        macrotema: "Meio Ambiente",
        subtema: "Mudanças Climáticas",
        applicability: "Unidades no estado de São Paulo",
        publicationDate: "2009-11-09",
        sourceUrl:
          "https://www.al.sp.gov.br/repositorio/legislacao/lei/2009/lei-13798-09.11.2009.html",
        applicableArticles: "Art. 5°, Art. 6°, Art. 32",
        reviewFrequencyDays: 365,
        tags: ["meio_ambiente", "clima"],
      },
      {
        title: "Código de Posturas do Município de São Paulo",
        number: "Lei 13.725/2004",
        description: "Institui o Código Sanitário do Município de São Paulo.",
        tipoNorma: "Lei Municipal",
        emissor: "Câmara Municipal de São Paulo",
        level: "municipal",
        status: "vigente",
        uf: "SP",
        municipality: "São Paulo",
        macrotema: "Saúde Pública",
        subtema: "Código Sanitário",
        applicability: "Sede Principal (São Paulo)",
        publicationDate: "2004-01-09",
        applicableArticles: "Capítulo III, Seção II",
        reviewFrequencyDays: 730,
        tags: ["sanitario", "municipal"],
      },
      {
        title: "ISO 9001:2015 — Sistema de Gestão da Qualidade",
        number: "ISO 9001:2015",
        description:
          "Requisitos para um sistema de gestão da qualidade. Norma internacional para SGQ.",
        tipoNorma: "Norma Internacional",
        emissor: "ISO",
        level: "federal",
        status: "vigente",
        macrotema: "Qualidade",
        subtema: "SGQ",
        applicability: "Todas as unidades — base do sistema de gestão",
        publicationDate: "2015-09-15",
        sourceUrl: "https://www.iso.org/standard/62085.html",
        applicableArticles: "Cláusula 4, 5, 6, 7, 8, 9, 10",
        reviewFrequencyDays: 365,
        tags: ["qualidade", "sgq", "iso"],
      },
      {
        title: "ISO 14001:2015 — Sistema de Gestão Ambiental",
        number: "ISO 14001:2015",
        description:
          "Sistemas de gestão ambiental — Requisitos com orientações para uso.",
        tipoNorma: "Norma Internacional",
        emissor: "ISO",
        level: "federal",
        status: "vigente",
        macrotema: "Meio Ambiente",
        subtema: "SGA",
        applicability: "Todas as unidades — gestão ambiental integrada",
        publicationDate: "2015-09-15",
        sourceUrl: "https://www.iso.org/standard/60857.html",
        applicableArticles: "Cláusula 4, 5, 6, 7, 8, 9, 10",
        reviewFrequencyDays: 365,
        tags: ["meio_ambiente", "sga", "iso"],
      },
      {
        title: "NR-12 — Segurança no Trabalho em Máquinas e Equipamentos",
        number: "NR-12 / Portaria 916/2019",
        description:
          "Requisitos de segurança para máquinas e equipamentos nos locais de trabalho.",
        tipoNorma: "Norma Regulamentadora",
        emissor: "Ministério do Trabalho",
        level: "federal",
        status: "vigente",
        macrotema: "Saúde e Segurança",
        subtema: "Máquinas e Equipamentos",
        applicability: "Unidades com máquinas industriais",
        publicationDate: "2019-07-25",
        applicableArticles: "Item 12.1 a 12.5, Anexo VI",
        reviewFrequencyDays: 365,
        tags: ["sst", "maquinas"],
      },
    ];
    const createdLegs = [];
    for (const leg of legislationValues) {
      const [created] = await db
        .insert(legislationsTable)
        .values({
          ...leg,
          organizationId: org.id,
        })
        .returning();
      createdLegs.push(created);
    }
    const legislationByNumber = mapByKey(
      createdLegs.map(
        (legislation) =>
          [legislation.number ?? legislation.title, legislation] as const,
      ),
    );
    const lei6938 = getRequired(
      legislationByNumber,
      "Lei 6.938/1981",
      "legislation by number",
    );
    const lei12305 = getRequired(
      legislationByNumber,
      "Lei 12.305/2010",
      "legislation by number",
    );
    const conama491 = getRequired(
      legislationByNumber,
      "Resolução CONAMA 491/2018",
      "legislation by number",
    );
    const conama237 = getRequired(
      legislationByNumber,
      "Resolução CONAMA 237/1997",
      "legislation by number",
    );
    const nr9 = getRequired(
      legislationByNumber,
      "NR-9 / Portaria 6.735/2020",
      "legislation by number",
    );
    const lei13798 = getRequired(
      legislationByNumber,
      "Lei 13.798/2009 (SP)",
      "legislation by number",
    );
    const lei13725 = getRequired(
      legislationByNumber,
      "Lei 13.725/2004",
      "legislation by number",
    );
    const iso9001 = getRequired(
      legislationByNumber,
      "ISO 9001:2015",
      "legislation by number",
    );
    const iso14001 = getRequired(
      legislationByNumber,
      "ISO 14001:2015",
      "legislation by number",
    );
    const nr12 = getRequired(
      legislationByNumber,
      "NR-12 / Portaria 916/2019",
      "legislation by number",
    );
    console.log(`✅ Legislations: ${createdLegs.length} created`);

    // ─── 15. Unit-Legislation Assignments ─────────────────────────────────────────
    const assignments = [
      // Sede — all legislations apply
      {
        unitId: sede.id,
        legislationId: lei6938.id,
        complianceStatus: "conforme",
        notes: "Licença ambiental em dia. Última renovação: Jan/2024.",
      },
      {
        unitId: sede.id,
        legislationId: lei12305.id,
        complianceStatus: "parcialmente_conforme",
        notes: "Plano de gerenciamento de resíduos em elaboração.",
      },
      {
        unitId: sede.id,
        legislationId: conama491.id,
        complianceStatus: "conforme",
        notes: "Monitoramento realizado trimestralmente.",
      },
      {
        unitId: sede.id,
        legislationId: conama237.id,
        complianceStatus: "conforme",
        notes: "Licença de operação vigente até 2026.",
      },
      {
        unitId: sede.id,
        legislationId: nr9.id,
        complianceStatus: "conforme",
        notes: "PGR atualizado em 2024.",
      },
      {
        unitId: sede.id,
        legislationId: lei13798.id,
        complianceStatus: "conforme",
        notes: "Relatório de emissões entregue ao estado.",
      },
      {
        unitId: sede.id,
        legislationId: lei13725.id,
        complianceStatus: "conforme",
        notes: "Alvará sanitário vigente.",
      },
      {
        unitId: sede.id,
        legislationId: iso9001.id,
        complianceStatus: "conforme",
        notes: "Certificação ISO 9001 válida até 2026-12.",
      },
      {
        unitId: sede.id,
        legislationId: iso14001.id,
        complianceStatus: "parcialmente_conforme",
        notes: "Certificação ISO 14001 em andamento.",
      },
      {
        unitId: sede.id,
        legislationId: nr12.id,
        complianceStatus: "conforme",
        notes: "Máquinas adequadas conforme laudo técnico.",
      },
      // Filial RJ
      {
        unitId: filialRJ.id,
        legislationId: lei6938.id,
        complianceStatus: "nao_avaliado",
      },
      {
        unitId: filialRJ.id,
        legislationId: lei12305.id,
        complianceStatus: "nao_conforme",
        notes: "Aguardando implementação do plano de resíduos.",
      },
      {
        unitId: filialRJ.id,
        legislationId: nr9.id,
        complianceStatus: "conforme",
        notes: "PGR implementado.",
      },
      {
        unitId: filialRJ.id,
        legislationId: iso9001.id,
        complianceStatus: "conforme",
        notes: "Escopo da certificação inclui filial.",
      },
      {
        unitId: filialRJ.id,
        legislationId: nr12.id,
        complianceStatus: "parcialmente_conforme",
        notes: "Adequação de 2 máquinas pendente.",
      },
      // Filial BH
      {
        unitId: filialBH.id,
        legislationId: lei6938.id,
        complianceStatus: "conforme",
        notes: "Licença ambiental vigente.",
      },
      {
        unitId: filialBH.id,
        legislationId: conama237.id,
        complianceStatus: "nao_avaliado",
      },
      {
        unitId: filialBH.id,
        legislationId: nr9.id,
        complianceStatus: "conforme",
        notes: "PGR implementado.",
      },
      {
        unitId: filialBH.id,
        legislationId: iso9001.id,
        complianceStatus: "conforme",
        notes: "Escopo da certificação inclui filial.",
      },
    ];
    const createdUnitLegs = [];
    for (const a of assignments) {
      const [ul] = await db
        .insert(unitLegislationsTable)
        .values({
          ...a,
          evaluatedAt:
            a.complianceStatus !== "nao_avaliado" ? new Date() : null,
        })
        .returning();
      createdUnitLegs.push(ul);
    }
    const unitLegislationByKey = mapByKey(
      createdUnitLegs.map(
        (item) => [`${item.unitId}:${item.legislationId}`, item] as const,
      ),
    );
    console.log(
      `✅ Unit-legislation assignments: ${createdUnitLegs.length} created`,
    );

    // ─── 16. Evidence Attachments ─────────────────────────────────────────────────
    // Attach evidence to a couple of compliant unit-legislations
    await db.insert(evidenceAttachmentsTable).values({
      unitLegislationId: getRequired(
        unitLegislationByKey,
        `${sede.id}:${lei6938.id}`,
        "unit legislation by key",
      ).id,
      fileName: "licenca_ambiental_sede_2024.pdf",
      fileSize: 520000,
      contentType: "application/pdf",
      objectPath: "demo/evidence/licenca_ambiental_sede_2024.pdf",
    });
    await db.insert(evidenceAttachmentsTable).values({
      unitLegislationId: getRequired(
        unitLegislationByKey,
        `${sede.id}:${iso9001.id}`,
        "unit legislation by key",
      ).id,
      fileName: "certificado_iso9001_2024.pdf",
      fileSize: 340000,
      contentType: "application/pdf",
      objectPath: "demo/evidence/certificado_iso9001_2024.pdf",
    });
    await db.insert(evidenceAttachmentsTable).values({
      unitLegislationId: getRequired(
        unitLegislationByKey,
        `${sede.id}:${nr9.id}`,
        "unit legislation by key",
      ).id,
      fileName: "pgr_sede_2024.pdf",
      fileSize: 890000,
      contentType: "application/pdf",
      objectPath: "demo/evidence/pgr_sede_2024.pdf",
    });
    console.log(`✅ Evidence attachments: 3 created`);

    // ─── 17. Documents ────────────────────────────────────────────────────────────
    const docValues = [
      {
        title: "Manual da Qualidade",
        type: "manual",
        status: "published",
        currentVersion: 3,
        validityDate: "2026-12-31",
      },
      {
        title: "Procedimento de Controle de Documentos",
        type: "procedimento",
        status: "published",
        currentVersion: 2,
        validityDate: "2025-12-31",
      },
      {
        title: "Procedimento de Auditoria Interna",
        type: "procedimento",
        status: "published",
        currentVersion: 1,
        validityDate: "2025-06-30",
      },
      {
        title: "Instrução de Trabalho — Inspeção de Recebimento",
        type: "instrucao",
        status: "published",
        currentVersion: 1,
        validityDate: "2025-12-31",
      },
      {
        title: "Política da Qualidade",
        type: "politica",
        status: "published",
        currentVersion: 2,
        validityDate: "2026-12-31",
      },
      {
        title: "Procedimento de Ação Corretiva",
        type: "procedimento",
        status: "draft",
        currentVersion: 1,
      },
      {
        title: "Plano de Gerenciamento de Resíduos",
        type: "plano",
        status: "draft",
        currentVersion: 1,
      },
      {
        title: "Registro de Treinamento — Integração 2024",
        type: "registro",
        status: "published",
        currentVersion: 1,
        validityDate: "2024-12-31",
      },
    ];
    const docs = [];
    for (const d of docValues) {
      const [doc] = await db
        .insert(documentsTable)
        .values({
          ...d,
          organizationId: org.id,
          createdById: adminUser.id,
        })
        .returning();
      docs.push(doc);
    }
    const documentByTitle = mapByKey(
      docs.map((document) => [document.title, document] as const),
    );
    const manualQualidade = getRequired(
      documentByTitle,
      "Manual da Qualidade",
      "document by title",
    );
    const procedimentoControleDocumentos = getRequired(
      documentByTitle,
      "Procedimento de Controle de Documentos",
      "document by title",
    );
    const procedimentoAuditoriaInterna = getRequired(
      documentByTitle,
      "Procedimento de Auditoria Interna",
      "document by title",
    );
    const instrucaoInspecaoRecebimento = getRequired(
      documentByTitle,
      "Instrução de Trabalho — Inspeção de Recebimento",
      "document by title",
    );
    const politicaQualidade = getRequired(
      documentByTitle,
      "Política da Qualidade",
      "document by title",
    );
    const procedimentoAcaoCorretiva = getRequired(
      documentByTitle,
      "Procedimento de Ação Corretiva",
      "document by title",
    );
    const planoGerenciamentoResiduos = getRequired(
      documentByTitle,
      "Plano de Gerenciamento de Resíduos",
      "document by title",
    );
    const registroTreinamentoIntegracao = getRequired(
      documentByTitle,
      "Registro de Treinamento — Integração 2024",
      "document by title",
    );
    console.log(`✅ Documents: ${docs.length} created`);

    // ─── 18. Document Units ───────────────────────────────────────────────────────
    // Manual da Qualidade applies to all units
    for (const unit of [sede, filialRJ, filialBH]) {
      await db
        .insert(documentUnitsTable)
        .values({ documentId: manualQualidade.id, unitId: unit.id });
    }
    // Procedimento de Controle applies to all units
    for (const unit of [sede, filialRJ, filialBH]) {
      await db
        .insert(documentUnitsTable)
        .values({
          documentId: procedimentoControleDocumentos.id,
          unitId: unit.id,
        });
    }
    // Auditoria Interna — sede only
    await db
      .insert(documentUnitsTable)
      .values({ documentId: procedimentoAuditoriaInterna.id, unitId: sede.id });
    // Inspeção de Recebimento — sede and RJ
    await db
      .insert(documentUnitsTable)
      .values({ documentId: instrucaoInspecaoRecebimento.id, unitId: sede.id });
    await db
      .insert(documentUnitsTable)
      .values({
        documentId: instrucaoInspecaoRecebimento.id,
        unitId: filialRJ.id,
      });
    // Política da Qualidade — all units
    for (const unit of [sede, filialRJ, filialBH]) {
      await db
        .insert(documentUnitsTable)
        .values({ documentId: politicaQualidade.id, unitId: unit.id });
    }
    console.log(`✅ Document unit assignments created`);

    // ─── 19. Document Elaborators ─────────────────────────────────────────────────
    await db
      .insert(documentElaboratorsTable)
      .values({ documentId: manualQualidade.id, employeeId: roberto.id });
    await db
      .insert(documentElaboratorsTable)
      .values({ documentId: manualQualidade.id, employeeId: juliana.id });
    await db
      .insert(documentElaboratorsTable)
      .values({
        documentId: procedimentoControleDocumentos.id,
        employeeId: roberto.id,
      });
    await db
      .insert(documentElaboratorsTable)
      .values({
        documentId: procedimentoAuditoriaInterna.id,
        employeeId: juliana.id,
      });
    await db
      .insert(documentElaboratorsTable)
      .values({
        documentId: instrucaoInspecaoRecebimento.id,
        employeeId: marcos.id,
      });
    await db
      .insert(documentElaboratorsTable)
      .values({ documentId: politicaQualidade.id, employeeId: roberto.id });
    await db
      .insert(documentElaboratorsTable)
      .values({
        documentId: procedimentoAcaoCorretiva.id,
        employeeId: juliana.id,
      });
    await db
      .insert(documentElaboratorsTable)
      .values({
        documentId: planoGerenciamentoResiduos.id,
        employeeId: ricardo.id,
      });
    console.log(`✅ Document elaborators assigned`);

    // ─── 20. Document Approvers ───────────────────────────────────────────────────
    await db
      .insert(documentApproversTable)
      .values({
        documentId: manualQualidade.id,
        userId: adminUser.id,
        status: "approved",
        approvedAt: new Date("2024-01-15"),
        comment: "Manual revisado e aprovado.",
      });
    await db
      .insert(documentApproversTable)
      .values({
        documentId: procedimentoControleDocumentos.id,
        userId: adminUser.id,
        status: "approved",
        approvedAt: new Date("2024-02-01"),
        comment: "Aprovado.",
      });
    await db
      .insert(documentApproversTable)
      .values({
        documentId: procedimentoAuditoriaInterna.id,
        userId: adminUser.id,
        status: "approved",
        approvedAt: new Date("2024-03-10"),
      });
    await db
      .insert(documentApproversTable)
      .values({
        documentId: instrucaoInspecaoRecebimento.id,
        userId: adminUser.id,
        status: "approved",
        approvedAt: new Date("2024-04-01"),
      });
    await db
      .insert(documentApproversTable)
      .values({
        documentId: politicaQualidade.id,
        userId: adminUser.id,
        status: "approved",
        approvedAt: new Date("2024-01-05"),
        comment: "Política aprovada pela diretoria.",
      });
    await db
      .insert(documentApproversTable)
      .values({
        documentId: procedimentoAcaoCorretiva.id,
        userId: adminUser.id,
        status: "pending",
      }); // Draft — pending
    await db
      .insert(documentApproversTable)
      .values({
        documentId: registroTreinamentoIntegracao.id,
        userId: operatorUser.id,
        status: "approved",
        approvedAt: new Date("2024-01-20"),
      });
    console.log(`✅ Document approvers assigned`);

    // ─── 21. Document Recipients ──────────────────────────────────────────────────
    const now = new Date();
    await db
      .insert(documentRecipientsTable)
      .values({
        documentId: manualQualidade.id,
        userId: operatorUser.id,
        receivedAt: now,
        readAt: now,
      });
    await db
      .insert(documentRecipientsTable)
      .values({
        documentId: manualQualidade.id,
        userId: analystUser.id,
        receivedAt: now,
        readAt: now,
      });
    await db
      .insert(documentRecipientsTable)
      .values({
        documentId: manualQualidade.id,
        userId: operator2User.id,
        receivedAt: now,
      });
    await db
      .insert(documentRecipientsTable)
      .values({
        documentId: politicaQualidade.id,
        userId: operatorUser.id,
        receivedAt: now,
        readAt: now,
      });
    await db
      .insert(documentRecipientsTable)
      .values({
        documentId: politicaQualidade.id,
        userId: analystUser.id,
        receivedAt: now,
      });
    await db
      .insert(documentRecipientsTable)
      .values({
        documentId: politicaQualidade.id,
        userId: operator2User.id,
        receivedAt: now,
        readAt: now,
      });
    console.log(`✅ Document recipients assigned`);

    // ─── 22. Document References ──────────────────────────────────────────────────
    // Manual da Qualidade references Política da Qualidade
    await db
      .insert(documentReferencesTable)
      .values({
        documentId: manualQualidade.id,
        referencedDocumentId: politicaQualidade.id,
      });
    // Auditoria Interna references Controle de Documentos
    await db
      .insert(documentReferencesTable)
      .values({
        documentId: procedimentoAuditoriaInterna.id,
        referencedDocumentId: procedimentoControleDocumentos.id,
      });
    // Ação Corretiva references Auditoria Interna
    await db
      .insert(documentReferencesTable)
      .values({
        documentId: procedimentoAcaoCorretiva.id,
        referencedDocumentId: procedimentoAuditoriaInterna.id,
      });
    console.log(`✅ Document references: 3 created`);

    // ─── 23. Document Attachments ─────────────────────────────────────────────────
    await db.insert(documentAttachmentsTable).values({
      documentId: manualQualidade.id,
      versionNumber: 3,
      fileName: "manual_qualidade_v3.pdf",
      fileSize: 1250000,
      contentType: "application/pdf",
      objectPath: "demo/documents/manual_qualidade_v3.pdf",
      uploadedById: adminUser.id,
    });
    await db.insert(documentAttachmentsTable).values({
      documentId: procedimentoControleDocumentos.id,
      versionNumber: 2,
      fileName: "proc_controle_docs_v2.pdf",
      fileSize: 480000,
      contentType: "application/pdf",
      objectPath: "demo/documents/proc_controle_docs_v2.pdf",
      uploadedById: adminUser.id,
    });
    await db.insert(documentAttachmentsTable).values({
      documentId: politicaQualidade.id,
      versionNumber: 2,
      fileName: "politica_qualidade_v2.pdf",
      fileSize: 210000,
      contentType: "application/pdf",
      objectPath: "demo/documents/politica_qualidade_v2.pdf",
      uploadedById: adminUser.id,
    });
    console.log(`✅ Document attachments: 3 created`);

    // ─── 24. Document Versions ────────────────────────────────────────────────────
    const docVersions = [
      {
        documentId: manualQualidade.id,
        versionNumber: 1,
        changeDescription: "Versão inicial do Manual da Qualidade.",
        changedById: adminUser.id,
        changedFields: "title,type,status",
      },
      {
        documentId: manualQualidade.id,
        versionNumber: 2,
        changeDescription:
          "Atualização do escopo e inclusão de processos terceirizados.",
        changedById: adminUser.id,
        changedFields: "content",
      },
      {
        documentId: manualQualidade.id,
        versionNumber: 3,
        changeDescription:
          "Revisão geral para adequação à nova estrutura organizacional.",
        changedById: adminUser.id,
        changedFields: "content,scope",
      },
      {
        documentId: procedimentoControleDocumentos.id,
        versionNumber: 1,
        changeDescription:
          "Versão inicial do procedimento de controle de documentos.",
        changedById: adminUser.id,
      },
      {
        documentId: procedimentoControleDocumentos.id,
        versionNumber: 2,
        changeDescription: "Inclusão de fluxo digital para aprovação.",
        changedById: adminUser.id,
        changedFields: "content",
      },
      {
        documentId: politicaQualidade.id,
        versionNumber: 1,
        changeDescription: "Política da Qualidade original.",
        changedById: adminUser.id,
      },
      {
        documentId: politicaQualidade.id,
        versionNumber: 2,
        changeDescription:
          "Revisão com inclusão de compromisso com melhoria contínua e satisfação do cliente.",
        changedById: adminUser.id,
        changedFields: "content",
      },
    ];
    for (const v of docVersions) {
      await db.insert(documentVersionsTable).values(v);
    }
    console.log(`✅ Document versions: ${docVersions.length} created`);

    // ─── 25. Questionnaire Themes & Questions ─────────────────────────────────────
    const [theme1] = await db
      .insert(questionnaireThemesTable)
      .values({
        code: "ENV",
        name: "Aspectos Ambientais",
        description:
          "Questões relacionadas a impactos ambientais, emissões e gestão de resíduos.",
        sortOrder: 1,
      })
      .returning();

    const [theme2] = await db
      .insert(questionnaireThemesTable)
      .values({
        code: "SST",
        name: "Saúde e Segurança do Trabalho",
        description:
          "Questões relacionadas a riscos ocupacionais e segurança dos colaboradores.",
        sortOrder: 2,
      })
      .returning();

    const [theme3] = await db
      .insert(questionnaireThemesTable)
      .values({
        code: "QMS",
        name: "Sistema de Gestão da Qualidade",
        description:
          "Questões sobre maturidade do SGQ e processos de qualidade.",
        sortOrder: 3,
      })
      .returning();

    const questionValues = [
      {
        themeId: theme1.id,
        code: "ENV-01",
        questionNumber: "1.1",
        text: "A unidade possui licença ambiental vigente?",
        type: "single_select",
        options: ["Sim", "Não", "Não aplicável"],
        tags: { compliance: ["licenciamento"] },
        sortOrder: 1,
      },
      {
        themeId: theme1.id,
        code: "ENV-02",
        questionNumber: "1.2",
        text: "A unidade realiza gerenciamento de resíduos sólidos?",
        type: "single_select",
        options: ["Sim, com plano formalizado", "Sim, informalmente", "Não"],
        tags: { compliance: ["residuos"] },
        sortOrder: 2,
      },
      {
        themeId: theme1.id,
        code: "ENV-03",
        questionNumber: "1.3",
        text: "Quais tipos de resíduos são gerados? (selecione todos aplicáveis)",
        type: "multi_select",
        options: [
          "Classe I (perigosos)",
          "Classe II-A (não inertes)",
          "Classe II-B (inertes)",
          "Resíduos orgânicos",
          "Resíduos eletrônicos",
        ],
        conditionalOn: "ENV-02",
        conditionalValue: "Sim, com plano formalizado",
        tags: { compliance: ["residuos"] },
        sortOrder: 3,
      },
      {
        themeId: theme2.id,
        code: "SST-01",
        questionNumber: "2.1",
        text: "A unidade possui PGR (Programa de Gerenciamento de Riscos) implementado?",
        type: "single_select",
        options: ["Sim", "Em elaboração", "Não"],
        tags: { compliance: ["pgr", "riscos"] },
        sortOrder: 1,
      },
      {
        themeId: theme2.id,
        code: "SST-02",
        questionNumber: "2.2",
        text: "A unidade opera com máquinas que exigem adequação à NR-12?",
        type: "single_select",
        options: [
          "Sim, todas adequadas",
          "Sim, parcialmente adequadas",
          "Sim, sem adequação",
          "Não aplicável",
        ],
        tags: { compliance: ["maquinas", "nr12"] },
        sortOrder: 2,
      },
      {
        themeId: theme3.id,
        code: "QMS-01",
        questionNumber: "3.1",
        text: "A organização possui certificação ISO 9001:2015?",
        type: "single_select",
        options: ["Sim, certificada", "Em processo de certificação", "Não"],
        tags: { compliance: ["iso9001", "sgq"] },
        sortOrder: 1,
      },
      {
        themeId: theme3.id,
        code: "QMS-02",
        questionNumber: "3.2",
        text: "Descreva os principais processos cobertos pelo SGQ.",
        type: "text",
        tags: { compliance: ["sgq"] },
        sortOrder: 2,
      },
    ];
    const questions = [];
    for (const q of questionValues) {
      const [question] = await db
        .insert(questionnaireQuestionsTable)
        .values(q)
        .returning();
      questions.push(question);
    }
    const questionByCode = mapByKey(
      questions.map((question) => [question.code, question] as const),
    );
    const env01 = getRequired(questionByCode, "ENV-01", "question by code");
    const env02 = getRequired(questionByCode, "ENV-02", "question by code");
    const env03 = getRequired(questionByCode, "ENV-03", "question by code");
    const sst01 = getRequired(questionByCode, "SST-01", "question by code");
    const sst02 = getRequired(questionByCode, "SST-02", "question by code");
    const qms01 = getRequired(questionByCode, "QMS-01", "question by code");
    const qms02 = getRequired(questionByCode, "QMS-02", "question by code");
    console.log(`✅ Questionnaire: ${3} themes, ${questions.length} questions`);

    // ─── 26. Unit Questionnaire Responses ─────────────────────────────────────────
    const responses = [
      { unitId: sede.id, questionId: env01.id, answer: "Sim" },
      {
        unitId: sede.id,
        questionId: env02.id,
        answer: "Sim, com plano formalizado",
      },
      {
        unitId: sede.id,
        questionId: env03.id,
        answer: [
          "Classe II-A (não inertes)",
          "Classe II-B (inertes)",
          "Resíduos eletrônicos",
        ],
      },
      { unitId: sede.id, questionId: sst01.id, answer: "Sim" },
      { unitId: sede.id, questionId: sst02.id, answer: "Sim, todas adequadas" },
      { unitId: sede.id, questionId: qms01.id, answer: "Sim, certificada" },
      {
        unitId: sede.id,
        questionId: qms02.id,
        answer: "Produção, Logística, Qualidade, Vendas, RH",
      },
      { unitId: filialRJ.id, questionId: env01.id, answer: "Sim" },
      { unitId: filialRJ.id, questionId: env02.id, answer: "Não" },
      { unitId: filialRJ.id, questionId: sst01.id, answer: "Sim" },
      {
        unitId: filialRJ.id,
        questionId: sst02.id,
        answer: "Sim, parcialmente adequadas",
      },
      { unitId: filialRJ.id, questionId: qms01.id, answer: "Sim, certificada" },
      { unitId: filialBH.id, questionId: env01.id, answer: "Sim" },
      { unitId: filialBH.id, questionId: sst01.id, answer: "Sim" },
      { unitId: filialBH.id, questionId: qms01.id, answer: "Sim, certificada" },
    ];
    for (const r of responses) {
      await db.insert(unitQuestionnaireResponsesTable).values(r);
    }
    console.log(`✅ Questionnaire responses: ${responses.length} created`);

    // ─── 27. Unit Compliance Tags ─────────────────────────────────────────────────
    const complianceTags = [
      { unitId: sede.id, tag: "licenciamento", sourceQuestionId: env01.id },
      { unitId: sede.id, tag: "residuos", sourceQuestionId: env02.id },
      { unitId: sede.id, tag: "pgr", sourceQuestionId: sst01.id },
      { unitId: sede.id, tag: "nr12", sourceQuestionId: sst02.id },
      { unitId: sede.id, tag: "iso9001", sourceQuestionId: qms01.id },
      { unitId: filialRJ.id, tag: "licenciamento", sourceQuestionId: env01.id },
      { unitId: filialRJ.id, tag: "pgr", sourceQuestionId: sst01.id },
      { unitId: filialRJ.id, tag: "nr12", sourceQuestionId: sst02.id },
      { unitId: filialRJ.id, tag: "iso9001", sourceQuestionId: qms01.id },
      { unitId: filialBH.id, tag: "licenciamento", sourceQuestionId: env01.id },
      { unitId: filialBH.id, tag: "pgr", sourceQuestionId: sst01.id },
      { unitId: filialBH.id, tag: "iso9001", sourceQuestionId: qms01.id },
    ];
    for (const ct of complianceTags) {
      await db.insert(unitComplianceTagsTable).values(ct);
    }
    console.log(`✅ Unit compliance tags: ${complianceTags.length} created`);

    // ─── 28. Conversations & Messages ─────────────────────────────────────────────
    const [conv1] = await db
      .insert(conversations)
      .values({
        userId: adminUser.id,
        organizationId: org.id,
        title: "Dúvida sobre requisitos ISO 9001 — Cláusula 7.5",
      })
      .returning();

    await db.insert(messages).values([
      {
        conversationId: conv1.id,
        role: "user",
        content:
          "Quais são os requisitos da cláusula 7.5 da ISO 9001:2015 sobre informação documentada?",
      },
      {
        conversationId: conv1.id,
        role: "assistant",
        content:
          "A cláusula 7.5 da ISO 9001:2015 trata da **Informação Documentada** e se divide em três subcláusulas:\n\n**7.5.1 — Generalidades:** O SGQ deve incluir informação documentada requerida pela norma e pela organização.\n\n**7.5.2 — Criação e atualização:** Ao criar e atualizar, a organização deve assegurar identificação, formato, revisão e aprovação.\n\n**7.5.3 — Controle:** A informação documentada deve estar disponível, adequadamente protegida contra perda de confidencialidade, uso impróprio ou perda de integridade.",
      },
      {
        conversationId: conv1.id,
        role: "user",
        content:
          "Como podemos evidenciar o controle de documentos na auditoria?",
      },
      {
        conversationId: conv1.id,
        role: "assistant",
        content:
          "Para evidenciar o controle de documentos na auditoria, recomendo:\n\n1. **Lista mestra de documentos** atualizada com versões vigentes\n2. **Registros de aprovação** com datas e responsáveis\n3. **Histórico de revisões** mostrando alterações entre versões\n4. **Controle de distribuição** — quem recebeu e confirmou leitura\n5. **Procedimento de controle de documentos** formalizado\n\nNo Daton, todos esses controles já estão disponíveis no módulo de Documentos.",
      },
    ]);

    const [conv2] = await db
      .insert(conversations)
      .values({
        userId: operatorUser.id,
        organizationId: org.id,
        title: "Como cadastrar uma não conformidade?",
      })
      .returning();

    await db.insert(messages).values([
      {
        conversationId: conv2.id,
        role: "user",
        content:
          "Como faço para registrar uma não conformidade identificada na auditoria?",
      },
      {
        conversationId: conv2.id,
        role: "assistant",
        content:
          "Para registrar uma não conformidade no Daton:\n\n1. Acesse o módulo **Documentos**\n2. Crie um novo documento do tipo **Registro**\n3. Preencha os campos: descrição da NC, evidência objetiva, requisito da norma violado\n4. Atribua um responsável pela ação corretiva\n5. Defina prazo para tratamento\n\nO procedimento de ação corretiva (se publicado) descreve o fluxo completo de tratamento.",
      },
    ]);

    console.log(`✅ Conversations: 2 created with messages`);

    // ─── 29. Notifications ────────────────────────────────────────────────────────
    const notificationValues = [
      {
        userId: adminUser.id,
        type: "document_approval",
        title: "Documento aguardando aprovação",
        description:
          "O Procedimento de Ação Corretiva foi submetido para sua aprovação.",
        relatedEntityType: "document",
        relatedEntityId: procedimentoAcaoCorretiva.id,
        read: false,
      },
      {
        userId: adminUser.id,
        type: "legislation_expiring",
        title: "Revisão de legislação próxima",
        description:
          "A legislação 'Resolução CONAMA 491/2018' deve ser revisada nos próximos 30 dias.",
        relatedEntityType: "legislation",
        relatedEntityId: conama491.id,
        read: false,
      },
      {
        userId: operatorUser.id,
        type: "document_published",
        title: "Documento publicado",
        description:
          "O Manual da Qualidade v3 foi publicado e está disponível para leitura.",
        relatedEntityType: "document",
        relatedEntityId: manualQualidade.id,
        read: true,
      },
      {
        userId: operatorUser.id,
        type: "training_expiring",
        title: "Treinamento próximo do vencimento",
        description:
          "O treinamento 'Lead Auditor ISO 9001:2015' de Roberto Mendes vence em Set/2025.",
        relatedEntityType: "employee",
        relatedEntityId: roberto.id,
        read: false,
      },
      {
        userId: analystUser.id,
        type: "document_received",
        title: "Novo documento recebido",
        description: "Você recebeu a Política da Qualidade v2 para leitura.",
        relatedEntityType: "document",
        relatedEntityId: politicaQualidade.id,
        read: false,
      },
      {
        userId: operator2User.id,
        type: "system",
        title: "Bem-vinda ao Daton!",
        description:
          "Sua conta foi criada. Explore os módulos disponíveis no menu lateral.",
        read: true,
      },
    ];
    for (const n of notificationValues) {
      await db
        .insert(notificationsTable)
        .values({ ...n, organizationId: org.id });
    }
    console.log(`✅ Notifications: ${notificationValues.length} created`);

    // ─── 30. Invitations ──────────────────────────────────────────────────────────
    await db.insert(invitationsTable).values({
      email: "novo.auditor@example.com",
      organizationId: org.id,
      invitedBy: adminUser.id,
      role: "operator",
      modules: ["documents", "legislations"],
      token: crypto.randomUUID(),
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    });
    await db.insert(invitationsTable).values({
      email: "consultor.externo@example.com",
      organizationId: org.id,
      invitedBy: adminUser.id,
      role: "analyst",
      modules: ["documents"],
      token: crypto.randomUUID(),
      status: "expired",
      expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // expired 2 days ago
    });
    console.log(`✅ Invitations: 2 created`);

    // ─── 31. Strategic Plan ───────────────────────────────────────────────────────
    const [plan] = await db
      .insert(strategicPlansTable)
      .values({
        organizationId: org.id,
        title: "Planejamento Estratégico SGQ 2024–2026",
        status: "approved",
        standards: ["ISO 9001:2015"],
        executiveSummary:
          "Planejamento estratégico para consolidação do Sistema de Gestão da Qualidade, com foco em melhoria contínua, satisfação do cliente e expansão do escopo de certificação.",
        reviewFrequencyMonths: 12,
        nextReviewAt: new Date("2025-06-01"),
        climateChangeRelevant: true,
        climateChangeJustification:
          "A organização considera riscos climáticos na análise de contexto conforme requisito 4.1 e avalia oportunidades de eficiência energética.",
        technicalScope:
          "Fabricação de componentes metálicos e montagem de conjuntos para a indústria automotiva.",
        geographicScope:
          "Sede em São Paulo/SP, filiais em Rio de Janeiro/RJ e Belo Horizonte/MG.",
        policy:
          "A Empresa Demo LTDA está comprometida com a excelência na qualidade de seus produtos e serviços, buscando a satisfação dos clientes, a melhoria contínua dos processos e o atendimento aos requisitos legais e normativos aplicáveis.",
        mission:
          "Fornecer soluções industriais de alta qualidade, contribuindo para o sucesso de nossos clientes e o desenvolvimento sustentável.",
        vision:
          "Ser referência em gestão da qualidade no setor industrial brasileiro até 2026.",
        values:
          "Qualidade, Integridade, Inovação, Respeito às Pessoas, Sustentabilidade",
        strategicConclusion:
          "O planejamento demonstra alinhamento entre os objetivos da qualidade e a estratégia organizacional, com metas mensuráveis e planos de ação definidos.",
        methodologyNotes:
          "Análise SWOT por domínio, identificação de partes interessadas conforme cláusula 4.2, definição de objetivos SMART conforme cláusula 6.2.",
        reminderFlags: { d30: true, d7: false, d0: false },
        activeRevisionNumber: 1,
        createdById: adminUser.id,
        updatedById: adminUser.id,
        submittedAt: new Date("2024-01-20"),
        approvedAt: new Date("2024-02-01"),
      })
      .returning();
    console.log(`✅ Strategic plan: ${plan.title} (id: ${plan.id})`);

    // ─── 32. Strategic Plan SWOT Items ────────────────────────────────────────────
    const swotItems = [
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "strength" as const,
        environment: "internal" as const,
        description:
          "Equipe de qualidade experiente e certificada (Lead Auditor)",
        performance: 5,
        relevance: 5,
        result: 25,
        sortOrder: 1,
      },
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "strength" as const,
        environment: "internal" as const,
        description: "SGQ certificado ISO 9001:2015 com escopo abrangente",
        performance: 4,
        relevance: 5,
        result: 20,
        sortOrder: 2,
      },
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "weakness" as const,
        environment: "internal" as const,
        description: "Documentação parcialmente desatualizada em filiais",
        performance: 2,
        relevance: 4,
        result: 8,
        treatmentDecision: "Plano de atualização documental",
        linkedObjectiveCode: "OBJ-02",
        sortOrder: 3,
      },
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "weakness" as const,
        environment: "internal" as const,
        description: "Falta de digitalização completa dos registros",
        performance: 2,
        relevance: 3,
        result: 6,
        treatmentDecision: "Implementar gestão digital via Daton",
        sortOrder: 4,
      },
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "opportunity" as const,
        environment: "external" as const,
        description:
          "Crescente demanda de clientes por fornecedores certificados",
        performance: 4,
        relevance: 5,
        result: 20,
        linkedObjectiveCode: "OBJ-01",
        sortOrder: 5,
      },
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "opportunity" as const,
        environment: "external" as const,
        description: "Possibilidade de expandir certificação para ISO 14001",
        performance: 3,
        relevance: 4,
        result: 12,
        linkedObjectiveCode: "OBJ-04",
        sortOrder: 6,
      },
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "threat" as const,
        environment: "external" as const,
        description: "Aumento da complexidade regulatória ambiental",
        performance: 3,
        relevance: 4,
        result: 12,
        treatmentDecision: "Monitoramento contínuo via módulo de legislações",
        sortOrder: 7,
      },
      {
        planId: plan.id,
        domain: "sgq" as const,
        swotType: "threat" as const,
        environment: "external" as const,
        description: "Rotatividade de mão de obra qualificada no setor",
        performance: 3,
        relevance: 3,
        result: 9,
        treatmentDecision: "Programa de retenção de talentos",
        sortOrder: 8,
      },
    ];
    const createdSwot = [];
    for (const s of swotItems) {
      const [item] = await db
        .insert(strategicPlanSwotItemsTable)
        .values(s)
        .returning();
      createdSwot.push(item);
    }
    const swotByDescription = mapByKey(
      createdSwot.map((item) => [item.description, item] as const),
    );
    const swotDocumentacaoDesatualizada = getRequired(
      swotByDescription,
      "Documentação parcialmente desatualizada em filiais",
      "swot item by description",
    );
    const swotDigitalizacao = getRequired(
      swotByDescription,
      "Falta de digitalização completa dos registros",
      "swot item by description",
    );
    const swotIso14001 = getRequired(
      swotByDescription,
      "Possibilidade de expandir certificação para ISO 14001",
      "swot item by description",
    );
    console.log(`✅ SWOT items: ${createdSwot.length} created`);

    // ─── 33. Strategic Plan Interested Parties ────────────────────────────────────
    const parties = [
      {
        planId: plan.id,
        name: "Clientes",
        expectedRequirements:
          "Produtos conformes, entregas no prazo, certificação ISO 9001",
        roleInCompany: "Demandantes",
        roleSummary: "Destinatários finais dos produtos",
        relevantToManagementSystem: true,
        legalRequirementApplicable: false,
        monitoringMethod: "Pesquisa de satisfação semestral",
        sortOrder: 1,
      },
      {
        planId: plan.id,
        name: "Colaboradores",
        expectedRequirements:
          "Ambiente seguro, desenvolvimento profissional, remuneração justa",
        roleInCompany: "Força de trabalho",
        roleSummary: "Executam os processos do SGQ",
        relevantToManagementSystem: true,
        legalRequirementApplicable: true,
        monitoringMethod: "Pesquisa de clima anual, indicadores de RH",
        sortOrder: 2,
      },
      {
        planId: plan.id,
        name: "Fornecedores",
        expectedRequirements:
          "Pedidos claros, pagamento em dia, parceria de longo prazo",
        roleInCompany: "Cadeia de suprimentos",
        roleSummary: "Fornecem insumos e serviços",
        relevantToManagementSystem: true,
        legalRequirementApplicable: false,
        monitoringMethod: "Avaliação de fornecedores trimestral",
        sortOrder: 3,
      },
      {
        planId: plan.id,
        name: "Órgãos reguladores",
        expectedRequirements: "Conformidade legal e regulatória",
        roleInCompany: "Fiscalizadores",
        roleSummary: "Definem e fiscalizam requisitos legais",
        relevantToManagementSystem: true,
        legalRequirementApplicable: true,
        monitoringMethod: "Módulo de legislações do Daton",
        sortOrder: 4,
      },
      {
        planId: plan.id,
        name: "Acionistas / Sócios",
        expectedRequirements:
          "Rentabilidade, governança, crescimento sustentável",
        roleInCompany: "Proprietários",
        roleSummary: "Direcionamento estratégico e investimento",
        relevantToManagementSystem: true,
        legalRequirementApplicable: false,
        monitoringMethod: "Reunião de análise crítica semestral",
        sortOrder: 5,
      },
      {
        planId: plan.id,
        name: "Comunidade local",
        expectedRequirements: "Responsabilidade ambiental, geração de empregos",
        roleInCompany: "Vizinhança",
        roleSummary: "Afetados pelas operações",
        relevantToManagementSystem: false,
        legalRequirementApplicable: false,
        monitoringMethod: "Canal de comunicação / ouvidoria",
        sortOrder: 6,
      },
    ];
    for (const p of parties) {
      await db.insert(strategicPlanInterestedPartiesTable).values(p);
    }
    console.log(`✅ Interested parties: ${parties.length} created`);

    // ─── 34. Strategic Plan Objectives ────────────────────────────────────────────
    const objectives = [
      {
        planId: plan.id,
        code: "OBJ-01",
        systemDomain: "sgq",
        description:
          "Manter índice de satisfação do cliente acima de 85% em todas as unidades.",
        sortOrder: 1,
      },
      {
        planId: plan.id,
        code: "OBJ-02",
        systemDomain: "sgq",
        description:
          "Reduzir em 30% as não conformidades recorrentes até dezembro de 2025.",
        notes: "Baseline: 24 NCs recorrentes em 2023.",
        sortOrder: 2,
      },
      {
        planId: plan.id,
        code: "OBJ-03",
        systemDomain: "sgq",
        description:
          "Garantir 100% dos colaboradores treinados nos procedimentos do SGQ até junho de 2025.",
        sortOrder: 3,
      },
      {
        planId: plan.id,
        code: "OBJ-04",
        systemDomain: "sga",
        description: "Obter certificação ISO 14001:2015 até dezembro de 2026.",
        notes: "Processo já iniciado na sede.",
        sortOrder: 4,
      },
      {
        planId: plan.id,
        code: "OBJ-05",
        systemDomain: "sgq",
        description:
          "Digitalizar 100% da documentação do SGQ no Daton até março de 2025.",
        sortOrder: 5,
      },
    ];
    const createdObjectives = [];
    for (const o of objectives) {
      const [obj] = await db
        .insert(strategicPlanObjectivesTable)
        .values(o)
        .returning();
      createdObjectives.push(obj);
    }
    const objectiveByCode = mapByKey(
      createdObjectives.map(
        (objective) => [objective.code, objective] as const,
      ),
    );
    const obj01 = getRequired(objectiveByCode, "OBJ-01", "objective by code");
    const obj02 = getRequired(objectiveByCode, "OBJ-02", "objective by code");
    const obj03 = getRequired(objectiveByCode, "OBJ-03", "objective by code");
    const obj04 = getRequired(objectiveByCode, "OBJ-04", "objective by code");
    const obj05 = getRequired(objectiveByCode, "OBJ-05", "objective by code");
    console.log(`✅ Strategic objectives: ${createdObjectives.length} created`);

    // ─── 35. Strategic Plan Actions ───────────────────────────────────────────────
    const actions = [
      {
        planId: plan.id,
        title: "Implementar pesquisa de satisfação digital",
        description:
          "Desenvolver e aplicar pesquisa de satisfação via formulário online para todos os clientes ativos.",
        objectiveId: obj01.id,
        responsibleUserId: operatorUser.id,
        dueDate: new Date("2025-03-31"),
        status: "in_progress" as const,
        sortOrder: 1,
      },
      {
        planId: plan.id,
        title: "Análise de causa raiz das NCs recorrentes",
        description:
          "Aplicar diagrama de Ishikawa e 5 Porquês para as top 10 NCs recorrentes.",
        objectiveId: obj02.id,
        swotItemId: swotDocumentacaoDesatualizada.id,
        responsibleUserId: adminUser.id,
        dueDate: new Date("2025-04-30"),
        status: "in_progress" as const,
        sortOrder: 2,
      },
      {
        planId: plan.id,
        title: "Plano de treinamento SGQ 2025",
        description:
          "Elaborar e executar plano de treinamento para todos os colaboradores nos procedimentos do SGQ.",
        objectiveId: obj03.id,
        responsibleUserId: operator2User.id,
        dueDate: new Date("2025-06-30"),
        status: "pending" as const,
        sortOrder: 3,
      },
      {
        planId: plan.id,
        title: "Gap analysis ISO 14001",
        description:
          "Realizar diagnóstico de lacunas para certificação ISO 14001:2015.",
        objectiveId: obj04.id,
        swotItemId: swotIso14001.id,
        responsibleUserId: adminUser.id,
        dueDate: new Date("2025-09-30"),
        status: "pending" as const,
        sortOrder: 4,
      },
      {
        planId: plan.id,
        title: "Migrar documentos para o Daton",
        description:
          "Digitalizar e migrar toda a documentação do SGQ (procedimentos, registros, instruções) para a plataforma Daton.",
        objectiveId: obj05.id,
        swotItemId: swotDigitalizacao.id,
        responsibleUserId: operatorUser.id,
        dueDate: new Date("2025-03-31"),
        status: "in_progress" as const,
        sortOrder: 5,
      },
      {
        planId: plan.id,
        title: "Revisão da Política da Qualidade",
        description:
          "Revisar a política com inclusão de compromisso ambiental visando futura certificação ISO 14001.",
        objectiveId: obj04.id,
        responsibleUserId: adminUser.id,
        dueDate: new Date("2025-12-31"),
        status: "done" as const,
        notes: "Concluída em Fev/2024 — nova versão publicada.",
        sortOrder: 6,
      },
    ];
    const createdActions = [];
    for (const a of actions) {
      const [action] = await db
        .insert(strategicPlanActionsTable)
        .values(a)
        .returning();
      createdActions.push(action);
    }
    const actionByTitle = mapByKey(
      createdActions.map((action) => [action.title, action] as const),
    );
    const pesquisaSatisfacao = getRequired(
      actionByTitle,
      "Implementar pesquisa de satisfação digital",
      "action by title",
    );
    const analiseNc = getRequired(
      actionByTitle,
      "Análise de causa raiz das NCs recorrentes",
      "action by title",
    );
    const planoTreinamento = getRequired(
      actionByTitle,
      "Plano de treinamento SGQ 2025",
      "action by title",
    );
    const gapAnalysis = getRequired(
      actionByTitle,
      "Gap analysis ISO 14001",
      "action by title",
    );
    const migrarDocumentos = getRequired(
      actionByTitle,
      "Migrar documentos para o Daton",
      "action by title",
    );
    console.log(`✅ Strategic actions: ${createdActions.length} created`);

    // ─── 36. Strategic Plan Action Units ──────────────────────────────────────────
    // Pesquisa de satisfação — all units
    for (const unit of [sede, filialRJ, filialBH]) {
      await db
        .insert(strategicPlanActionUnitsTable)
        .values({ actionId: pesquisaSatisfacao.id, unitId: unit.id });
    }
    // NC analysis — sede
    await db
      .insert(strategicPlanActionUnitsTable)
      .values({ actionId: analiseNc.id, unitId: sede.id });
    // Training plan — all units
    for (const unit of [sede, filialRJ, filialBH]) {
      await db
        .insert(strategicPlanActionUnitsTable)
        .values({ actionId: planoTreinamento.id, unitId: unit.id });
    }
    // Gap analysis ISO 14001 — sede first
    await db
      .insert(strategicPlanActionUnitsTable)
      .values({ actionId: gapAnalysis.id, unitId: sede.id });
    // Document migration — all units
    for (const unit of [sede, filialRJ, filialBH]) {
      await db
        .insert(strategicPlanActionUnitsTable)
        .values({ actionId: migrarDocumentos.id, unitId: unit.id });
    }
    console.log(`✅ Strategic action unit assignments created`);

    // ─── 37. Strategic Plan Revision ──────────────────────────────────────────────
    await db.insert(strategicPlanRevisionsTable).values({
      planId: plan.id,
      revisionNumber: 1,
      revisionDate: new Date("2024-02-01"),
      reason:
        "Aprovação inicial do planejamento estratégico pela alta direção.",
      changeSummary:
        "Versão inicial aprovada após análise crítica pela diretoria. Inclui SWOT, partes interessadas, objetivos e plano de ação.",
      approvedById: adminUser.id,
      snapshot: {
        title: plan.title,
        status: "approved",
        objectives: objectives.map((o) => o.description),
        swotCount: swotItems.length,
        actionCount: actions.length,
      },
    });
    console.log(`✅ Strategic plan revision: 1 created`);

    // ─── 38. Product Knowledge Articles ───────────────────────────────────────────
    const articleDrafts = [
      {
        slug: "como-funciona-controle-documentos",
        title: "Como funciona o Controle de Documentos no Daton",
        category: "Módulos",
        summary:
          "Guia completo sobre o módulo de controle de documentos, incluindo criação, aprovação, distribuição e controle de versões.",
        bodyMarkdown: `# Controle de Documentos no Daton\n\nO módulo de Documentos do Daton implementa os requisitos da cláusula 7.5 da ISO 9001:2015.\n\n## Funcionalidades\n\n- **Criação e edição** de documentos com controle de versão automático\n- **Fluxo de aprovação** com múltiplos aprovadores\n- **Distribuição controlada** com confirmação de leitura\n- **Referências cruzadas** entre documentos\n- **Validade e revisão** programada\n\n## Tipos de Documento\n\n| Tipo | Descrição |\n|------|----------|\n| Manual | Manuais do sistema de gestão |\n| Procedimento | Procedimentos operacionais |\n| Instrução | Instruções de trabalho |\n| Política | Políticas organizacionais |\n| Registro | Registros e formulários |\n| Plano | Planos de ação e gestão |`,
        status: "published" as const,
        version: 1,
        publishedAt: new Date("2024-06-01"),
      },
      {
        slug: "gestao-legislacoes-compliance",
        title: "Gestão de Legislações e Compliance",
        category: "Módulos",
        summary:
          "Como utilizar o módulo de Legislações para manter conformidade legal e regulatória em todas as unidades.",
        bodyMarkdown: `# Gestão de Legislações\n\nO módulo de Legislações permite rastrear e gerenciar todas as obrigações legais e regulatórias aplicáveis.\n\n## Funcionalidades principais\n\n- Cadastro de legislações por nível (federal, estadual, municipal, internacional)\n- Vinculação de legislações a unidades específicas\n- Status de conformidade por unidade\n- Anexo de evidências de conformidade\n- Alertas de revisão periódica\n\n## Boas práticas\n\n1. Revise legislações conforme frequência definida\n2. Mantenha evidências atualizadas\n3. Utilize tags para classificar por tema`,
        status: "published" as const,
        version: 1,
        publishedAt: new Date("2024-06-15"),
      },
      {
        slug: "planejamento-estrategico-iso9001",
        title: "Planejamento Estratégico conforme ISO 9001:2015",
        category: "Gestão",
        summary:
          "Como o Daton apoia o planejamento estratégico seguindo os requisitos das cláusulas 4, 5 e 6 da ISO 9001:2015.",
        bodyMarkdown: `# Planejamento Estratégico no Daton\n\nO módulo de Planejamento Estratégico do Daton atende aos requisitos das cláusulas 4.1 (Contexto), 4.2 (Partes Interessadas), 5.2 (Política) e 6.2 (Objetivos) da ISO 9001:2015.\n\n## Estrutura\n\n- Análise SWOT por domínio (SGQ, SGA, SST, ESG, Governança)\n- Partes interessadas com requisitos e monitoramento\n- Objetivos da qualidade com indicadores\n- Planos de ação vinculados a objetivos e SWOT\n- Revisões com snapshot de versão`,
        status: "draft" as const,
        version: 0,
      },
    ];
    const articles = articleDrafts.map((article) => ({
      ...article,
      checksum: buildArticleChecksum(article),
    }));
    const createdArticles = [];
    for (const a of articles) {
      const [article] = await db
        .insert(productKnowledgeArticlesTable)
        .values({
          ...a,
          createdById: adminUser.id,
          updatedById: adminUser.id,
        })
        .returning();
      createdArticles.push(article);
    }
    const articleBySlug = mapByKey(
      createdArticles.map((article) => [article.slug, article] as const),
    );
    const articleSeedBySlug = mapByKey(
      articles.map((article) => [article.slug, article] as const),
    );
    const controleDocumentosArticle = getRequired(
      articleBySlug,
      "como-funciona-controle-documentos",
      "article by slug",
    );
    const legislacoesArticle = getRequired(
      articleBySlug,
      "gestao-legislacoes-compliance",
      "article by slug",
    );
    const controleDocumentosRevision = getRequired(
      articleSeedBySlug,
      "como-funciona-controle-documentos",
      "article seed by slug",
    );
    const legislacoesRevision = getRequired(
      articleSeedBySlug,
      "gestao-legislacoes-compliance",
      "article seed by slug",
    );
    console.log(
      `✅ Product knowledge articles: ${createdArticles.length} created`,
    );

    // ─── 39. Product Knowledge Article Revisions ──────────────────────────────────
    // Published articles get revision records
    await db.insert(productKnowledgeArticleRevisionsTable).values({
      articleId: controleDocumentosArticle.id,
      version: 1,
      title: controleDocumentosRevision.title,
      summary: controleDocumentosRevision.summary,
      bodyMarkdown: controleDocumentosRevision.bodyMarkdown,
      checksum: buildArticleChecksum(controleDocumentosRevision),
      publishedById: adminUser.id,
      publishedAt: controleDocumentosRevision.publishedAt,
    });
    await db.insert(productKnowledgeArticleRevisionsTable).values({
      articleId: legislacoesArticle.id,
      version: 1,
      title: legislacoesRevision.title,
      summary: legislacoesRevision.summary,
      bodyMarkdown: legislacoesRevision.bodyMarkdown,
      checksum: buildArticleChecksum(legislacoesRevision),
      publishedById: adminUser.id,
      publishedAt: legislacoesRevision.publishedAt,
    });
    console.log(`✅ Product knowledge article revisions: 2 created`);

    // ─── P&D — Projeto e Desenvolvimento (ISO 8.3) ───────────────────────────────
    const [applicabilityDecision] = await db
      .insert(requirementApplicabilityDecisionsTable)
      .values({
        organizationId: org.id,
        requirementCode: "8.3",
        isApplicable: true,
        scopeSummary:
          "Desenvolvemos produtos sob encomenda para clientes industriais, exigindo controle formal de P&D conforme ISO 9001:2015 cláusula 8.3.",
        justification:
          "A empresa realiza atividades de projeto e desenvolvimento de novos produtos e processos de forma recorrente. O controle formal é necessário para garantir rastreabilidade, aprovação de clientes e conformidade do produto final.",
        responsibleEmployeeId: roberto.id,
        approvalStatus: "approved",
        approvedById: adminUser.id,
        approvedAt: new Date("2025-03-01"),
        validFrom: "2025-01-01",
        validUntil: "2026-12-31",
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();
    console.log(
      `✅ P&D applicability decision: applicable=true, approved (id: ${applicabilityDecision.id})`,
    );

    // Project 1 — active, with all sub-entities
    const [projectSensor] = await db
      .insert(developmentProjectsTable)
      .values({
        organizationId: org.id,
        applicabilityDecisionId: applicabilityDecision.id,
        projectCode: "PD-2025-001",
        title: "Sensor de Temperatura Industrial — 4ª Geração",
        scope:
          "Desenvolver a 4ª geração do sensor de temperatura industrial, incorporando comunicação sem fio (BLE/LoRa), faixa de medição ampliada (-50°C a +300°C) e certificação INMETRO.",
        objective:
          "Lançar produto certificado até dezembro de 2025, substituindo a 3ª geração nas linhas de produção de clientes-chave.",
        status: "active",
        responsibleEmployeeId: roberto.id,
        plannedStartDate: "2025-02-01",
        plannedEndDate: "2025-12-15",
        attachments: [],
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    // Inputs for project 1
    await db.insert(developmentProjectInputsTable).values([
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Especificações do cliente ABC Indústrias",
        description:
          "Requisitos técnicos e de interface definidos em contrato com o cliente ABC Indústrias, incluindo faixa de temperatura, precisão mínima e protocolo de comunicação.",
        source: "Contrato ABC-2024-089",
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Norma IEC 60584 — Termopares industriais",
        description:
          "Requisitos normativos para calibração e precisão de termopares a serem atendidos pelo produto.",
        source: "IEC 60584:2013",
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Lições aprendidas — 3ª geração",
        description:
          "Registro de falhas e melhorias identificadas no ciclo de vida do sensor Gen3, incluindo problemas de selagem e durabilidade da bateria.",
        source: "Relatório interno RI-2024-17",
        sortOrder: 3,
      },
    ]);

    // Stages for project 1
    await db.insert(developmentProjectStagesTable).values({
      organizationId: org.id,
      projectId: projectSensor.id,
      title: "Conceituação e Viabilidade",
      description:
        "Análise de viabilidade técnica e econômica, definição da arquitetura de hardware e seleção de fornecedores de componentes críticos.",
      responsibleEmployeeId: roberto.id,
      status: "completed",
      dueDate: "2025-03-31",
      completedAt: new Date("2025-03-28"),
      evidenceNote:
        "Relatório de viabilidade aprovado pela diretoria técnica em 28/03/2025.",
      sortOrder: 1,
    });

    await db.insert(developmentProjectStagesTable).values([
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Projeto Detalhado — Hardware",
        description:
          "Desenvolvimento do esquemático, layout de PCB, especificação de firmware e desenhos mecânicos da carcaça.",
        responsibleEmployeeId: marcos.id,
        status: "in_progress",
        dueDate: "2025-06-30",
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Prototipagem e Testes de Bancada",
        description:
          "Fabricação de 10 protótipos e execução de testes de bancada conforme plano de verificação.",
        responsibleEmployeeId: juliana.id,
        status: "planned",
        dueDate: "2025-09-30",
        sortOrder: 3,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Certificação INMETRO e Homologação",
        description:
          "Submissão do produto ao processo de certificação compulsória e homologação com clientes-piloto.",
        responsibleEmployeeId: roberto.id,
        status: "planned",
        dueDate: "2025-11-30",
        sortOrder: 4,
      },
    ]);

    // Outputs for project 1
    await db.insert(developmentProjectOutputsTable).values([
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Especificação Técnica do Produto — Rev. A",
        description:
          "Documento formal com todos os parâmetros técnicos, faixas nominais, tolerâncias, interfaces e condições de operação do sensor Gen4.",
        outputType: "specification",
        status: "approved",
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Plano de Verificação e Validação",
        description:
          "Plano com todos os testes e critérios de aceitação necessários para validar o produto antes do lançamento.",
        outputType: "plan",
        status: "approved",
        sortOrder: 2,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Relatório de Prototipagem — Iteração 1",
        description:
          "Resultados dos testes de bancada com 10 protótipos da 1ª iteração, incluindo não conformidades identificadas.",
        outputType: "report",
        status: "draft",
        sortOrder: 3,
      },
    ]);

    // Reviews for project 1
    await db.insert(developmentProjectReviewsTable).values([
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        reviewType: "review",
        title: "Revisão de Projeto — Gate 1 (Conceituação)",
        notes:
          "Revisão formal da fase de conceituação. Todos os requisitos do cliente foram capturados nas entradas. Arquitetura de hardware aprovada com ressalva sobre seleção do módulo BLE — necessário avaliar alternativas com menor consumo.",
        outcome: "needs_changes",
        responsibleEmployeeId: roberto.id,
        occurredAt: new Date("2025-03-28"),
        createdById: adminUser.id,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        reviewType: "review",
        title: "Revisão de Projeto — Gate 1b (Ação corretiva BLE)",
        notes:
          "Módulo BLE substituído pelo nRF52840. Consumo energético atende à especificação de 5 anos com bateria CR2450. Conceituação aprovada sem pendências.",
        outcome: "approved",
        responsibleEmployeeId: roberto.id,
        occurredAt: new Date("2025-04-05"),
        createdById: adminUser.id,
      },
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        reviewType: "verification",
        title: "Verificação — Esquemático PCB Rev. B",
        notes:
          "Verificação do esquemático contra os requisitos de entrada. Pendente execução após entrega do layout Rev. B pelo contratado.",
        outcome: "pending",
        responsibleEmployeeId: marcos.id,
        createdById: adminUser.id,
      },
    ]);

    // Changes for project 1
    await db.insert(developmentProjectChangesTable).values([
      {
        organizationId: org.id,
        projectId: projectSensor.id,
        title: "Substituição do módulo de comunicação BLE",
        changeDescription:
          "Troca do módulo ESP32-C3 pelo nRF52840 como componente de comunicação BLE.",
        reason:
          "Módulo original não atingia o requisito de consumo energético para vida útil de bateria de 5 anos.",
        impactDescription:
          "Necessidade de revisão do esquemático (2 dias). Sem impacto no cronograma geral. Custo de componente aumenta R$ 12/unidade.",
        status: "approved",
        decidedById: adminUser.id,
        decidedAt: new Date("2025-04-04"),
        createdById: adminUser.id,
        updatedById: adminUser.id,
      },
    ]);

    console.log(
      `✅ P&D project 1: "${projectSensor.title}" (active, with inputs/stages/outputs/reviews/changes)`,
    );

    // Project 2 — completed
    const [projectProcess] = await db
      .insert(developmentProjectsTable)
      .values({
        organizationId: org.id,
        applicabilityDecisionId: applicabilityDecision.id,
        projectCode: "PD-2024-003",
        title: "Processo de Soldagem por Refluxo — Qualificação",
        scope:
          "Qualificar processo de soldagem por refluxo para placas com componentes BGA, estabelecendo parâmetros de temperatura e velocidade de esteira para os fornos Heller 1800EXL.",
        objective:
          "Eliminar defeitos de soldagem em placas BGA, reduzindo retrabalho em 80% até o final de 2024.",
        status: "completed",
        responsibleEmployeeId: juliana.id,
        plannedStartDate: "2024-04-01",
        plannedEndDate: "2024-09-30",
        actualEndDate: "2024-09-25",
        attachments: [],
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    await db.insert(developmentProjectInputsTable).values([
      {
        organizationId: org.id,
        projectId: projectProcess.id,
        title: "Especificação de processo do fornecedor Heller",
        description:
          "Manual de parâmetros recomendados para soldagem de componentes BGA nos fornos Heller 1800EXL.",
        source: "Heller Industries — Application Note AN-REF-BGA-2022",
        sortOrder: 1,
      },
      {
        organizationId: org.id,
        projectId: projectProcess.id,
        title: "Relatório de rejeição Q1/2024",
        description:
          "Análise de defeitos de soldagem identificados em inspeção AOI no primeiro trimestre de 2024.",
        source: "Qualidade — QA-REP-2024-001",
        sortOrder: 2,
      },
    ]);

    await db.insert(developmentProjectReviewsTable).values([
      {
        organizationId: org.id,
        projectId: projectProcess.id,
        reviewType: "verification",
        title: "Verificação do Perfil de Temperatura",
        notes:
          "Perfil de temperatura validado com termopares em 9 pontos da placa. Todos dentro da janela especificada (220-245°C). Parâmetros aprovados.",
        outcome: "approved",
        responsibleEmployeeId: juliana.id,
        occurredAt: new Date("2024-08-15"),
        createdById: adminUser.id,
      },
      {
        organizationId: org.id,
        projectId: projectProcess.id,
        reviewType: "validation",
        title: "Validação com Lote Piloto — 500 placas",
        notes:
          "Produção piloto de 500 placas com parâmetros qualificados. Taxa de defeito: 0,4% (versus 8,2% antes do projeto). Meta de 80% de redução atingida. Processo validado para produção em série.",
        outcome: "approved",
        responsibleEmployeeId: juliana.id,
        occurredAt: new Date("2024-09-20"),
        createdById: adminUser.id,
      },
    ]);

    console.log(
      `✅ P&D project 2: "${projectProcess.title}" (completed, with inputs/reviews)`,
    );

    // ─── 40. SGQ Processes ────────────────────────────────────────────────────────
    const [processoInstalacao] = await db
      .insert(sgqProcessesTable)
      .values({
        organizationId: org.id,
        name: "Instalação e Comissionamento",
        objective:
          "Executar instalações de equipamentos industriais conforme especificações técnicas e requisitos do cliente.",
        ownerUserId: adminUser.id,
        inputs: ["Ordem de serviço", "Projeto técnico", "Equipamentos"],
        outputs: ["Relatório de comissionamento", "Termo de aceite", "Checklist de entrega"],
        criteria: "Conformidade com normas técnicas e requisitos contratuais",
        indicators: "Taxa de retrabalho, índice de satisfação do cliente, prazo de entrega",
        status: "active",
        currentRevisionNumber: 2,
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    const [processoManutencao] = await db
      .insert(sgqProcessesTable)
      .values({
        organizationId: org.id,
        name: "Manutenção Preventiva e Corretiva",
        objective:
          "Manter a disponibilidade e confiabilidade dos equipamentos dos clientes por meio de intervenções planejadas e corretivas.",
        ownerUserId: operatorUser.id,
        inputs: ["Plano de manutenção", "Histórico do equipamento", "OS de manutenção"],
        outputs: ["Relatório técnico de manutenção", "Laudo de condições", "Peças substituídas"],
        criteria: "MTBF > 2000h, MTTR < 4h, disponibilidade ≥ 95%",
        indicators: "MTBF, MTTR, disponibilidade operacional, custo por intervenção",
        status: "active",
        currentRevisionNumber: 1,
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    const [processoFabricacao] = await db
      .insert(sgqProcessesTable)
      .values({
        organizationId: org.id,
        name: "Fabricação de Componentes",
        objective:
          "Produzir componentes metálicos conforme desenhos técnicos, tolerâncias e requisitos de qualidade definidos.",
        ownerUserId: operator2User.id,
        inputs: ["Ordem de produção", "Matéria-prima", "Instruções de trabalho"],
        outputs: ["Componentes fabricados", "Registro de inspeção", "Relatório de não conformidades"],
        criteria: "Conformidade dimensional ≥ 98%, índice de rejeição < 2%",
        indicators: "Índice de rejeição, conformidade dimensional, OEE",
        status: "active",
        currentRevisionNumber: 1,
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    console.log(`✅ SGQ Processes: 3 created`);

    // ─── 41. Organization Contacts (clients) ──────────────────────────────────────
    const [clienteAuto] = await db
      .insert(organizationContactsTable)
      .values({
        organizationId: org.id,
        sourceType: "external_contact",
        name: "Eng. Rafael Borges",
        email: "rafael.borges@automotiva.com.br",
        phone: "(11) 9 8765-4321",
        organizationName: "AutoMotiva Indústria S.A.",
        classificationType: "customer",
        classificationDescription: "Cliente industrial — segmento automotivo",
        notes: "Contato principal para projetos de instalação na planta de Sorocaba.",
        createdById: adminUser.id,
      })
      .returning();

    const [clienteEnergia] = await db
      .insert(organizationContactsTable)
      .values({
        organizationId: org.id,
        sourceType: "external_contact",
        name: "Dra. Carla Mendonça",
        email: "c.mendonca@energiatec.com.br",
        phone: "(21) 3456-7890",
        organizationName: "EnergiaTec Sistemas",
        classificationType: "customer",
        classificationDescription: "Cliente — setor de energia renovável",
        notes: "Responsável pela aprovação técnica dos laudos de comissionamento.",
        createdById: adminUser.id,
      })
      .returning();

    console.log(`✅ Organization contacts: 2 created`);

    // ─── 42. Service Execution Models ─────────────────────────────────────────────
    const [modeloInstalacao] = await db
      .insert(serviceExecutionModelsTable)
      .values({
        organizationId: org.id,
        name: "Modelo — Instalação Industrial",
        description:
          "Modelo padrão para execução de instalações industriais. Cobre inspeção pré-obra, comissionamento e aceite final.",
        processId: processoInstalacao.id,
        unitId: sede.id,
        requiresSpecialValidation: true,
        status: "active",
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    const [modeloManutencao] = await db
      .insert(serviceExecutionModelsTable)
      .values({
        organizationId: org.id,
        name: "Modelo — Manutenção Preventiva",
        description:
          "Modelo para execução de manutenção preventiva periódica. Inclui checkpoints de segurança e verificação funcional.",
        processId: processoManutencao.id,
        unitId: filialRJ.id,
        requiresSpecialValidation: false,
        status: "active",
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    const [modeloFabricacao] = await db
      .insert(serviceExecutionModelsTable)
      .values({
        organizationId: org.id,
        name: "Modelo — Fabricação de Componentes",
        description:
          "Modelo para controle de fabricação. Cobre inspeção de matéria-prima, controle em processo e inspeção final.",
        processId: processoFabricacao.id,
        unitId: sede.id,
        requiresSpecialValidation: false,
        status: "active",
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    console.log(`✅ Service execution models: 3 created`);

    // ─── 43. Model Checkpoints ────────────────────────────────────────────────────
    // Checkpoints para modelo de instalação
    const [cpDocumentacao] = await db
      .insert(serviceExecutionModelCheckpointsTable)
      .values({
        modelId: modeloInstalacao.id,
        kind: "checkpoint",
        label: "Conferência de documentação técnica",
        acceptanceCriteria:
          "Projeto aprovado, ART emitida, licenças necessárias anexadas.",
        guidance: "Verificar se todos os documentos do projeto estão disponíveis antes de iniciar.",
        isRequired: true,
        requiresEvidence: true,
        sortOrder: 1,
      })
      .returning();

    const [cpSeguranca] = await db
      .insert(serviceExecutionModelCheckpointsTable)
      .values({
        modelId: modeloInstalacao.id,
        kind: "preventive_control",
        label: "Inspeção de segurança — EPI e área de trabalho",
        acceptanceCriteria:
          "EPI completo, área sinalizada, PT (permissão de trabalho) emitida.",
        guidance: "Realizar DDS antes do início. Registrar presença de todos os colaboradores.",
        isRequired: true,
        requiresEvidence: false,
        sortOrder: 2,
      })
      .returning();

    const [cpInstalacao] = await db
      .insert(serviceExecutionModelCheckpointsTable)
      .values({
        modelId: modeloInstalacao.id,
        kind: "checkpoint",
        label: "Inspeção de recebimento dos equipamentos",
        acceptanceCriteria:
          "Equipamento sem avarias, lacres intactos, nota fiscal confere.",
        guidance: "Fotografar o estado de recebimento e registrar qualquer divergência.",
        isRequired: true,
        requiresEvidence: true,
        sortOrder: 3,
      })
      .returning();

    const [cpComissionamento] = await db
      .insert(serviceExecutionModelCheckpointsTable)
      .values({
        modelId: modeloInstalacao.id,
        kind: "checkpoint",
        label: "Testes de comissionamento e partida",
        acceptanceCriteria:
          "Todos os parâmetros dentro dos limites especificados. Sistema operacional.",
        guidance: "Executar roteiro de testes conforme manual do fabricante. Registrar todos os valores medidos.",
        isRequired: true,
        requiresEvidence: true,
        sortOrder: 4,
      })
      .returning();

    const [cpAceiteCliente] = await db
      .insert(serviceExecutionModelCheckpointsTable)
      .values({
        modelId: modeloInstalacao.id,
        kind: "checkpoint",
        label: "Aceite formal do cliente",
        acceptanceCriteria:
          "Termo de aceite assinado pelo responsável técnico do cliente.",
        guidance: "Apresentar relatório de comissionamento antes de solicitar o aceite.",
        isRequired: true,
        requiresEvidence: true,
        sortOrder: 5,
      })
      .returning();

    // Checkpoints para modelo de manutenção
    await db.insert(serviceExecutionModelCheckpointsTable).values({
      modelId: modeloManutencao.id,
      kind: "preventive_control",
      label: "Verificação de bloqueio e travamento (LOTO)",
      acceptanceCriteria: "Energia isolada, travamento aplicado, testado.",
      isRequired: true,
      requiresEvidence: false,
      sortOrder: 1,
    });

    await db.insert(serviceExecutionModelCheckpointsTable).values({
      modelId: modeloManutencao.id,
      kind: "checkpoint",
      label: "Inspeção visual dos componentes",
      acceptanceCriteria: "Sem desgaste excessivo, corrosão ou avaria estrutural.",
      isRequired: true,
      requiresEvidence: true,
      sortOrder: 2,
    });

    await db.insert(serviceExecutionModelCheckpointsTable).values({
      modelId: modeloManutencao.id,
      kind: "checkpoint",
      label: "Testes funcionais pós-manutenção",
      acceptanceCriteria: "Equipamento opera dentro dos parâmetros nominais.",
      isRequired: true,
      requiresEvidence: true,
      sortOrder: 3,
    });

    // Checkpoints para modelo de fabricação
    await db.insert(serviceExecutionModelCheckpointsTable).values({
      modelId: modeloFabricacao.id,
      kind: "checkpoint",
      label: "Inspeção de matéria-prima",
      acceptanceCriteria: "Material conforme especificação do certificado de qualidade.",
      isRequired: true,
      requiresEvidence: true,
      sortOrder: 1,
    });

    await db.insert(serviceExecutionModelCheckpointsTable).values({
      modelId: modeloFabricacao.id,
      kind: "checkpoint",
      label: "Controle dimensional em processo",
      acceptanceCriteria: "Dimensões dentro das tolerâncias do desenho técnico.",
      isRequired: true,
      requiresEvidence: false,
      sortOrder: 2,
    });

    await db.insert(serviceExecutionModelCheckpointsTable).values({
      modelId: modeloFabricacao.id,
      kind: "checkpoint",
      label: "Inspeção final do lote",
      acceptanceCriteria: "100% das peças inspecionadas conforme AQL definido. Relatório de inspeção emitido.",
      isRequired: true,
      requiresEvidence: true,
      sortOrder: 3,
    });

    console.log(`✅ Model checkpoints created`);

    // ─── 44. Special Validation Profile (para instalação) ─────────────────────────
    const [perfilValidacaoEspecial] = await db
      .insert(serviceSpecialValidationProfilesTable)
      .values({
        organizationId: org.id,
        modelId: modeloInstalacao.id,
        processId: processoInstalacao.id,
        title: "Validação de Processo — Instalação em Alta Tensão",
        criteria:
          "Processo de instalação em sistemas de alta tensão (> 1kV). Requer validação periódica conforme NR-10 e procedimento interno PQ-ELT-001.",
        method:
          "Simulação supervisionada por técnico certificado + revisão documental semestral.",
        status: "valid",
        responsibleUserId: adminUser.id,
        currentValidUntil: new Date("2026-12-31"),
        notes:
          "Validação inicial aprovada em Jan/2025. Próxima revalidação: Dez/2025.",
        createdById: adminUser.id,
        updatedById: adminUser.id,
      })
      .returning();

    await db.insert(serviceSpecialValidationEventsTable).values({
      profileId: perfilValidacaoEspecial.id,
      eventType: "initial_validation",
      result: "approved",
      criteriaSnapshot:
        "Processo de instalação em alta tensão validado conforme NR-10 e PQ-ELT-001.",
      notes: "Equipe técnica avaliada e aprovada. Equipamentos de medição calibrados.",
      validUntil: new Date("2026-12-31"),
      validatedById: adminUser.id,
      validatedAt: new Date("2025-01-15"),
    });

    console.log(`✅ Special validation profile + event created`);

    // ─── 45. Service Execution Cycles ─────────────────────────────────────────────
    // Ciclo 1: Em andamento — instalação industrial
    const [cicloInstalacaoAtivo] = await db
      .insert(serviceExecutionCyclesTable)
      .values({
        organizationId: org.id,
        modelId: modeloInstalacao.id,
        title: "Instalação — Linha de Montagem AutoMotiva Sorocaba",
        serviceOrderRef: "OS-2026-0312",
        outputIdentifier: "INST-AM-0312",
        processId: processoInstalacao.id,
        unitId: sede.id,
        customerContactId: clienteAuto.id,
        status: "in_progress",
        openedById: operatorUser.id,
        startedAt: new Date("2026-04-08"),
      })
      .returning();

    // Ciclo 2: Aguardando liberação — instalação concluída
    const [cicloInstalacaoLiberacao] = await db
      .insert(serviceExecutionCyclesTable)
      .values({
        organizationId: org.id,
        modelId: modeloInstalacao.id,
        title: "Instalação — Painéis Elétricos EnergiaTec Filial RJ",
        serviceOrderRef: "OS-2026-0287",
        outputIdentifier: "INST-ET-0287",
        processId: processoInstalacao.id,
        unitId: filialRJ.id,
        customerContactId: clienteEnergia.id,
        status: "awaiting_release",
        openedById: operatorUser.id,
        startedAt: new Date("2026-04-01"),
      })
      .returning();

    // Ciclo 3: Liberado — manutenção concluída
    const [cicloManutencaoLiberado] = await db
      .insert(serviceExecutionCyclesTable)
      .values({
        organizationId: org.id,
        modelId: modeloManutencao.id,
        title: "Manutenção Preventiva — Compressores AutoMotiva Mar/2026",
        serviceOrderRef: "OS-2026-0241",
        outputIdentifier: "MANUT-AM-0241",
        processId: processoManutencao.id,
        unitId: filialRJ.id,
        customerContactId: clienteAuto.id,
        status: "released",
        openedById: operator2User.id,
        startedAt: new Date("2026-03-10"),
        completedAt: new Date("2026-03-12"),
      })
      .returning();

    // Ciclo 4: Bloqueado — saída não conforme
    const [cicloFabricacaoBloqueado] = await db
      .insert(serviceExecutionCyclesTable)
      .values({
        organizationId: org.id,
        modelId: modeloFabricacao.id,
        title: "Fabricação Lote #L-2026-088 — Flanges DN150",
        serviceOrderRef: "OP-2026-0088",
        outputIdentifier: "LOTE-FL-088",
        processId: processoFabricacao.id,
        unitId: sede.id,
        status: "blocked",
        openedById: operator2User.id,
        startedAt: new Date("2026-04-05"),
      })
      .returning();

    // Ciclo 5: Em andamento — fabricação recente
    const [cicloFabricacaoAtivo] = await db
      .insert(serviceExecutionCyclesTable)
      .values({
        organizationId: org.id,
        modelId: modeloFabricacao.id,
        title: "Fabricação Lote #L-2026-091 — Buchas de Bronze",
        serviceOrderRef: "OP-2026-0091",
        outputIdentifier: "LOTE-BZ-091",
        processId: processoFabricacao.id,
        unitId: sede.id,
        status: "in_progress",
        openedById: operator2User.id,
        startedAt: new Date("2026-04-14"),
      })
      .returning();

    console.log(`✅ Service execution cycles: 5 created`);

    // ─── 46. Cycle Checkpoints ────────────────────────────────────────────────────
    // Checkpoints do ciclo em andamento (cicloInstalacaoAtivo) — parcialmente executados
    await db.insert(serviceExecutionCycleCheckpointsTable).values({
      cycleId: cicloInstalacaoAtivo.id,
      modelCheckpointId: cpDocumentacao.id,
      kind: "checkpoint",
      label: "Conferência de documentação técnica",
      acceptanceCriteria: "Projeto aprovado, ART emitida, licenças necessárias anexadas.",
      isRequired: true,
      requiresEvidence: true,
      status: "passed",
      notes: "Documentação completa. ART #2026-4521 em anexo.",
      checkedById: operatorUser.id,
      checkedAt: new Date("2026-04-08T09:30:00"),
      sortOrder: 1,
    });

    await db.insert(serviceExecutionCycleCheckpointsTable).values({
      cycleId: cicloInstalacaoAtivo.id,
      modelCheckpointId: cpSeguranca.id,
      kind: "preventive_control",
      label: "Inspeção de segurança — EPI e área de trabalho",
      acceptanceCriteria: "EPI completo, área sinalizada, PT (permissão de trabalho) emitida.",
      isRequired: true,
      requiresEvidence: false,
      status: "passed",
      notes: "DDS realizado com 5 colaboradores. PT #PT-2026-0312 emitida.",
      checkedById: operatorUser.id,
      checkedAt: new Date("2026-04-08T07:45:00"),
      sortOrder: 2,
    });

    await db.insert(serviceExecutionCycleCheckpointsTable).values({
      cycleId: cicloInstalacaoAtivo.id,
      modelCheckpointId: cpInstalacao.id,
      kind: "checkpoint",
      label: "Inspeção de recebimento dos equipamentos",
      acceptanceCriteria: "Equipamento sem avarias, lacres intactos, nota fiscal confere.",
      isRequired: true,
      requiresEvidence: true,
      status: "passed",
      notes: "Equipamentos recebidos em perfeito estado. NF #45678 confere.",
      checkedById: operatorUser.id,
      checkedAt: new Date("2026-04-09T08:00:00"),
      sortOrder: 3,
    });

    await db.insert(serviceExecutionCycleCheckpointsTable).values({
      cycleId: cicloInstalacaoAtivo.id,
      modelCheckpointId: cpComissionamento.id,
      kind: "checkpoint",
      label: "Testes de comissionamento e partida",
      acceptanceCriteria: "Todos os parâmetros dentro dos limites especificados.",
      isRequired: true,
      requiresEvidence: true,
      status: "pending",
      sortOrder: 4,
    });

    await db.insert(serviceExecutionCycleCheckpointsTable).values({
      cycleId: cicloInstalacaoAtivo.id,
      modelCheckpointId: cpAceiteCliente.id,
      kind: "checkpoint",
      label: "Aceite formal do cliente",
      acceptanceCriteria: "Termo de aceite assinado pelo responsável técnico do cliente.",
      isRequired: true,
      requiresEvidence: true,
      status: "pending",
      sortOrder: 5,
    });

    // Checkpoints do ciclo aguardando liberação — todos passed
    await db.insert(serviceExecutionCycleCheckpointsTable).values([
      {
        cycleId: cicloInstalacaoLiberacao.id,
        modelCheckpointId: cpDocumentacao.id,
        kind: "checkpoint",
        label: "Conferência de documentação técnica",
        acceptanceCriteria: "Projeto aprovado, ART emitida, licenças necessárias anexadas.",
        isRequired: true,
        requiresEvidence: true,
        status: "passed",
        notes: "Documentação completa.",
        checkedById: operatorUser.id,
        checkedAt: new Date("2026-04-01T08:00:00"),
        sortOrder: 1,
      },
      {
        cycleId: cicloInstalacaoLiberacao.id,
        modelCheckpointId: cpSeguranca.id,
        kind: "preventive_control",
        label: "Inspeção de segurança — EPI e área de trabalho",
        acceptanceCriteria: "EPI completo, área sinalizada, PT emitida.",
        isRequired: true,
        requiresEvidence: false,
        status: "passed",
        checkedById: operatorUser.id,
        checkedAt: new Date("2026-04-01T07:30:00"),
        sortOrder: 2,
      },
      {
        cycleId: cicloInstalacaoLiberacao.id,
        modelCheckpointId: cpInstalacao.id,
        kind: "checkpoint",
        label: "Inspeção de recebimento dos equipamentos",
        acceptanceCriteria: "Equipamento sem avarias.",
        isRequired: true,
        requiresEvidence: true,
        status: "passed",
        checkedById: operatorUser.id,
        checkedAt: new Date("2026-04-02T09:00:00"),
        sortOrder: 3,
      },
      {
        cycleId: cicloInstalacaoLiberacao.id,
        modelCheckpointId: cpComissionamento.id,
        kind: "checkpoint",
        label: "Testes de comissionamento e partida",
        acceptanceCriteria: "Todos os parâmetros dentro dos limites especificados.",
        isRequired: true,
        requiresEvidence: true,
        status: "passed",
        notes: "Todos os parâmetros dentro dos limites. Relatório de testes registrado.",
        checkedById: operatorUser.id,
        checkedAt: new Date("2026-04-07T16:00:00"),
        sortOrder: 4,
      },
      {
        cycleId: cicloInstalacaoLiberacao.id,
        modelCheckpointId: cpAceiteCliente.id,
        kind: "checkpoint",
        label: "Aceite formal do cliente",
        acceptanceCriteria: "Termo de aceite assinado.",
        isRequired: true,
        requiresEvidence: true,
        status: "passed",
        notes: "Aceite assinado pela Dra. Carla Mendonça em 07/04/2026.",
        checkedById: operatorUser.id,
        checkedAt: new Date("2026-04-07T17:30:00"),
        sortOrder: 5,
      },
    ]);

    // Checkpoints do ciclo liberado (manutenção) — todos passed
    await db.insert(serviceExecutionCycleCheckpointsTable).values([
      {
        cycleId: cicloManutencaoLiberado.id,
        kind: "preventive_control",
        label: "Verificação de bloqueio e travamento (LOTO)",
        acceptanceCriteria: "Energia isolada, travamento aplicado, testado.",
        isRequired: true,
        requiresEvidence: false,
        status: "passed",
        checkedById: operator2User.id,
        checkedAt: new Date("2026-03-10T08:00:00"),
        sortOrder: 1,
      },
      {
        cycleId: cicloManutencaoLiberado.id,
        kind: "checkpoint",
        label: "Inspeção visual dos componentes",
        acceptanceCriteria: "Sem desgaste excessivo ou avaria estrutural.",
        isRequired: true,
        requiresEvidence: true,
        status: "passed",
        notes: "Filtros substituídos. Rolamentos com desgaste normal.",
        checkedById: operator2User.id,
        checkedAt: new Date("2026-03-10T10:00:00"),
        sortOrder: 2,
      },
      {
        cycleId: cicloManutencaoLiberado.id,
        kind: "checkpoint",
        label: "Testes funcionais pós-manutenção",
        acceptanceCriteria: "Equipamento opera dentro dos parâmetros nominais.",
        isRequired: true,
        requiresEvidence: true,
        status: "passed",
        notes: "Pressão: 8,2 bar. Temperatura: 42°C. Dentro dos parâmetros nominais.",
        checkedById: operator2User.id,
        checkedAt: new Date("2026-03-12T14:00:00"),
        sortOrder: 3,
      },
    ]);

    // Checkpoints do ciclo bloqueado (fabricação) — com falha
    await db.insert(serviceExecutionCycleCheckpointsTable).values([
      {
        cycleId: cicloFabricacaoBloqueado.id,
        kind: "checkpoint",
        label: "Inspeção de matéria-prima",
        acceptanceCriteria: "Material conforme certificado de qualidade.",
        isRequired: true,
        requiresEvidence: true,
        status: "passed",
        notes: "Certificado de qualidade do aço conferido.",
        checkedById: operator2User.id,
        checkedAt: new Date("2026-04-05T08:00:00"),
        sortOrder: 1,
      },
      {
        cycleId: cicloFabricacaoBloqueado.id,
        kind: "checkpoint",
        label: "Controle dimensional em processo",
        acceptanceCriteria: "Dimensões dentro das tolerâncias do desenho técnico.",
        isRequired: true,
        requiresEvidence: false,
        status: "failed",
        notes: "Diâmetro externo fora de tolerância em 3 peças do lote. Desvio de +0,15mm (tolerância ±0,05mm).",
        checkedById: operator2User.id,
        checkedAt: new Date("2026-04-07T11:00:00"),
        sortOrder: 2,
      },
      {
        cycleId: cicloFabricacaoBloqueado.id,
        kind: "checkpoint",
        label: "Inspeção final do lote",
        acceptanceCriteria: "100% das peças inspecionadas conforme AQL.",
        isRequired: true,
        requiresEvidence: true,
        status: "failed",
        notes: "Lote reprovado na inspeção dimensional. 3 de 20 peças com desvio.",
        checkedById: operator2User.id,
        checkedAt: new Date("2026-04-07T14:30:00"),
        sortOrder: 3,
      },
    ]);

    console.log(`✅ Cycle checkpoints created`);

    // ─── 47. Release Records ──────────────────────────────────────────────────────
    // Liberação do ciclo de manutenção (approved)
    await db.insert(serviceReleaseRecordsTable).values({
      cycleId: cicloManutencaoLiberado.id,
      decision: "approved",
      decisionNotes:
        "Todos os checkpoints atendidos. Relatório de manutenção e testes funcionais em ordem. Saída liberada para entrega ao cliente.",
      blockingIssues: [],
      decidedById: adminUser.id,
      decidedAt: new Date("2026-03-12T15:30:00"),
    });

    // Liberação pendente — ciclo aguardando liberação (nenhum registro ainda, ciclo está awaiting_release)

    console.log(`✅ Release records: 1 created`);

    // ─── 48. Nonconforming Outputs ────────────────────────────────────────────────
    // NC do ciclo de fabricação bloqueado
    await db.insert(serviceNonconformingOutputsTable).values({
      organizationId: org.id,
      cycleId: cicloFabricacaoBloqueado.id,
      title: "Desvio dimensional — Flanges DN150 Lote L-2026-088",
      description:
        "3 flanges de 20 apresentaram desvio no diâmetro externo de +0,15mm, excedendo a tolerância de ±0,05mm. Identificado na inspeção dimensional em processo.",
      impact:
        "Risco de incompatibilidade na montagem. Possível comprometimento da vedação no cliente.",
      status: "in_treatment",
      disposition: "reworked",
      dispositionNotes:
        "As 3 peças serão submetidas a reusino para correção dimensional. Restante do lote (17 peças) aprovado e segregado.",
      responsibleUserId: operator2User.id,
      detectedById: operator2User.id,
      detectedAt: new Date("2026-04-07T11:00:00"),
      createdById: operator2User.id,
      updatedById: operator2User.id,
    });

    // NC de manutenção (histórica, resolvida)
    await db.insert(serviceNonconformingOutputsTable).values({
      organizationId: org.id,
      cycleId: cicloManutencaoLiberado.id,
      title: "Vazamento residual identificado pós-partida — Compressor #3",
      description:
        "Após a manutenção preventiva, identificado vazamento de óleo no compressor #3 durante o teste funcional. Ponto de vazamento: gaxeta do cabeçote.",
      impact: "Operação do equipamento comprometida. Risco de parada não planejada.",
      status: "resolved",
      disposition: "reworked",
      dispositionNotes:
        "Gaxeta substituída imediatamente. Novo teste funcional realizado com sucesso. Liberação mantida.",
      responsibleUserId: operator2User.id,
      detectedById: operator2User.id,
      detectedAt: new Date("2026-03-12T14:30:00"),
      resolvedAt: new Date("2026-03-12T15:00:00"),
      createdById: operator2User.id,
      updatedById: operator2User.id,
    });

    console.log(`✅ Nonconforming outputs: 2 created`);

    // ─── 49. Third Party Properties ───────────────────────────────────────────────
    // Propriedade do cliente durante a instalação ativa
    await db.insert(serviceThirdPartyPropertiesTable).values({
      organizationId: org.id,
      cycleId: cicloInstalacaoAtivo.id,
      title: "Painel elétrico de controle — AutoMotiva",
      ownerName: "AutoMotiva Indústria S.A.",
      description:
        "Painel elétrico de controle da linha de montagem fornecido pelo cliente para integração ao sistema.",
      conditionOnReceipt: "Bom estado. Sem avarias visíveis. Lacrado de fábrica.",
      handlingRequirements:
        "Manter em ambiente seco. Não empilhar. Instalar conforme diagrama fornecido.",
      status: "in_use",
      responsibleUserId: operatorUser.id,
      registeredById: operatorUser.id,
      receivedAt: new Date("2026-04-09T10:00:00"),
    });

    // Propriedade devolvida na instalação liberada
    await db.insert(serviceThirdPartyPropertiesTable).values({
      organizationId: org.id,
      cycleId: cicloInstalacaoLiberacao.id,
      title: "Ferramentas especiais de alta tensão — EnergiaTec",
      ownerName: "EnergiaTec Sistemas",
      description:
        "Kit de ferramentas dielétricas para 36kV fornecidas pelo cliente. Utilizadas para instalação dos painéis.",
      conditionOnReceipt: "Excelente estado. Kits completos e calibrados.",
      status: "returned",
      responsibleUserId: operatorUser.id,
      registeredById: operatorUser.id,
      receivedAt: new Date("2026-04-01T09:00:00"),
      returnedAt: new Date("2026-04-07T18:00:00"),
    });

    console.log(`✅ Third party properties: 2 created`);

    // ─── 50. Preservation & Delivery Records ─────────────────────────────────────
    // Registro do ciclo liberado (manutenção)
    await db.insert(servicePreservationDeliveryRecordsTable).values({
      organizationId: org.id,
      cycleId: cicloManutencaoLiberado.id,
      preservationNotes:
        "Componentes substituídos embalados e identificados. Peças antigas retidas para análise.",
      preservationMethod: "Embalagem individual em plástico bolha + caixa papelão identificada.",
      packagingNotes: "Relatório técnico impresso em 2 vias e digitalizado.",
      deliveryNotes: "Entrega realizada ao responsável de manutenção do cliente.",
      deliveryRecipient: "Eng. Rafael Borges — AutoMotiva",
      deliveryMethod: "Entrega presencial na planta",
      deliveredById: operator2User.id,
      preservedAt: new Date("2026-03-12T14:00:00"),
      deliveredAt: new Date("2026-03-12T16:00:00"),
      createdById: operator2User.id,
      updatedById: operator2User.id,
    });

    console.log(`✅ Preservation & delivery record: 1 created`);

    // ─── 51. Post Delivery Events ─────────────────────────────────────────────────
    // Evento de monitoramento pós-entrega (manutenção liberada)
    await db.insert(servicePostDeliveryEventsTable).values({
      organizationId: org.id,
      cycleId: cicloManutencaoLiberado.id,
      eventType: "monitoring",
      title: "Acompanhamento 7 dias — Compressores AutoMotiva",
      description:
        "Monitoramento remoto realizado 7 dias após a manutenção preventiva. Verificação de parâmetros de pressão e temperatura via dados do cliente.",
      status: "closed",
      followUpNotes:
        "Todos os parâmetros estáveis. Pressão: 8,1-8,3 bar. Temperatura: 40-44°C. Sem ocorrências.",
      responsibleUserId: operator2User.id,
      occurredAt: new Date("2026-03-19T10:00:00"),
      closedAt: new Date("2026-03-19T11:00:00"),
      createdById: operator2User.id,
      updatedById: operator2User.id,
    });

    // Reclamação aberta pós-entrega (instalação liberada)
    await db.insert(servicePostDeliveryEventsTable).values({
      organizationId: org.id,
      cycleId: cicloInstalacaoLiberacao.id,
      eventType: "complaint",
      title: "Reclamação — Alarme de temperatura intermitente",
      description:
        "Cliente EnergiaTec relata alarme de temperatura intermitente nos painéis instalados, ocorrendo 3x na semana após a entrega.",
      status: "in_follow_up",
      followUpNotes:
        "Técnico deslocado ao local. Investigação em andamento. Suspeita de sensor de temperatura com defeito de fábrica.",
      responsibleUserId: operatorUser.id,
      occurredAt: new Date("2026-04-14T09:00:00"),
      createdById: operatorUser.id,
      updatedById: operatorUser.id,
    });

    console.log(`✅ Post delivery events: 2 created`);

    // ─── Summary (Ciclo E) ─────────────────────────────────────────────────────────
    console.log(`✅ Ciclo E — Produção/Prestação de Serviços:`);
    console.log(`   SGQ Processes: 3`);
    console.log(`   Organization contacts: 2`);
    console.log(`   Execution models: 3 (with checkpoints)`);
    console.log(`   Special validation: 1 profile + 1 event`);
    console.log(`   Execution cycles: 5 (in_progress×2, awaiting_release×1, released×1, blocked×1)`);
    console.log(`   Release records: 1`);
    console.log(`   Nonconforming outputs: 2`);
    console.log(`   Third party properties: 2`);
    console.log(`   Preservation/delivery: 1`);
    console.log(`   Post delivery events: 2`);

    // ─── Summary ──────────────────────────────────────────────────────────────────
    console.log("\n" + "═".repeat(60));
    console.log("  SEED COMPLETE — All tables populated!");
    console.log("═".repeat(60));
    console.log(`
  Organization:     1  (${org.name})
  Users:            4  (admin, operator, analyst, operator2)
  Module perms:     ${allModules.length + 3 + 2 + 3} assigned
  Units:            3  (sede + 2 filiais)
  Departments:      ${departments.length}
  Positions:        ${positions.length}
  Employees:        ${employees.length}
  Employee units:   2  (secondary assignments)
  Profile items:    ${createdProfileItems.length}
  Profile attachm:  2
  Competencies:     ${competencies.length}
  Trainings:        ${trainings.length}
  Awareness:        ${awarenessRecords.length}
  Legislations:     ${createdLegs.length}
  Unit-leg assigns: ${createdUnitLegs.length}
  Evidence attachm: 3
  Documents:        ${docs.length}
  Doc versions:     ${docVersions.length}
  Doc attachments:  3
  Questionnaire:    3 themes, ${questions.length} questions
  Quest responses:  ${responses.length}
  Compliance tags:  ${complianceTags.length}
  Conversations:    2 (with ${6} messages)
  Notifications:    ${notificationValues.length}
  Invitations:      2
  Strategic plan:   1 (with SWOT, parties, objectives, actions)
  SWOT items:       ${createdSwot.length}
  Interested party: ${parties.length}
  Objectives:       ${createdObjectives.length}
  Actions:          ${createdActions.length}
  Plan revisions:   1
  KB articles:      ${createdArticles.length}
  KB revisions:     2
  P&D decisão:      1  (aplicável, aprovada)
  P&D projetos:     2  (1 ativo, 1 concluído)
  `);
    if (process.env.SEED_DEMO_PRINT_CREDS === "true") {
      console.log(`
  Login credentials:
    admin@example.com   / demo123 (org_admin)
    ana@example.com     / demo123 (operator)
    pedro@example.com   / demo123 (analyst)
    mariana@example.com / demo123 (operator)
    `);
    }
  });
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });

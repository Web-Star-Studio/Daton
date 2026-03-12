import { db, organizationsTable, usersTable, unitsTable, legislationsTable, unitLegislationsTable } from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  const [org] = await db.insert(organizationsTable).values({
    name: "Empresa Demo LTDA",
  }).returning();
  console.log(`Created organization: ${org.name} (id: ${org.id})`);

  const passwordHash = await bcrypt.hash("demo123", 10);
  const [user] = await db.insert(usersTable).values({
    name: "Admin Demo",
    email: "admin@demo.com",
    passwordHash,
    organizationId: org.id,
  }).returning();
  console.log(`Created user: ${user.email} (id: ${user.id})`);

  const [sede] = await db.insert(unitsTable).values({
    organizationId: org.id,
    name: "Sede Principal",
    type: "sede",
    address: "Av. Paulista, 1000",
    city: "São Paulo",
    state: "SP",
  }).returning();

  const [filial] = await db.insert(unitsTable).values({
    organizationId: org.id,
    name: "Filial Rio de Janeiro",
    type: "filial",
    address: "Rua da Assembleia, 50",
    city: "Rio de Janeiro",
    state: "RJ",
  }).returning();

  const [filial2] = await db.insert(unitsTable).values({
    organizationId: org.id,
    name: "Filial Belo Horizonte",
    type: "filial",
    address: "Av. Afonso Pena, 1500",
    city: "Belo Horizonte",
    state: "MG",
  }).returning();

  console.log(`Created units: ${sede.name}, ${filial.name}, ${filial2.name}`);

  const legislations = [
    {
      title: "Política Nacional do Meio Ambiente",
      number: "Lei 6.938/1981",
      description: "Dispõe sobre a Política Nacional do Meio Ambiente, seus fins e mecanismos de formulação e aplicação.",
      level: "federal",
      status: "vigente",
      publicationDate: "1981-08-31",
      sourceUrl: "https://www.planalto.gov.br/ccivil_03/leis/l6938.htm",
      applicableArticles: "Art. 2°, Art. 4°, Art. 9°, Art. 10",
    },
    {
      title: "Política Nacional de Resíduos Sólidos",
      number: "Lei 12.305/2010",
      description: "Institui a Política Nacional de Resíduos Sólidos; altera a Lei 9.605/1998.",
      level: "federal",
      status: "vigente",
      publicationDate: "2010-08-02",
      sourceUrl: "https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/lei/l12305.htm",
      applicableArticles: "Art. 3°, Art. 6°, Art. 9°, Art. 20, Art. 33",
    },
    {
      title: "Dispõe sobre padrões de qualidade do ar",
      number: "Resolução CONAMA 491/2018",
      description: "Dispõe sobre padrões de qualidade do ar e dá outras providências.",
      level: "federal",
      status: "vigente",
      publicationDate: "2018-11-19",
      sourceUrl: "https://www.in.gov.br/materia/-/asset_publisher/Kujrw0TZC2Mb/content/id/51058895",
      applicableArticles: "Art. 3°, Art. 4°, Anexo I",
    },
    {
      title: "Dispõe sobre o controle e fiscalização de atividades potencialmente poluidoras",
      number: "Resolução CONAMA 237/1997",
      description: "Regulamenta os aspectos de licenciamento ambiental estabelecidos na Política Nacional do Meio Ambiente.",
      level: "federal",
      status: "vigente",
      publicationDate: "1997-12-19",
      sourceUrl: "https://www.ibama.gov.br/sophia/cnia/legislacao/MMA/RE0237-191297.PDF",
      applicableArticles: "Art. 1°, Art. 2°, Art. 8°, Art. 10",
    },
    {
      title: "Normas de Segurança e Saúde no Trabalho",
      number: "NR-9 / Portaria 6.735/2020",
      description: "Programa de Gerenciamento de Riscos. Avaliação e controle das exposições ocupacionais a agentes físicos, químicos e biológicos.",
      level: "federal",
      status: "vigente",
      publicationDate: "2020-03-12",
      sourceUrl: "https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadoras/normas-regulamentadoras-vigentes/norma-regulamentadora-no-9-nr-9",
      applicableArticles: "Item 9.1, Item 9.3, Item 9.5",
    },
    {
      title: "Política Estadual de Mudanças Climáticas",
      number: "Lei 13.798/2009 (SP)",
      description: "Institui a Política Estadual de Mudanças Climáticas do Estado de São Paulo.",
      level: "estadual",
      status: "vigente",
      publicationDate: "2009-11-09",
      sourceUrl: "https://www.al.sp.gov.br/repositorio/legislacao/lei/2009/lei-13798-09.11.2009.html",
      applicableArticles: "Art. 5°, Art. 6°, Art. 32",
    },
    {
      title: "Código de Posturas do Município de São Paulo",
      number: "Lei 13.725/2004",
      description: "Institui o Código Sanitário do Município de São Paulo e dá outras providências.",
      level: "municipal",
      status: "vigente",
      publicationDate: "2004-01-09",
      applicableArticles: "Capítulo III, Seção II",
    },
    {
      title: "ISO 14001:2015",
      number: "ISO 14001:2015",
      description: "Sistemas de gestão ambiental — Requisitos com orientações para uso. Norma internacional para sistemas de gestão ambiental.",
      level: "internacional",
      status: "vigente",
      publicationDate: "2015-09-15",
      sourceUrl: "https://www.iso.org/standard/60857.html",
      applicableArticles: "Cláusula 4, 5, 6, 7, 8, 9, 10",
    },
  ];

  const createdLegs = [];
  for (const leg of legislations) {
    const [created] = await db.insert(legislationsTable).values({
      ...leg,
      organizationId: org.id,
    }).returning();
    createdLegs.push(created);
  }
  console.log(`Created ${createdLegs.length} legislations`);

  const assignments = [
    { unitId: sede.id, legislationId: createdLegs[0].id, complianceStatus: "conforme", notes: "Licença ambiental em dia" },
    { unitId: sede.id, legislationId: createdLegs[1].id, complianceStatus: "parcialmente_conforme", notes: "Plano de gerenciamento em elaboração" },
    { unitId: sede.id, legislationId: createdLegs[2].id, complianceStatus: "conforme", notes: "Monitoramento realizado trimestralmente" },
    { unitId: sede.id, legislationId: createdLegs[3].id, complianceStatus: "conforme", notes: "Licença vigente" },
    { unitId: sede.id, legislationId: createdLegs[4].id, complianceStatus: "conforme", notes: "PGR atualizado em 2025" },
    { unitId: sede.id, legislationId: createdLegs[7].id, complianceStatus: "parcialmente_conforme", notes: "Certificação ISO 14001 em andamento" },
    { unitId: filial.id, legislationId: createdLegs[0].id, complianceStatus: "nao_avaliado" },
    { unitId: filial.id, legislationId: createdLegs[1].id, complianceStatus: "nao_conforme", notes: "Aguardando implementação do plano" },
    { unitId: filial.id, legislationId: createdLegs[4].id, complianceStatus: "conforme", notes: "PGR implementado" },
    { unitId: filial2.id, legislationId: createdLegs[0].id, complianceStatus: "conforme" },
    { unitId: filial2.id, legislationId: createdLegs[3].id, complianceStatus: "nao_avaliado" },
  ];

  for (const a of assignments) {
    await db.insert(unitLegislationsTable).values({
      ...a,
      evaluatedAt: a.complianceStatus !== "nao_avaliado" ? new Date() : null,
    });
  }
  console.log(`Created ${assignments.length} unit-legislation assignments`);

  console.log("\nSeed complete!");
  console.log("Login credentials: admin@demo.com / demo123");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

import { NORMA_OPTIONS, summarizeDocuments } from "@/lib/document-list";

it("NORMA_OPTIONS traz as 3 normas fixas", () => {
  expect(NORMA_OPTIONS).toEqual(["ISO 9001:2015", "ISO 14001:2015", "ISO 39001:2012"]);
});

it("summarizeDocuments conta por situação", () => {
  const r = summarizeDocuments([
    { status: "published" }, { status: "approved" }, { status: "distributed" },
    { status: "in_review" }, { status: "draft" }, { status: "rejected" },
  ]);
  expect(r).toEqual({ total: 6, vigentes: 3, emRevisao: 1, rascunho: 2 });
});

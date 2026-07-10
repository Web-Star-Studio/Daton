import { describe, expect, it, vi } from "vitest";
import {
  createRequirementsForPositions,
  describeBatchResult,
  resolveBatchOutcome,
} from "@/lib/training-requirements-batch";

describe("createRequirementsForPositions", () => {
  it("creates one requirement per position and counts them", async () => {
    const createOne = vi.fn().mockResolvedValue({ id: 1 });

    const result = await createRequirementsForPositions([10, 20, 30], createOne);

    expect(result).toEqual({ created: 3, skipped: 0, failed: 0 });
    expect(createOne).toHaveBeenCalledTimes(3);
    // Called once per position, in order, with the position id.
    expect(createOne.mock.calls.map((c) => c[0])).toEqual([10, 20, 30]);
  });

  it("counts a 409 (duplicate) as skipped, not failed, and keeps going", async () => {
    const createOne = vi.fn(async (positionId: number) => {
      if (positionId === 20) throw { status: 409, message: "duplicate" };
      return { id: positionId };
    });

    const result = await createRequirementsForPositions([10, 20, 30], createOne);

    expect(result).toEqual({ created: 2, skipped: 1, failed: 0 });
    // The duplicate does not abort the batch — 30 is still attempted.
    expect(createOne).toHaveBeenCalledTimes(3);
  });

  it("counts a non-409 error as failed and keeps going", async () => {
    const createOne = vi.fn(async (positionId: number) => {
      if (positionId === 10) throw { status: 500, message: "boom" };
      if (positionId === 30) throw new Error("network");
      return { id: positionId };
    });

    const result = await createRequirementsForPositions([10, 20, 30], createOne);

    expect(result).toEqual({ created: 1, skipped: 0, failed: 2 });
    expect(createOne).toHaveBeenCalledTimes(3);
  });

  it("does nothing for an empty list", async () => {
    const createOne = vi.fn();

    const result = await createRequirementsForPositions([], createOne);

    expect(result).toEqual({ created: 0, skipped: 0, failed: 0 });
    expect(createOne).not.toHaveBeenCalled();
  });
});

describe("describeBatchResult", () => {
  it("describes a plain successful batch (plural)", () => {
    expect(describeBatchResult({ created: 5, skipped: 0, failed: 0 })).toBe(
      "5 obrigatoriedades criadas",
    );
  });

  it("uses the singular for a single creation", () => {
    expect(describeBatchResult({ created: 1, skipped: 0, failed: 0 })).toBe(
      "1 obrigatoriedade criada",
    );
  });

  it("mentions duplicates that were skipped", () => {
    expect(describeBatchResult({ created: 5, skipped: 2, failed: 0 })).toBe(
      "5 obrigatoriedades criadas · 2 já existiam",
    );
  });

  it("reads well when nothing was new (all duplicates)", () => {
    expect(describeBatchResult({ created: 0, skipped: 3, failed: 0 })).toBe(
      "Nenhuma nova · 3 já existiam",
    );
  });

  it("reports failures with singular/plural agreement", () => {
    expect(describeBatchResult({ created: 3, skipped: 1, failed: 1 })).toBe(
      "3 obrigatoriedades criadas · 1 já existia · 1 falhou",
    );
    expect(describeBatchResult({ created: 0, skipped: 0, failed: 2 })).toBe(
      "2 falharam",
    );
  });
});

describe("resolveBatchOutcome", () => {
  it("closes with a success toast when everything created", () => {
    expect(resolveBatchOutcome({ created: 5, skipped: 0, failed: 0 })).toEqual({
      title: "Obrigatoriedades salvas",
      destructive: false,
      close: true,
    });
  });

  it("still succeeds and closes when the rest were duplicates", () => {
    expect(resolveBatchOutcome({ created: 5, skipped: 2, failed: 0 })).toEqual({
      title: "Obrigatoriedades salvas",
      destructive: false,
      close: true,
    });
  });

  it("closes quietly when there was nothing new (all duplicates)", () => {
    expect(resolveBatchOutcome({ created: 0, skipped: 3, failed: 0 })).toEqual({
      title: "Nada a criar",
      destructive: false,
      close: true,
    });
  });

  it("keeps the dialog open on a full failure so the user can retry", () => {
    expect(resolveBatchOutcome({ created: 0, skipped: 0, failed: 2 })).toEqual({
      title: "Não foi possível salvar",
      destructive: true,
      close: false,
    });
  });

  it("keeps the dialog open on a partial failure and flags it as partial", () => {
    // The successful ones persist; retrying re-sends all and the created ones
    // simply come back as duplicates (409), so keeping it open is safe.
    expect(resolveBatchOutcome({ created: 3, skipped: 1, failed: 1 })).toEqual({
      title: "Salvo parcialmente",
      destructive: true,
      close: false,
    });
  });
});

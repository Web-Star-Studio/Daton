/**
 * Batch-create training requirements, one per selected position.
 *
 * The obrigatoriedade dialog lets the user pick several cargos at once; each one
 * becomes its own row in `training_requirements` (the table is one row per
 * position+treinamento+escopo). We reuse the single-create endpoint per position
 * instead of a bulk endpoint, so this helper just drives the loop and tallies the
 * outcome. A 409 means that cargo already has this requirement — expected, counted
 * as "skipped" rather than a failure — and one failing item never aborts the rest.
 */
export type BatchResult = { created: number; skipped: number; failed: number };

function isDuplicateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 409
  );
}

export async function createRequirementsForPositions(
  positionIds: number[],
  createOne: (positionId: number) => Promise<unknown>,
): Promise<BatchResult> {
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const positionId of positionIds) {
    try {
      await createOne(positionId);
      created += 1;
    } catch (error) {
      if (isDuplicateError(error)) skipped += 1;
      else failed += 1;
    }
  }

  return { created, skipped, failed };
}

/** Human-readable, PT-BR summary of a batch outcome (used as a toast message). */
export function describeBatchResult({
  created,
  skipped,
  failed,
}: BatchResult): string {
  const parts: string[] = [];

  if (created > 0) {
    parts.push(
      created === 1
        ? "1 obrigatoriedade criada"
        : `${created} obrigatoriedades criadas`,
    );
  } else if (skipped > 0) {
    // Nothing new, but the batch wasn't empty — lead with that so the toast reads
    // as an outcome ("Nenhuma nova · 3 já existiam") rather than a bare count.
    parts.push("Nenhuma nova");
  }

  if (skipped > 0) {
    parts.push(skipped === 1 ? "1 já existia" : `${skipped} já existiam`);
  }

  if (failed > 0) {
    parts.push(failed === 1 ? "1 falhou" : `${failed} falharam`);
  }

  return parts.join(" · ");
}

/**
 * Decide how the dialog should react to a batch outcome: toast title, whether it
 * is an error/warning, and whether to close. Any real failure (não-duplicado)
 * keeps the dialog open so the user can retry the failed cargos — retry is safe
 * because the ones already created come back as duplicates (409 → "já existia").
 */
export function resolveBatchOutcome({ created, failed }: BatchResult): {
  title: string;
  destructive: boolean;
  close: boolean;
} {
  if (failed > 0) {
    return {
      title: created > 0 ? "Salvo parcialmente" : "Não foi possível salvar",
      destructive: true,
      close: false,
    };
  }
  if (created > 0) {
    return { title: "Obrigatoriedades salvas", destructive: false, close: true };
  }
  return { title: "Nada a criar", destructive: false, close: true };
}

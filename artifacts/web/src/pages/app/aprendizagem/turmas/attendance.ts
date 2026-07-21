/**
 * Vocabulário de presença, compartilhado entre a aba Presença e o assistente
 * de encerramento — as duas telas precisam nomear o mesmo estado do mesmo
 * jeito, senão "não preenchido" some numa e aparece na outra.
 */
export type Attendance = "presente" | "faltou";

/** `undefined` = presença ainda não definida (nem presente, nem falta). */
export function toAttendance(
  value: string | null | undefined,
): Attendance | undefined {
  return value === "presente" || value === "faltou" ? value : undefined;
}

export const ATTENDANCE_LABEL: Record<Attendance, string> = {
  presente: "Presente",
  faltou: "Faltou",
};

/**
 * Rótulo do estado indefinido. É o estado que gerava turma concluída sem
 * registro de treinamento, então ele precisa ter nome e cor próprios — não
 * pode ser a ausência de marcação.
 */
export const ATTENDANCE_PENDING_LABEL = "Pendente";

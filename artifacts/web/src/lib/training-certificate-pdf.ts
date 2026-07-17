import { jsPDF } from "jspdf";

/**
 * Certificado de conclusão de treinamento (PDF), gerado no navegador com jsPDF —
 * mesmo padrão de `document-pdf.ts`. É evidência de competência (ISO 9001:2015
 * §7.2), por isso só faz sentido para treino concluído e com data de conclusão.
 *
 * A geração é dividida em duas partes para testabilidade: `buildCertificateContent`
 * é pura (resolve todas as strings/linhas condicionais e o nome do arquivo) e
 * `downloadTrainingCertificate` só desenha o resultado no jsPDF e baixa.
 */

export interface CertificateInput {
  /** Nome de exibição da empresa, já resolvido (tradeName ?? name). */
  orgName: string;
  employeeName: string;
  employeeCpf?: string | null;
  employeePosition?: string | null;
  /** Título do treinamento (não a definição editável — só exibição). */
  title: string;
  /** Data de conclusão, `YYYY-MM-DD`. */
  completionDate?: string | null;
  workloadHours?: number | null;
  institution?: string | null;
  /** Instrutor (funcionário ou palestrante externo). */
  instructor?: string | null;
  /** Validade, `YYYY-MM-DD`. */
  expirationDate?: string | null;
  competencyName?: string | null;
}

export interface CertificateContent {
  orgName: string;
  title: string;
  intro: string;
  employeeName: string;
  /** "Cargo · CPF 000.000.000-00", só o cargo, ou null (nenhum dos dois). */
  subjectLine: string | null;
  trainingIntro: string;
  trainingTitle: string;
  /** "em 10/01/2026 · carga horária de 8 horas" (partes condicionais). */
  completionLine: string;
  /** Linhas extras condicionais: instituição/validade e competência. */
  extraLines: string[];
  /** Nome do assinante (avaliador) ou null → assinatura em branco. */
  signerName: string | null;
  signerRole: string;
  issueLine: string;
  footer: string;
  filename: string;
}

/** `00000000000` → `000.000.000-00`; null se não tiver 11 dígitos. */
export function formatCpf(cpf?: string | null): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** `YYYY-MM-DD` (ou ISO completo) → `DD/MM/YYYY`, sem `new Date` (evita fuso). */
export function formatDateBr(iso?: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return null;
  return `${d}/${m}/${y}`;
}

/** Carga horária pt-BR: "1 hora", "2 horas", "1,5 horas"; null se ausente/zero. */
export function formatWorkloadHours(hours?: number | null): string | null {
  if (hours == null || hours <= 0) return null;
  const rounded = Math.round(hours * 100) / 100;
  const formatted = rounded.toString().replace(".", ",");
  return `${formatted} ${rounded === 1 ? "hora" : "horas"}`;
}

function sanitizeForFilename(value: string): string {
  return value
    .replace(/[/\\:?*|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildCertificateContent(
  input: CertificateInput,
  issueDate: string,
): CertificateContent {
  const cpf = formatCpf(input.employeeCpf);
  const position = input.employeePosition?.trim() || null;
  const subjectParts: string[] = [];
  if (position) subjectParts.push(position);
  if (cpf) subjectParts.push(`CPF ${cpf}`);
  const subjectLine = subjectParts.length ? subjectParts.join(" · ") : null;

  const completionParts: string[] = [];
  const completionBr = formatDateBr(input.completionDate);
  if (completionBr) completionParts.push(`em ${completionBr}`);
  const workload = formatWorkloadHours(input.workloadHours);
  if (workload) completionParts.push(`carga horária de ${workload}`);

  const infoParts: string[] = [];
  if (input.institution?.trim())
    infoParts.push(`Instituição: ${input.institution.trim()}`);
  const validityBr = formatDateBr(input.expirationDate);
  if (validityBr) infoParts.push(`Validade: ${validityBr}`);
  const extraLines: string[] = [];
  if (infoParts.length) extraLines.push(infoParts.join(" · "));
  if (input.competencyName?.trim())
    extraLines.push(`Competência: ${input.competencyName.trim()}`);

  const title = sanitizeForFilename(input.title) || "Treinamento";
  const name = sanitizeForFilename(input.employeeName) || "Colaborador";

  return {
    orgName: input.orgName?.trim() || "",
    title: "CERTIFICADO DE CONCLUSÃO",
    intro: "Certificamos que",
    employeeName: input.employeeName.trim(),
    subjectLine,
    trainingIntro: "concluiu o treinamento",
    trainingTitle: input.title,
    completionLine: completionParts.join(" · "),
    extraLines,
    signerName: input.instructor?.trim() || null,
    signerRole: "Instrutor",
    issueLine: `Emitido em ${formatDateBr(issueDate) ?? issueDate}`,
    footer: "Registro conforme ISO 9001:2015 §7.2",
    filename: `Certificado - ${title} - ${name}.pdf`,
  };
}

/** Desenha o certificado (A4 paisagem, borda dupla, centralizado) e baixa. */
export async function downloadTrainingCertificate(
  input: CertificateInput,
): Promise<void> {
  const issueDate = new Date().toISOString().split("T")[0];
  const content = buildCertificateContent(input, issueDate);

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  // Fonte de assinatura (cursiva), carregada sob demanda para não pesar o bundle
  // principal. Se falhar, cai numa serifada em itálico (não quebra a geração).
  let signatureFont = "times";
  let signatureStyle: "normal" | "italic" = "italic";
  try {
    const { SIGNATURE_FONT_NAME, SIGNATURE_FONT_BASE64 } = await import(
      "./training-certificate-signature-font"
    );
    doc.addFileToVFS(`${SIGNATURE_FONT_NAME}.ttf`, SIGNATURE_FONT_BASE64);
    doc.addFont(`${SIGNATURE_FONT_NAME}.ttf`, SIGNATURE_FONT_NAME, "normal");
    signatureFont = SIGNATURE_FONT_NAME;
    signatureStyle = "normal";
  } catch {
    // mantém o fallback (times/italic)
  }

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cx = pageW / 2;

  // Borda decorativa dupla.
  doc.setDrawColor(170);
  doc.setLineWidth(2);
  doc.rect(28, 28, pageW - 56, pageH - 56);
  doc.setLineWidth(0.5);
  doc.rect(36, 36, pageW - 72, pageH - 72);

  // Cada linha é centralizada e, se passar da largura útil (dentro da borda),
  // a fonte encolhe até caber — evita que títulos longos (comuns nos treinos,
  // ex.: nomes de MOPP) transbordem a borda no A4 paisagem.
  const maxTextWidth = pageW - 120;
  const center = (
    text: string,
    y: number,
    size: number,
    style: "normal" | "bold" | "italic" = "normal",
    color = 40,
  ) => {
    if (!text) return;
    doc.setFont("helvetica", style);
    let fontSize = size;
    doc.setFontSize(fontSize);
    while (fontSize > 8 && doc.getTextWidth(text) > maxTextWidth) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
    doc.setTextColor(color);
    doc.text(text, cx, y, { align: "center" });
  };

  let y = 108;
  center(content.orgName.toUpperCase(), y, 16, "bold", 90);
  y += 48;
  center(content.title, y, 26, "bold", 30);
  y += 18;
  doc.setDrawColor(120);
  doc.setLineWidth(1.2);
  doc.line(cx - 70, y, cx + 70, y);
  y += 42;
  center(content.intro, y, 12, "normal", 90);
  y += 40;
  center(content.employeeName, y, 26, "bold", 20);
  y += 26;
  if (content.subjectLine) {
    center(content.subjectLine, y, 12, "normal", 90);
    y += 32;
  } else {
    y += 10;
  }
  center(content.trainingIntro, y, 12, "normal", 90);
  y += 26;
  center(content.trainingTitle, y, 17, "bold", 30);
  y += 28;
  center(content.completionLine, y, 12, "normal", 60);
  y += 20;
  for (const line of content.extraLines) {
    center(line, y, 11, "normal", 90);
    y += 18;
  }

  // Assinatura, fixada perto da base. O nome do instrutor sai em fonte cursiva
  // SOBRE a linha (como uma assinatura à mão); o rótulo "Instrutor" fica abaixo.
  const sigY = pageH - 108;
  if (content.signerName) {
    doc.setFont(signatureFont, signatureStyle);
    let sigSize = 28;
    doc.setFontSize(sigSize);
    while (
      sigSize > 12 &&
      doc.getTextWidth(content.signerName) > maxTextWidth
    ) {
      sigSize -= 1;
      doc.setFontSize(sigSize);
    }
    doc.setTextColor(30);
    doc.text(content.signerName, cx, sigY - 8, { align: "center" });
  }
  doc.setDrawColor(120);
  doc.setLineWidth(0.8);
  doc.line(cx - 120, sigY, cx + 120, sigY);
  center(content.signerRole, sigY + 14, 10, "normal", 110);

  center(content.issueLine, pageH - 60, 10, "normal", 110);
  center(content.footer, pageH - 44, 9, "italic", 140);

  doc.save(content.filename);
}

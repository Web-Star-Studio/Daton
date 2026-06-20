import type { DocumentContentSection } from "@workspace/api-client-react";

function reindexOrder(sections: DocumentContentSection[]): DocumentContentSection[] {
  return sections.map((s, i) => (s.order === i ? s : { ...s, order: i }));
}

export function createSection(title = ""): DocumentContentSection {
  return { id: crypto.randomUUID(), title, body: "", order: 0 };
}

export function addSection(sections: DocumentContentSection[], title = ""): DocumentContentSection[] {
  return reindexOrder([...sections, createSection(title)]);
}

export function removeSection(sections: DocumentContentSection[], id: string): DocumentContentSection[] {
  return reindexOrder(sections.filter((s) => s.id !== id));
}

export function updateSection(
  sections: DocumentContentSection[],
  id: string,
  patch: Partial<Pick<DocumentContentSection, "title" | "body">>,
): DocumentContentSection[] {
  return sections.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function moveSection(
  sections: DocumentContentSection[],
  id: string,
  direction: "up" | "down",
): DocumentContentSection[] {
  const idx = sections.findIndex((s) => s.id === id);
  if (idx === -1) return sections;
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sections.length) return sections;
  const next = sections.slice();
  [next[idx], next[swap]] = [next[swap], next[idx]];
  return reindexOrder(next);
}

export function sectionsAreEqual(a: DocumentContentSection[], b: DocumentContentSection[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (s, i) => s.id === b[i].id && s.title === b[i].title && s.body === b[i].body && s.order === b[i].order,
  );
}

export interface MarkupResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyInlineMarkup(value: string, start: number, end: number, marker: string): MarkupResult {
  const selected = value.slice(start, end);
  const inner = selected || "texto";
  const next = value.slice(0, start) + marker + inner + marker + value.slice(end);
  const selStart = start + marker.length;
  return { value: next, selectionStart: selStart, selectionEnd: selStart + inner.length };
}

export function applyLinePrefix(value: string, start: number, end: number, prefix: string): MarkupResult {
  const lineStart = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  // Para uma seleção, a "última posição" é end-1; para um cursor (start===end),
  // usar `end` para não cair na linha anterior quando o cursor está no início da linha.
  const lastCharPos = end > start ? end - 1 : end;
  const afterEnd = value.indexOf("\n", lastCharPos);
  const lineEnd = afterEnd === -1 ? value.length : afterEnd;
  const block = value.slice(lineStart, lineEnd);
  const prefixed = block
    .split("\n")
    .map((line) => prefix + line)
    .join("\n");
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length };
}

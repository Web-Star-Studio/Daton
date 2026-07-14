import type { KeyboardEvent } from "react";

/**
 * Bloqueia a submissão implícita do HTML (Enter num campo de texto envia o
 * `<form>`). Nos diálogos multi-passo o `<form>` envolve todos os passos, então
 * um Enter durante o preenchimento salvava o registro e fechava o diálogo antes
 * da hora. Com o guarda, só os botões enviam.
 *
 * Enter continua funcionando para acionar botões pelo teclado e para quebrar
 * linha em `<textarea>`.
 *
 * Uso: `<form onSubmit={...} onKeyDown={preventImplicitSubmit}>`
 */
export function preventImplicitSubmit(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter") return;
  const tag = (event.target as HTMLElement).tagName;
  if (tag === "BUTTON" || tag === "TEXTAREA") return;
  event.preventDefault();
}

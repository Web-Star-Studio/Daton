#!/usr/bin/env python3
"""Monta o diário consolidado de um dia a partir dos fragmentos do branch `diario`.

Lê `docs/diario/<dia>/*.md` (do branch dedicado `diario`), ordena por horário
(prefixo do nome do arquivo) e concatena num único Markdown — opcionalmente gerando
o PDF com `scripts/gen-diario-pdf.py`. O consolidado é um ARTEFATO gerado: não precisa
ser versionado (os fragmentos são a fonte da verdade, imutáveis no branch `diario`).

Uso:
  python3 scripts/diario-build.py --day 2026-06-01
  python3 scripts/diario-build.py --day 2026-06-01 --out /tmp/diario.md --pdf
"""
from __future__ import annotations
import argparse
import datetime as dt
import os
import re
import shutil
import subprocess
import sys
import tempfile

BRANCH = "diario"


def run(args: list[str], cwd: str | None = None, check: bool = True) -> str:
    r = subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and r.returncode != 0:
        sys.exit(f"[diario-build] comando falhou: {' '.join(args)}\n{r.stderr.strip()}")
    return r.stdout.strip()


def parse_fragment(text: str) -> tuple[dict[str, str], str]:
    meta: dict[str, str] = {}
    body = text
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.DOTALL)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip('"')
        body = m.group(2)
    return meta, body.strip()


def main() -> None:
    ap = argparse.ArgumentParser(description="Consolida os fragmentos do diário de um dia.")
    ap.add_argument("--day", default=dt.date.today().strftime("%Y-%m-%d"), help="AAAA-MM-DD (default: hoje).")
    ap.add_argument("--out", help="Saída .md (default: docs/diario/<dia>.md).")
    ap.add_argument("--pdf", action="store_true", help="Também gera o PDF (gen-diario-pdf.py).")
    a = ap.parse_args()

    repo = run(["git", "rev-parse", "--show-toplevel"])
    out = a.out or os.path.join(repo, "docs", "diario", f"{a.day}.md")

    run(["git", "fetch", "origin", BRANCH], cwd=repo, check=False)
    if subprocess.run(["git", "ls-remote", "--exit-code", "--heads", "origin", BRANCH],
                      cwd=repo, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
        sys.exit(f"[diario-build] branch '{BRANCH}' ainda não existe no origin (nenhuma entrada registrada).")

    wt = tempfile.mkdtemp(prefix="daton-diario-build-")
    try:
        run(["git", "worktree", "add", "--force", wt, f"origin/{BRANCH}"], cwd=repo)
        day_dir = os.path.join(wt, "docs", "diario", a.day)
        if not os.path.isdir(day_dir):
            sys.exit(f"[diario-build] sem fragmentos para {a.day}.")
        frags = sorted(f for f in os.listdir(day_dir) if f.endswith(".md"))
        if not frags:
            sys.exit(f"[diario-build] sem fragmentos para {a.day}.")

        parts = [f"# Diário de Bordo — {a.day}\n",
                 "**Projeto:** Daton (plataforma ESG / Qualidade / Compliance — ISO 9001/14001)\n",
                 f"**Entradas:** {len(frags)}\n"]
        modulos = []
        bodies = []
        for fn in frags:
            meta, body = parse_fragment(open(os.path.join(day_dir, fn), encoding="utf-8").read())
            mod = meta.get("modulo") or ""
            if mod and mod not in modulos:
                modulos.append(mod)
            head = "## " + " · ".join(
                x for x in [meta.get("hora", ""), mod, meta.get("titulo", "")] if x
            )
            sub = " | ".join(
                x for x in [
                    f"autor: {meta['autor']}" if meta.get("autor") else "",
                    f"branch: {meta['branch']}" if meta.get("branch") else "",
                ] if x
            )
            bodies.append(f"{head}\n" + (f"_{sub}_\n\n" if sub else "\n") + body + "\n")
        if modulos:
            parts.append(f"**Módulos:** {', '.join(modulos)}\n")
        parts.append("\n---\n")
        md = "\n".join(parts) + "\n" + "\n\n---\n\n".join(bodies) + "\n"

        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            f.write(md)
        print(f"[diario-build] consolidado: {out}  ({len(frags)} entradas)")

        if a.pdf:
            pdf = out[:-3] + ".pdf" if out.endswith(".md") else out + ".pdf"
            gen = os.path.join(repo, "scripts", "gen-diario-pdf.py")
            run(["python3", gen, out, pdf], cwd=repo)
            print(f"[diario-build] PDF: {pdf}")
    finally:
        run(["git", "worktree", "remove", "--force", wt], cwd=repo, check=False)
        shutil.rmtree(wt, ignore_errors=True)


if __name__ == "__main__":
    main()

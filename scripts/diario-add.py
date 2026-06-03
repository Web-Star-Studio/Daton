#!/usr/bin/env python3
"""Adiciona uma entrada ao diário de bordo — à prova de conflito entre branches/sessões.

Cada entrada vira um arquivo PRÓPRIO em `docs/diario/<AAAA-MM-DD>/<HHMMSS>-<branch>.md`
no branch dedicado **`diario`** (orphan, só contém o diário). Como nenhuma sessão edita
o arquivo da outra, não há conflito de merge — mesmo com várias sessões em branches
diferentes alimentando o mesmo dia. A gravação é feita num worktree temporário do branch
`diario` (independente da branch de trabalho atual) + commit + push com rebase-retry.

Uso:
  python3 scripts/diario-add.py --modulo SWOT --titulo "Importação FPLAN" --file entrada.md
  printf 'conteúdo markdown...' | python3 scripts/diario-add.py --modulo SWOT --titulo "..."
  # --no-push: grava o commit no worktree local sem publicar (para teste)

O consolidado do dia (MD/PDF) é gerado por `scripts/diario-build.py`.
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
        sys.exit(f"[diario-add] comando falhou: {' '.join(args)}\n{r.stderr.strip()}")
    return r.stdout.strip()


def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (s or "").lower()).strip("-")
    return s or "sessao"


def remote_branch_exists(repo: str) -> bool:
    r = subprocess.run(
        ["git", "ls-remote", "--exit-code", "--heads", "origin", BRANCH],
        cwd=repo, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    return r.returncode == 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Adiciona uma entrada ao diário (branch dedicado).")
    ap.add_argument("--modulo", default="", help="Módulo/área (ex.: SWOT, KPI).")
    ap.add_argument("--titulo", default="", help="Título curto da entrada.")
    ap.add_argument("--autor", default="", help="Autor (default: git config user.name).")
    ap.add_argument("--branch", default="", help="Atribui a entrada a este branch (default: o branch atual). Útil para reunir feitos de outra branch.")
    ap.add_argument("--file", help="Arquivo .md com o conteúdo da entrada (default: stdin).")
    ap.add_argument("--no-push", action="store_true", help="Não publicar (commit local no worktree).")
    a = ap.parse_args()

    repo = run(["git", "rev-parse", "--show-toplevel"])
    feature = a.branch or run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo)
    autor = a.autor or run(["git", "config", "user.name"], cwd=repo, check=False) or "—"

    content = open(a.file, encoding="utf-8").read() if a.file else sys.stdin.read()
    if not content.strip():
        sys.exit("[diario-add] conteúdo vazio — passe --file ou via stdin.")

    now = dt.datetime.now()
    day = now.strftime("%Y-%m-%d")
    hhmmss = now.strftime("%H%M%S")
    hora = now.strftime("%H:%M")

    run(["git", "fetch", "origin", BRANCH], cwd=repo, check=False)
    exists = remote_branch_exists(repo)

    wt = tempfile.mkdtemp(prefix="daton-diario-")
    created_wt = False
    try:
        if exists:
            run(["git", "worktree", "add", "--force", wt, f"origin/{BRANCH}"], cwd=repo)
            run(["git", "checkout", "-B", BRANCH, f"origin/{BRANCH}"], cwd=wt)
        else:
            # cria o branch orphan (sem histórico do código) só com o diário
            run(["git", "worktree", "add", "--detach", "--force", wt, "HEAD"], cwd=repo)
            run(["git", "checkout", "--orphan", BRANCH], cwd=wt)
            run(["git", "rm", "-r", "-f", "-q", "--", "."], cwd=wt, check=False)
        created_wt = True

        day_dir = os.path.join(wt, "docs", "diario", day)
        os.makedirs(day_dir, exist_ok=True)
        fname = f"{hhmmss}-{slugify(feature)}.md"
        path = os.path.join(day_dir, fname)
        fm = (
            "---\n"
            f'hora: "{hora}"\n'
            f"autor: {autor}\n"
            f"branch: {feature}\n"
            f"modulo: {a.modulo}\n"
            f"titulo: {a.titulo}\n"
            "---\n\n"
        )
        with open(path, "w", encoding="utf-8") as f:
            f.write(fm + content.strip() + "\n")

        rel = f"docs/diario/{day}/{fname}"
        run(["git", "add", rel], cwd=wt)
        msg = f"diario({a.modulo or feature}): {a.titulo or hora} [{day} {hora}]"
        run(["git", "commit", "-m", msg], cwd=wt)

        if a.no_push:
            print(f"[diario-add] (--no-push) fragmento criado e commitado no worktree:\n  {rel}")
            return

        for _ in range(5):
            if exists:
                run(["git", "pull", "--rebase", "origin", BRANCH], cwd=wt, check=False)
            push = subprocess.run(
                ["git", "push", "-u", "origin", BRANCH], cwd=wt, text=True,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            )
            if push.returncode == 0:
                print(f"[diario-add] publicado em origin/{BRANCH}:\n  {rel}")
                return
            exists = True  # alguém criou/avançou o branch; tenta rebase+push de novo
        sys.exit("[diario-add] push falhou após múltiplas tentativas.")
    finally:
        if created_wt:
            run(["git", "worktree", "remove", "--force", wt], cwd=repo, check=False)
        shutil.rmtree(wt, ignore_errors=True)


if __name__ == "__main__":
    main()

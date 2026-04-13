"""
[NOME DO MÓDULO] — Guia do Módulo
Daton Platform

Uso:
    cd docs/pdfs/[modulo]
    python build.py

Dependências: pip install reportlab Pillow
"""
import os, sys

# Shared base: cores, estilos, Flowables, helpers
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _base import *

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMGS_DIR   = os.path.join(SCRIPT_DIR, "imgs")
OUTPUT     = os.path.join(SCRIPT_DIR, "guia-[modulo].pdf")


def build():
    doc   = new_doc(OUTPUT)
    story = []

    # ── CAPA ──────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 20*mm))
    story.append(HLine(C_PRIMARY, 3))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("[Título do Módulo]", ST_COVER_TITLE))
    story.append(Paragraph("[Subtítulo — ex: Guia do Módulo]", ST_COVER_SUBTITLE))

    meta_data = [
        [Paragraph("Módulo",       ST_META_LABEL), Paragraph("[Nome do Módulo]",               ST_META_VALUE)],
        [Paragraph("Público-alvo", ST_META_LABEL), Paragraph("[ex: Gestores de qualidade]",    ST_META_VALUE)],
        [Paragraph("Norma",        ST_META_LABEL), Paragraph("[ex: ISO 9001:2015, cláusula X.X]", ST_META_VALUE)],
        [Paragraph("Versão",       ST_META_LABEL), Paragraph("[ex: Abril 2026]",               ST_META_VALUE)],
    ]
    meta_t = Table(meta_data, colWidths=[35*mm, None])
    meta_t.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.5, C_BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(meta_t)
    story.append(Spacer(1, 6*mm))

    story.append(Paragraph("[Descrição introdutória do módulo em 3–5 linhas.]", ST_BODY))

    story.append(Spacer(1, 6*mm))
    # overview_grid: uma coluna por tab ou funcionalidade principal
    story.append(overview_grid([
        ("[Funcionalidade 1]", "[Descrição curta]"),
        ("[Funcionalidade 2]", "[Descrição curta]"),
        ("[Funcionalidade 3]", "[Descrição curta]"),
    ]))
    story.append(Spacer(1, 30*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    story.append(PageBreak())

    # ── SEÇÃO 1 — [NOME DA SEÇÃO] ─────────────────────────────────────────────
    # Repita este bloco para cada funcionalidade/tab do módulo.
    story.append(Spacer(1, 4*mm))
    story.append(SectionHeader("[Nome da Seção]"))
    story.append(Spacer(1, 3*mm))

    story.append(Paragraph("[Texto introdutório da seção em 2–4 linhas.]", ST_BODY))

    story.append(Spacer(1, 3*mm))
    story.append(img_flowable(f"{IMGS_DIR}/01-screenshot-annotated.png", max_height=75*mm))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph("[Legenda da imagem: descreva o que está destacado.]", ST_CAPTION))

    story.append(Spacer(1, 4*mm))
    story.append(label_tag("Como [fazer X]"))
    story.append(Spacer(1, 2*mm))
    story.append(steps_list([
        "Acesse <b>[Caminho no menu]</b>.",
        "Clique em <b>[Botão]</b>.",
        "[Passo 3...]",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(label_tag("Recursos disponíveis"))
    story.append(Spacer(1, 2*mm))
    story.append(resources_list([
        "Recurso 1",
        "Recurso 2",
    ]))

    story.append(Spacer(1, 3*mm))
    story.append(note_box("[Nota ISO ou dica para o usuário — opcional, remova se não usar.]"))

    story.append(PageBreak())

    # ── [SEÇÃO 2 ...] ─────────────────────────────────────────────────────────
    # (copie o bloco acima e ajuste)

    # ── RODAPÉ FINAL ──────────────────────────────────────────────────────────
    story.append(Spacer(1, 8*mm))
    story.append(HLine())
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Documento de uso restrito. daton © 2026", ST_FOOTER))

    doc.build(story)
    print(f"PDF gerado: {OUTPUT}")


if __name__ == "__main__":
    build()

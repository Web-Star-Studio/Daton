---
name: daton-pdf-guide
description: Use this skill to create a new PDF guide for a Daton platform module. Invoked when the user asks to create, generate or build a PDF guide or documentation for a module (e.g. "/pdf-guide Planejamento de Manutenção"). Covers the full workflow: scaffolding, screenshots, annotations and PDF build.
---

# Daton PDF Guide — Skill

Cria um guia PDF para um novo módulo da plataforma Daton seguindo o padrão visual estabelecido.

## Stack e localização

- **Build:** Python + ReportLab (`docs/pdfs/_base.py`)
- **Anotações:** Python + Pillow (`_template/annotate-screenshots.py`)
- **Screenshots:** Node.js + Playwright (`_template/take-screenshots.js`)
- **Destino:** `docs/pdfs/<slug-do-modulo>/`

## Workflow completo

### 1. Scaffolding

```bash
# Substitua <slug> pelo nome em kebab-case (ex: manutencao-preventiva)
cp -r docs/pdfs/_template docs/pdfs/<slug>
mkdir -p docs/pdfs/<slug>/imgs
```

### 2. Personalizar `build.py`

Edite `docs/pdfs/<slug>/build.py`:

- Altere `OUTPUT` (linha `guia-[modulo].pdf` → `guia-<slug>.pdf`)
- Preencha capa: título, subtítulo, meta_data (Módulo, Público-alvo, Norma, Versão)
- Preencha `overview_grid([...])` com as tabs/funcionalidades do módulo
- Substitua cada bloco `# ── SEÇÃO` com o conteúdo real:
  - Texto introdutório
  - `img_flowable(f"{IMGS_DIR}/0N-screenshot-annotated.png", max_height=XXmm)`
  - `label_tag("Como fazer X")` + `steps_list([...])`
  - `label_tag("Recursos disponíveis")` + `resources_list([...])`
  - `note_box("ISO 9001:2015, cláusula X.X — ...")` se aplicável

### 3. Capturar screenshots

Edite `docs/pdfs/<slug>/take-screenshots.js`:

- Substitua `LOGIN_EMAIL` / `LOGIN_PASSWORD` ou use env vars
- Substitua `TODO-rota-do-modulo` pelo caminho real (ex: `governanca/planejamento-operacional`)
- Para cada screenshot, adicione o bloco correto (tab click, dialog open, etc.)

Execute (requer dev server rodando):

```bash
LOGIN_EMAIL=seu@email.com LOGIN_PASSWORD=senha node docs/pdfs/<slug>/take-screenshots.js
```

### 4. Medir coordenadas para anotações

Com as screenshots prontas, meça as regiões de layout. Opções:

**Via Playwright** (mais preciso) — adicione ao `take-screenshots.js`:
```js
const box = await page.locator('[role="tablist"]').boundingBox()
console.log('tablist:', box)  // { x, y, width, height }
```

**Via GIMP ou outro editor de imagem** — abra a imagem e passe o cursor sobre os cantos das regiões.

Regiões típicas na UI do Daton (1280×900):
- `LEFT_END ≈ 695` — borda direita do painel de lista
- `TAB_Y ≈ 548` — topo da barra de tabs
- `BOTTOM ≈ 876` — base da área de conteúdo
- `RIGHT_END ≈ 1262` — borda direita do conteúdo

### 5. Anotar screenshots

Edite `docs/pdfs/<slug>/annotate-screenshots.py`:

- Preencha `LEFT_END`, `TAB_Y`, `BOTTOM`, `RIGHT_END` com os valores medidos
- Substitua `annotate("01-screenshot", ...)` pelos seus arquivos reais
- Para callout em elemento específico, adicione `callout_box=(x1, y1, x2, y2)`
  - Callout usa **borda vermelha sem fill** para não cobrir texto

Execute:
```bash
cd docs/pdfs/<slug>
python annotate-screenshots.py
```

### 6. Gerar o PDF

```bash
cd docs/pdfs/<slug>
python build.py
```

O PDF é gerado em `docs/pdfs/<slug>/guia-<slug>.pdf`.

## Componentes disponíveis no `_base.py`

| Componente | Uso |
|---|---|
| `new_doc(output_path)` | Cria `SimpleDocTemplate` com margens padrão (20mm) |
| `overview_grid(cards)` | Grade de cards na capa — `cards = [(title, desc), ...]` |
| `SectionHeader(title, tag="")` | Cabeçalho de seção com barra laranja |
| `SubSectionHeader(title)` | Cabeçalho de sub-seção com fundo cinza |
| `HLine(color, thickness)` | Linha horizontal divisória |
| `label_tag(text)` | Label laranja em caixa alta |
| `steps_list(items)` | Lista numerada de passos (suporta `<b>`) |
| `resources_list(items)` | Lista com dash para recursos/funcionalidades |
| `img_flowable(path, max_height)` | Imagem centralizada com proporção preservada |
| `note_box(text)` | Caixa cinza para notas ISO ou dicas (suporta `<b>`) |

Constantes de cor: `C_PRIMARY` (laranja), `C_DARK`, `C_MUTED`, `C_LIGHT`, `C_BORDER`, `C_WARM`

Estilos de parágrafo: `ST_COVER_TITLE`, `ST_COVER_SUBTITLE`, `ST_META_LABEL`, `ST_META_VALUE`, `ST_BODY`, `ST_CAPTION`, `ST_NOTE`, `ST_FOOTER`

## Convenções

- Screenshots: `01-nome.png`, `02-nome.png`, ... (numeradas, kebab-case)
- Anotadas: mesmo nome + `-annotated` suffix
- Cada seção do PDF → uma funcionalidade/aba do módulo
- Callout vermelho = elemento específico a destacar (sem fill para preservar texto legível)
- Spotlight laranja = área de conteúdo principal da tela
- Preview final: `python build.py` e abrir o PDF antes de commitar

## Commit

```bash
git add docs/pdfs/<slug>/
git commit -m "docs(<slug>): adiciona guia PDF do módulo de [Nome do Módulo]"
```

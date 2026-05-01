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

**Antes de executar, confirme a porta do dev server:**

```bash
ss -tlnp | grep -E ':(5173|5174)\b'
```

O script usa `http://localhost:5174` por padrão, mas o dev server pode subir na `5173`. Se necessário, passe a porta via env var ou edite `BASE_URL` no script.

Execute (requer dev server e API rodando):

```bash
# porta padrão 5174
LOGIN_EMAIL=seu@email.com LOGIN_PASSWORD=senha node docs/pdfs/<slug>/take-screenshots.js

# se o dev server estiver na 5173
BASE_URL=http://localhost:5173 LOGIN_EMAIL=seu@email.com LOGIN_PASSWORD=senha node docs/pdfs/<slug>/take-screenshots.js
```

> O script precisa suportar `process.env.BASE_URL`. No template, use:
> ```js
> const BASE_URL = process.env.BASE_URL || "http://localhost:5174";
> ```

#### Retomar apenas um screenshot com playwright-cli

Quando precisar retirar somente uma screenshot sem rodar o script completo:

```bash
playwright-cli open --browser=chromium http://localhost:5173/auth
playwright-cli resize 1280 900
playwright-cli fill e19 "admin@example.com"
playwright-cli fill e25 "demo123"
playwright-cli click e30   # botão "Entrar no Daton"
playwright-cli goto http://localhost:5173/app/<rota-do-modulo>
```

**Regra de ouro para scroll antes de screenshot:**
Sempre use `block:'start'` para posicionar o heading da seção em y≈CONTENT_TOP (67px).
Isso garante que o elemento-alvo começa perto do topo e as coordenadas de callout
ficam previsíveis (y_callout = heading_height + pequeno offset).

```bash
playwright-cli run-code "async page => {
  const h = page.locator('h3').filter({ hasText: /Nome da seção/ }).first();
  await h.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/pdfs/<slug>/imgs/0N-nome.png' });
}"
playwright-cli close
```

### 4. Medir coordenadas para anotações

**Nunca estime coordenadas de callout sem medir.** O elemento visado raramente está
onde parece — o scroll, margens e padding interno deslocam tudo.

#### Técnica correta: `run-code` + atributo DOM + `eval`

O `playwright-cli console` **não captura** saídas de `console.log` do `run-code`.
A única forma confiável de ler valores medidos é gravar no DOM e recuperar com `eval`:

```bash
playwright-cli run-code "async page => {
  # 1. Scroll o elemento alvo para o topo (block:'start')
  const target = page.locator('h3').filter({ hasText: /Nome/ }).first();
  await target.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.waitForTimeout(400);

  # 2. Medir os elementos-chave
  const bHead    = await target.boundingBox();
  const bPrimary = await page.locator('label').filter({ hasText: /Primeiro campo/ }).first().boundingBox().catch(() => null);
  const bLast    = await page.locator('label').filter({ hasText: /Último campo/ }).last().boundingBox().catch(() => null);

  # 3. Gravar no DOM (única forma de ler de volta)
  await page.evaluate(d => { document.body.setAttribute('data-m', d); },
    JSON.stringify({ head: bHead, primary: bPrimary, last: bLast }));
}"
# 4. Recuperar as medidas
playwright-cli eval "document.body.getAttribute('data-m')"
```

O resultado é um JSON com `{ x, y, width, height }` de cada elemento, em coordenadas
de viewport. Use esses valores diretamente em `annotate-screenshots.py`.

#### Traduzir medidas para callout_box

```
callout_box = (
  x,                    # ou LIST_END + margem se dentro do painel
  head.y + head.height + 4,  # logo abaixo do heading
  x + width - margem,
  last.y + last.height + 8   # abaixo do último campo
)
```

**Atenção a seções full-width:** algumas seções da UI (ex: Validação especial, seções
de rodapé) têm `x < LIST_END` — elas se estendem além do painel de detalhe. Nesses
casos **não aplique `DIM_LIST`**, use `content_box` e `callout_box` com os valores
reais medidos.

Regiões constantes na UI do Daton (1280×900):

| Constante | Valor | Descrição |
|---|---|---|
| `NAV_END` | 249 | Borda direita da sidebar de navegação |
| `LIST_END` | 697 | Borda direita do painel de lista (modelos/ciclos) |
| `CONTENT_TOP` | 67 | Topo da área de conteúdo (abaixo do breadcrumb) |
| `BOTTOM` | 889 | Base da área de conteúdo |
| `RIGHT_END` | 1269 | Borda direita do conteúdo |
| `CARD_LIST_W` | ~218–280 | Largura do sub-painel de cards — **medir por módulo** |

### 5. Anotar screenshots

Edite `docs/pdfs/<slug>/annotate-screenshots.py`:

- Use as medidas do passo 4 para `callout_box` — nunca estime
- Para `content_box`, use as constantes de layout ou as medidas reais da seção
- Para callout em elemento específico, adicione `callout_box=(x1, y1, x2, y2)`
  - Callout usa **borda vermelha sem fill** para não cobrir texto

Execute:
```bash
cd docs/pdfs/<slug>
python annotate-screenshots.py
```

### 5.1. Verificar anotações visualmente (obrigatório antes do PDF)

**Leia cada arquivo `-annotated.png` com a ferramenta Read antes de gerar o PDF.**
Verifique em cada imagem:

- [ ] Borda laranja cobre a área de conteúdo correta (não o sidebar, não o painel errado)
- [ ] Borda vermelha está sobre o elemento-alvo descrito no comentário do código
- [ ] Borda vermelha **não** está em um elemento adjacente (campo acima/abaixo, seção errada)
- [ ] Dim não obscurece conteúdo que deveria estar visível

Se alguma marcação estiver errada: volte ao passo 4, remede o elemento correto
e atualize `annotate-screenshots.py` com as novas coordenadas. Não avance para o
build sem confirmar visualmente.

### 6. Gerar o PDF

```bash
cd docs/pdfs/<slug>
python build.py
```

O PDF é gerado em `docs/pdfs/<slug>/guia-<slug>.pdf`.

### 7. Verificar páginas visualmente

Renderize todas as páginas do PDF como PNG para detectar páginas em branco ou conteúdo mal distribuído:

```bash
# instalar se necessário (uma vez por máquina)
pip install pymupdf --break-system-packages

python3 -c "
import fitz, os
PDF = 'docs/pdfs/<slug>/guia-<slug>.pdf'
OUT = '/tmp/pdf-preview'
os.makedirs(OUT, exist_ok=True)
doc = fitz.open(PDF)
print(f'Total páginas: {len(doc)}')
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=96)
    pix.save(f'{OUT}/page-{i+1:02d}.png')
doc.close()
"
```

Abra os PNGs em `/tmp/pdf-preview/` para inspecionar. Leia cada `page-NN.png` com a ferramenta Read para ver visualmente.

## Espaçamento e layout de páginas

A área útil de conteúdo por página A4 é **~257mm** (297mm − 2×20mm de margem).

### `max_height` seguro para imagens

O quanto a imagem pode ter depende do que mais existe na seção. Referências:

| Conteúdo da seção | `max_height` recomendado |
|---|---|
| Texto intro + imagem + 5–7 passos + 4–5 recursos + note_box | **62mm** |
| Texto intro + imagem + 4–5 passos + recursos (sem note_box) | **70mm** |
| Seção simples (só imagem + caption) | **90mm** |

### Evitar páginas em branco (orphan de flowables)

O padrão de cada seção terminar com `note_box(...)` + `PageBreak()` é problemático: se o `note_box` não couber na página atual, o ReportLab o empurra para a próxima página — e o `PageBreak()` logo após cria uma terceira página, deixando o `note_box` sozinho numa página quase vazia.

**Regra:** se a seção termina com `note_box` + `PageBreak`, use `max_height` conservador (62mm) e espaçadores menores (2mm em vez de 4mm antes do label_tag e após o SectionHeader). Após gerar, sempre verifique o PDF com o passo 7.

### Espaçadores padrão por posição

```python
story.append(Spacer(1, 2*mm))   # logo após PageBreak / início de seção
story.append(SectionHeader(...))
story.append(Spacer(1, 3*mm))   # antes do corpo de texto
# ... corpo, imagem, caption ...
story.append(Spacer(1, 2*mm))   # antes de label_tag
story.append(label_tag(...))
story.append(Spacer(1, 2*mm))   # antes de steps/resources
# ...
story.append(Spacer(1, 2*mm))   # antes de note_box
story.append(note_box(...))
story.append(PageBreak())
```

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

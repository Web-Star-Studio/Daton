# PRD — Modelo de Planilha Padrão para o Import de Governança

**Status:** proposto · aguardando revisão
**Autor:** João Pedro + Claude
**Data:** 2026-05-22

## 1. Contexto / Problema

O import de governança (`artifacts/web/src/lib/governance-import.ts`) está
**acoplado ao formato da planilha de um único cliente** (Transportes Gabardo).
As abas que o parser exige têm nomes específicos do arquivo dele:

- `A) SWOT SGI`, `A2) SWOT SGA`
- `B)DIRECIONAMENTO ESTRATÉGICO SV` (SV = Segurança Viária — específico de transporte)
- `A0) METODOLOGIA`, `CAPA`, `Histórico de Revisões`, etc.

Qualquer outra empresa que tente importar a governança dela **não tem como
saber** que precisa nomear as abas exatamente assim. O import deixou de ser
uma feature de produto e virou, na prática, uma integração de um cliente só.

## 2. Objetivo

Tornar o import **self-service e reutilizável**:

- Um **modelo de planilha `.xlsx` padrão** que passa a ser o "contrato" do import.
- Botão **"Baixar modelo"** na tela de import.
- O parser passa a casar com o modelo — nomes de aba **neutros, agnósticos de norma**.
- **Bônus:** resolve o "SGI" do import de forma limpa — o modelo já nasce sem "SGI".

## 3. Fora de escopo

- Migrar os dados já importados da Gabardo (já estão no banco — permanecem).
- Reescrever a lógica de parsing além dos nomes de aba / aliases.

## 4. Estado atual

- `governance-import.ts` — parser. Abas exigidas hoje: `Histórico de Revisões`,
  `CAPA`, `A0) METODOLOGIA`, `A) SWOT SGI`, `A2) SWOT SGA`,
  `B)DIRECIONAMENTO ESTRATÉGICO SV`, `B) PARTES INTERESSADAS`,
  `C) ESCOPO POLíTICA OBJETIVOS`, `D) INDICADORES E OBJETIVOS`.
- `governanca/[id].tsx` — tela de import + tabela de ajuda que documenta o formato.

## 5. Plano

### 5.1 Mapear o contrato
Extrair de `governance-import.ts`, por aba: nome, intervalo (ex.: `C:P`) e o que
cada coluna vira no sistema. Esse mapa é a especificação do modelo.

### 5.2 Padronizar os nomes das abas (neutros)

| Hoje (Gabardo) | Modelo padrão |
|---|---|
| A) SWOT SGI | A) SWOT |
| A2) SWOT SGA | A2) SWOT Ambiental |
| B)DIRECIONAMENTO ESTRATÉGICO SV | B) Direcionamento Estratégico |
| C) ESCOPO POLíTICA OBJETIVOS | C) Escopo, Política e Objetivos |
| demais | revisar caixa/acentuação |

### 5.3 Criar o modelo `.xlsx`
Um script em `scripts/` gera o arquivo com SheetJS: cada aba com **cabeçalhos**,
uma **linha de exemplo** e uma aba **"Instruções"**. Arquivo versionado no repo.

### 5.4 Servir o download
O `.xlsx` como asset estático (`artifacts/web/public/templates/`). Botão
**"Baixar modelo"** na tela de import.

### 5.5 Adaptar o parser
`governance-import.ts` passa a procurar os nomes do modelo. **Aliases:** aceita
também os nomes antigos da Gabardo (mapa de apelidos) durante a transição — não
quebra quem já tem a planilha no formato antigo.

### 5.6 Atualizar a tabela de ajuda
`governanca/[id].tsx` — refletir os nomes do modelo.

## 6. Transição

- **Gabardo:** dados já no banco → sem migração. Re-import futuro: o alias aceita
  o arquivo antigo, ou ela adota o modelo.
- **Empresas novas:** usam o modelo desde o primeiro import.

## 7. Decisões em aberto (com recomendação)

1. **Dois SWOTs (SGI/SGA) — manter 2 abas ou unificar numa só com coluna de domínio?**
   → *Recomendo manter 2 abas* com nomes neutros — menos retrabalho no parser.
2. **Onde hospedar o `.xlsx`?**
   → *Asset estático no front* (`public/templates/`) — download direto, simples.
3. **Aceitar os nomes antigos (alias)?**
   → *Sim* — custo baixo, evita quebrar a Gabardo.

## 8. Esforço / risco

Feature de tamanho médio. Arquivos tocados: `governance-import.ts`,
`governanca/[id].tsx`, novo asset `.xlsx` + script gerador. **Risco principal:**
não quebrar o import atual — mitigado pelos aliases dos nomes antigos.

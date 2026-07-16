# Certificado de conclusão de treinamento (PDF) — Design

**Data:** 2026-07-16
**Status:** Aprovado (aguardando revisão do spec antes do plano)
**Área:** Aprendizagem / Perfil do colaborador (`artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx`)

## Objetivo

Permitir baixar, em PDF, um **certificado de conclusão** de um treinamento a partir do
perfil do colaborador. O certificado é evidência de competência conforme **ISO 9001:2015
§7.2** — por isso só existe para treino **concluído** e **com data de conclusão**.

O pedido do cliente foi um "templatezinho legal" para download. O escopo aprovado é uma
**impressão bonita gerada na hora** (não um documento oficial verificável).

## Decisões (aprovadas)

1. **Geração client-side com `jsPDF`** — já é dependência do web (`jspdf@4.2.1`) e há padrão
   estabelecido em `artifacts/web/src/lib/document-pdf.ts` e no export de regulatórios
   (`.../regulatorios/_export.ts`, A4 landscape). **Sem backend, sem dependência nova, sem
   armazenamento.** O PDF é determinístico a partir do registro do treino (a única parte
   variável é a data de emissão = hoje).
2. **Informal, sem verificação** — sem QR/código de autenticidade, sem página pública de
   validação. Fica como evolução futura, se a auditoria pedir.
3. **Assinatura = avaliador da eficácia** — usa o nome já rastreado
   (`latestEffectivenessReview.evaluatorName`). Quando o treino ainda não foi avaliado (ou é
   um registro legado importado, sem avaliador), cai numa **linha em branco "Responsável"**.
   Não vamos rastrear "quem marcou a conclusão" (exigiria coluna nova + DDL na prod, e os
   ~63 mil treinos já importados ficariam sem esse dado de qualquer forma).
4. **CPF incluído** no certificado (identificação sem ambiguidade, padrão em certificados).

## Fontes de dados (tudo já disponível no front)

| Campo | Origem |
|---|---|
| Nome da empresa | `useAuth().organization?.tradeName ?? organization?.name` |
| Nome do colaborador | `employee.name` |
| CPF | `employee.cpf` (pode ser nulo/vazio) |
| Cargo | `employee.position` (pode ser nulo/vazio) |
| Título do treino | `training.title` |
| Data de conclusão | `training.completionDate` (string `YYYY-MM-DD`) |
| Carga horária | `training.workloadHours` (numeric, pode ter decimal) |
| Instituição | `training.institution` (opcional) |
| Validade | `training.expirationDate` (opcional) |
| Competência-alvo | `training.targetCompetencyName` (opcional) |
| Assinante | `training.latestEffectivenessReview?.evaluatorName` (opcional) |
| Data de emissão | `new Date()` no navegador (data de impressão) |

Threading de props: `TreinamentosTab` hoje recebe `employeeName`. Passa a receber também
`employeeCpf`, `employeePosition` e `orgName` (o pai — a página de perfil — já tem
`employee.cpf`, `employee.position` e `useAuth().organization`).

## Layout do certificado (A4 paisagem, borda decorativa)

```
╔═══════════════════════════════════════════════════════════════╗
║  ┌─────────────────────────────────────────────────────────┐  ║
║  │                  <EMPRESA>                               │  ║
║  │              CERTIFICADO DE CONCLUSÃO                    │  ║
║  │              ───────────────────────                    │  ║
║  │              Certificamos que                           │  ║
║  │                 <NOME> (grande)                         │  ║
║  │            <Cargo> · CPF <000.000.000-00>               │  ║
║  │         concluiu o treinamento                          │  ║
║  │            <TÍTULO DO TREINO>                            │  ║
║  │      em <dd/mm/aaaa> · carga horária de <X> horas       │  ║
║  │      Instituição: <...> · Validade: <dd/mm/aaaa>        │  ║ (condicional)
║  │      Competência: <...>                                 │  ║ (condicional)
║  │   ____________________                                  │  ║
║  │   <Avaliador>                                           │  ║ (nome só se houver avaliador)
║  │   Responsável                                           │  ║
║  │        Emitido em <dd/mm/aaaa>                           │  ║
║  │        Registro conforme ISO 9001:2015 §7.2             │  ║
║  └─────────────────────────────────────────────────────────┘  ║
╚═══════════════════════════════════════════════════════════════╝
```

### Regras de conteúdo

- **Linhas condicionais** (Instituição / Validade / Competência) só aparecem se o campo
  estiver preenchido. Nunca renderizar "Instituição: —".
- **CPF:** formatar `00000000000` → `000.000.000-00` (11 dígitos). Se vazio ou com contagem
  de dígitos diferente, omitir o "· CPF ..." (mostra só o cargo). Se cargo também vazio,
  omite a linha inteira.
- **Carga horária:** formato pt-BR (vírgula decimal, sem `.00` sobrando); pluralizar
  ("1 hora" vs "N horas"). Se ausente/zero, omitir "· carga horária de ...".
- **Datas:** formatar `YYYY-MM-DD` → `dd/mm/aaaa` fazendo split das partes (sem `new Date()`
  na data de conclusão/validade, para não sofrer deslocamento de fuso).
- **Assinatura:** sempre desenha a linha de assinatura e, abaixo dela, o rótulo
  "Responsável". Se houver `evaluatorName`, escreve o nome **entre** a linha e o rótulo;
  senão, fica só a linha e o rótulo (assinatura em branco).
- **Local de emissão:** **não** inventar cidade (não há campo confiável de cidade). Usar só
  "Emitido em <data de hoje>".
- **Acentos:** as fontes padrão do jsPDF (Helvetica) cobrem Latin-1/PT-BR — já comprovado
  pelos PDFs existentes do repo. Sem fonte customizada.

## Arquitetura (separar conteúdo puro de desenho, para testar)

Novo arquivo `artifacts/web/src/lib/training-certificate-pdf.ts`, espelhando a separação que
já usamos em `training-catalog-client.ts` (lógica pura testável vs. efeito colateral):

- `buildCertificateContent(input): CertificateContent` — **função pura**. Resolve todas as
  strings e linhas condicionais (título, linha do sujeito, `Cargo · CPF`, linha do treino,
  linha data+carga, extras[], assinante-ou-null, rodapé) e o nome do arquivo. É o alvo dos
  testes unitários.
- `downloadTrainingCertificate(input): void` — monta o `jsPDF` (A4 landscape) a partir do
  `CertificateContent`, desenha a borda/tipografia e chama `.save(filename)`. Camada fina,
  sem teste pesado (jsPDF em jsdom).

`input` é um objeto plano: `{ orgName, employeeName, employeeCpf, employeePosition,
title, completionDate, workloadHours, institution, expirationDate, competencyName,
evaluatorName }`. Nada de tipos de React/DOM — mantém a função pura e portável.

**Nome do arquivo:** `Certificado - <Treino> - <Nome>.pdf` (sanitizar barras/caracteres
inválidos de nome de arquivo).

## Ponto de entrada (UI)

No card de treino do perfil (`TreinamentosTab`), adicionar o botão **"Baixar certificado"**
(ícone `Download` do lucide) ao lado das ações existentes, **dentro do bloco
`isConcluido`** (mesma regra de visibilidade do "Avaliar eficácia" — só aparece em treino
concluído).

- Se `completionDate` estiver vazio → botão **desabilitado** com tooltip *"Informe a data de
  conclusão para emitir o certificado"* (certificado sem data não faz sentido).
- `onClick` → `downloadTrainingCertificate({...})` com os campos montados a partir de `t`,
  das props do colaborador e do `orgName`.

Ordem sugerida das ações no card (concluído): **Baixar certificado · Avaliar eficácia ·
Registrar conclusão · Remover da ficha**.

## Testes

Unitário (`artifacts/web/tests/lib/training-certificate-pdf.unit.test.ts`) sobre
`buildCertificateContent`:

- Monta as linhas certas com todos os campos preenchidos.
- Omite Instituição/Validade/Competência quando vazios.
- Formata CPF (11 dígitos → máscara); omite quando vazio/inválido.
- Omite o CPF mas mantém o cargo; omite a linha toda quando cargo e CPF vazios.
- Carga horária: pluralização ("1 hora" vs "2 horas"), decimal pt-BR ("1,5 horas"), omissão
  quando zero/ausente.
- Datas `YYYY-MM-DD` → `dd/mm/aaaa` sem deslocamento de fuso.
- Assinatura: usa `evaluatorName` quando presente; retorna `null`/linha em branco quando
  ausente.
- Nome do arquivo sanitizado.

## Fora de escopo (YAGNI)

- Verificação/QR/código de autenticidade e página pública de validação.
- Armazenar o PDF (é regenerável de forma determinística).
- Logo da empresa (não há campo `logo` na org; cabeçalho é texto).
- Rastrear "quem marcou a conclusão" (coluna nova + DDL de prod).
- Emissão em lote / vários treinos num PDF só.
- Local (cidade) de emissão.

## Arquivos afetados

- **Novo:** `artifacts/web/src/lib/training-certificate-pdf.ts`
- **Novo:** `artifacts/web/tests/lib/training-certificate-pdf.unit.test.ts`
- **Editar:** `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx`
  (props novas em `TreinamentosTab`; botão "Baixar certificado" no card; import do ícone
  `Download`; passar `employeeCpf`/`employeePosition`/`orgName` no call site).

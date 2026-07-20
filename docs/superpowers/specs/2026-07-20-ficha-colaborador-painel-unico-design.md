# Ficha do colaborador — painel único (Fase 2)

**Data:** 2026-07-20
**Origem:** a cliente apontou que a ficha do colaborador (Aprendizagem) foi entregue diferente do layout que ela idealizou (a "Versão proposta" do mockup HTML fornecido). Este é o pedido original que abriu a frente de trabalho da ficha.
**Depende de:** Fase 1 — o elo treinamento↔competência (`competencyConformance`), já mergeado na main.
**Status:** decisões aprovadas em brainstorming (2026-07-20). Segue para plano de implementação.

---

## 1. Objetivo

Reconstruir `artifacts/web/src/pages/app/aprendizagem/colaboradores/[id].tsx` para bater com o layout **painel único** da "Versão proposta", **sem** perder a funcionalidade que já está em produção (avaliação de eficácia, certificado PDF, CRUD de competências/treinamentos, conscientização, itens de perfil). **Cores = design system do Daton; layout = mockup.**

O bloco central "Formação e qualificações" só é verdadeiro por causa da Fase 1: ele confronta o que o cargo exige × o que o colaborador comprovou, usando o resolvedor de conformidade (`competencyConformance`).

## 2. Decisões travadas (brainstorming)

1. **Estrutura = painel único** (um scroll só, sem abas). Fiel ao mockup.
2. **Campos ausentes: mostrar só o que existe.** Matrícula, etnia e salário **não** existem no banco e **não** entram (nem como placeholder). Gestor e tempo na empresa são **derivados**.
3. **Competências em lista única (1B):** o bloco "Formação e qualificações" mostra Escolaridade + uma **lista única** das competências do cargo com os 3 estados. O agrupamento por categoria (Conhecimentos técnicos / Certificados / Idiomas) do mockup fica **deferido** — a categoria do banco de competências está vazia hoje; quando for preenchida, evolui-se para o agrupado.
4. **Conscientização = seção no fim do painel (2A).** Ela não aparece no mockup, mas é evidência de norma (ISO 9001 §7.3) e tem funcionalidade; fica visível como seção, não escondida em diálogo.

## 3. Estrutura do painel (de cima para baixo)

Todas as seções num único scroll. A edição/CRUD acontece em **diálogos** disparados de dentro de cada seção — a lógica existente é preservada, só muda o container visual (de "aba" para "seção").

1. **Cabeçalho** — avatar (iniciais), nome, cargo, badges (contrato · departamento · filial) e, à direita, **4 contadores**: Total / Feitos / Pendentes / Vencidos.
2. **Dados pessoais | Dados profissionais** — dois cards lado a lado.
   - Pessoais: CPF, sexo, data de nascimento, e-mail, telefone.
   - Profissionais: departamento, cargo, filial, data de admissão, **tempo na empresa** (derivado), **gestor** (derivado), tipo de contrato.
   - Botão "Editar" reusa o modal de cadastro existente (`EditEmployeeModal`) — não reinventar.
3. **Formação e qualificações** — selo "Gaps encontrados" / "Requisitos atendidos" no cabeçalho.
   - **Escolaridade:** Possui × Requerido → Atende / Gap / Não informado (ver §5).
   - **Competências do cargo:** lista única vinda de `competencyConformance.requirements`, com os 3 estados (✓ atende · ✗ lacuna · ? não avaliável). Barra de progresso `atende / (atende + gap)`; `nao_classificado` fora do denominador, contado num rodapé ("N não avaliáveis"). É exatamente o motor da Fase 1, reestilizado para o layout do mockup.
4. **Treinamentos + Competências + Eficácia** — grid inferior, como no mockup.
   - Treinamentos (coluna larga): lista de cards (título, status, datas, carga) + os diálogos de CRUD e avaliação de eficácia + o download de certificado — **conteúdo e lógica reusados** do que hoje é a aba Treinamentos.
   - Competências (coluna estreita): a matriz visual de níveis — reusa a aba Competências.
   - Avaliações de eficácia (coluna estreita): lista das avaliações — reusa os blocos de eficácia dos cards de treinamento.
5. **Conscientização** — seção no fim: lista de registros (tema, data, método, vínculos SGQ) + o diálogo de CRUD existente.

## 4. Arquitetura — componentização

`[id].tsx` tem ~4.440 linhas e é o arquivo mais disputado do módulo (várias sessões o tocam). A reconstrução **quebra-o em componentes por seção**, colocados em `colaboradores/_components/`:

- `FichaHeader` (cabeçalho + contadores)
- `DadosCards` (pessoais | profissionais + botão editar)
- `FormacaoQualificacoes` (escolaridade + conformidade de competências)
- `TreinamentosSection` / `CompetenciasSection` / `EficaciaSection`
- `ConscientizacaoSection`

Os diálogos e formulários existentes (`CompetencyFormStep`, `TrainingFormStep`, `AwarenessFormStep`, `EditEmployeeModal`, review de eficácia, itens de perfil) são **movidos, não reescritos** — a lógica de mutations/estado é preservada. `[id].tsx` vira um orquestrador enxuto que compõe as seções.

Isso reduz o risco de colisão (arquivos menores e focados) e melhora a manutenção.

## 5. Derivações novas (client-side, sem mudança de schema)

- **4 contadores:** de `employee.trainings` — Total = todos; Feitos = `status = concluido`; Pendentes = `status = pendente`; Vencidos = `status = vencido` (ou `expiration_date < hoje`).
- **Tempo na empresa:** de `admissionDate` até hoje (ex.: "7 anos e 3 meses").
- **Gestor:** os gestores da filial do colaborador (mecanismo `unit_managers`, já usado na listagem de colaboradores). Se o payload de detalhe não trouxer, adicionar ao `GET /employees/:empId` (mudança pequena e aditiva no backend) ou buscar via hook de gestores da unidade. O plano decide a fonte após inspecionar o payload atual.
- **Escolaridade (Possui × Requerido):** `employees.education` (possui) × `positions.education` (requerido), ambos texto livre. Comparação por **ordem** via um mapa ordinal dos níveis conhecidos (Fundamental Incompleto < Fundamental Completo < Médio Incompleto < Médio Completo < Superior Completo < Pós-Graduação; "Não Aplicável" fora da ordem). Regras:
  - Requerido vazio, ou valor fora do mapa → mostra só "Possui: X" (sem veredito).
  - Possui ordem ≥ Requerido → **Atende**. Senão → **Gap**.
  - Possui vazio → "Não informado".

## 6. Reuso da Fase 1

O bloco de competências consome `employee.competencyConformance` (já no payload de `GET /employees/:empId`): `{ positionName, requirements[], gapStatus }`, cada requisito com `competencyName, competencyType, requiredLevel, acquiredLevel, status (atende|gap|nao_classificado), source, evidence`. Nada é recalculado no front. Quando `competencyConformance` é `null` (o cargo texto-livre não casa com um Position), o bloco mostra o estado neutro "cargo sem requisitos definidos" — como já faz hoje.

## 7. Fora de escopo (YAGNI)

- Mudanças de schema (matrícula, etnia, salário — não entram).
- O agrupamento por categoria (1A) — deferido até a categoria do banco de competências ter dado.
- Reescrever a lógica de eficácia / certificado / CRUD — só **movida**, não alterada.
- Alinhar outras telas do módulo ao mockup — cada uma é sua própria frente.

## 8. Risco e mitigação

A ficha é o arquivo mais mexido do módulo. Riscos: (a) quebrar silenciosamente funcionalidade que outras sessões puseram no ar; (b) colidir com PRs paralelos.

Mitigações:
1. **Antes de reescrever**, garantir cobertura de teste dos fluxos críticos que hoje não têm teste de render: abertura dos diálogos de eficácia e de novo treinamento, o botão de certificado, e o CRUD de competência. Testes de render (web-unit, glob `artifacts/web/tests/**/*.unit.test.tsx`) que travem "o diálogo abre / o botão existe / a mutation é chamada".
2. **Componentizar primeiro, migrar o visual depois** — extrair as seções para `_components/` preservando comportamento (com os testes acima passando), então reorganizar o layout para o painel único. Cada passo é verificável.
3. **Verificação visual** ao fim (dev server local contra docker + prints), comparando com a "Versão proposta".

## 9. Testes

- **Unidade (web):** as derivações puras — contadores, tempo na empresa, comparação de escolaridade (mapa ordinal, incl. os casos "requerido vazio" e "valor fora do mapa"). Glob `artifacts/web/tests/**/*.unit.test.tsx`.
- **Render:** o painel monta com as seções na ordem certa; o bloco Formação renderiza os 3 estados; a Conscientização aparece como seção; os diálogos de CRUD/eficácia continuam abrindo.
- **Não regressão:** os testes de integração do domínio (employees, learning) permanecem verdes.
- `pnpm typecheck` completo antes de cada push.

## 10. Validação

- Comparar o painel montado contra a "Versão proposta" do mockup.
- Confirmar que nenhuma funcionalidade sumiu: eficácia, certificado, CRUD de competência/treinamento, conscientização, itens de perfil, edição de dados.

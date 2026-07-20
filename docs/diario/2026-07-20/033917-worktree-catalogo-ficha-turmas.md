---
hora: "03:39"
autor: João Pedro
branch: worktree-catalogo-ficha-turmas
modulo: Aprendizagem
titulo: Catálogo: correção do badge de norma que quebrava o card + ficha com turmas e Abrir turma
---

Ajuste de fidelidade ao layout de referência na tela de Catálogo de treinamentos (Aprendizagem), em duas frentes.

**1. Correção — badge de norma quebrava o card.** No cabeçalho do card, o badge roxo da norma ficava na mesma linha do título sem permissão para encolher e sem truncamento. Com os rótulos longos do catálogo de normas (ex.: "NR-11 · Transporte e Movimentação de Materiais") o badge tomava a largura da linha e espremia o título, que passava a quebrar palavra a palavra e ocupava quatro linhas. Correção: o título passou a ter prioridade de espaço (min-w-0 + flex-1) e a coluna de normas ficou limitada a 45% da largura e truncada. O card passa a exibir a forma curta do rótulo (só o código antes do separador) e agrupa o excedente em "+N"; o rótulo completo permanece no tooltip e na ficha.

**2. Funcionalidade — ficha do treinamento.** A ficha aberta ao clicar num item do catálogo mostrava apenas os dados do treinamento. Passou a incluir o histórico "Turmas realizadas" (código, data, filial, inscritos e status) e as ações "Duplicar" e "Abrir turma" no cabeçalho. "Abrir turma" leva para Gestão de turmas com o assistente de nova turma já aberto e o treinamento selecionado. O histórico não exigiu rota nova — a listagem de turmas já aceitava filtro por item de catálogo.

**Impacto/área:** somente frontend (Aprendizagem → Catálogo e Turmas, mais a prop opcional `headerActions` no componente de diálogo, aditiva). Sem alteração de banco, de contrato de API ou de código gerado.

**Fora de escopo:** a coluna "Realizados" (aprovados) que o layout de referência exibe na tabela de turmas — a listagem devolve o total de inscritos, mas não a contagem de aprovados, e incluí-la exigiria alterar o contrato da API. Registrado como possível follow-up.

**Status:** PR #173 aberto em draft (branch worktree-catalogo-ficha-turmas), não mergeado.

**Validações:** `pnpm typecheck` limpo em todos os pacotes; 33 testes passando em norms-client e training-catalog-client, incluindo 6 novos para a função de encurtamento de rótulo. A suíte web-unit completa estoura a heap neste ambiente (limitação pré-existente; os arquivos passam individualmente). Verificação na interface com banco descartável, depois removido: título em uma linha, "+1" no item com múltiplas normas, layout íntegro também em viewport estreita, tabela de turmas na ficha e o assistente de nova turma abrindo pré-preenchido.

---
hora: "16:53"
autor: João Pedro
branch: worktree-turma-multi-filial
modulo: Aprendizagem
titulo: Responsável e instrutor únicos por turma (treino multi-filial é online)
---

**O que foi feito:** ajustado o modelo da turma multi-filial conforme decisão da cliente: quando o treinamento envolve várias filiais, ele é **online**, com **um instrutor** e **um responsável pela turma inteira** — não um por filial.

- **Instrutor:** já era único por turma; nenhuma mudança necessária (uma consulta aos dados de produção havia confirmado que o instrutor é característica do treinamento, não da filial).
- **Responsável:** deixou de ser por filial e passou a ser **um responsável pela turma**. No assistente de criação, o bloco de "responsável por filial" foi substituído por um único campo "Responsável pela turma". Toda a experiência construída antes (notificação e e-mail ao vincular, aparição nas Pendências do responsável, filtro "minhas turmas", exibição no detalhe da turma) foi mantida, agora apontando para essa única pessoa.

**Por quê:** a cliente esclareceu que o cenário real de várias filiais no mesmo treinamento é sempre online e centralizado, então não faz sentido um instrutor nem um responsável por filial. O responsável por filial havia sido construído de forma provisória; esta é a consolidação do modelo definitivo.

**Impacto / área afetada:** módulo Aprendizagem (turmas, pendências) e banco de dados. Migração aditiva: nova coluna de responsável na turma; a coluna antiga (responsável por filial) foi mantida inativa, para reversibilidade, sem quebrar nada existente.

**Status:** entregue no mesmo PR draft (#204). Migração de banco **aplicada em produção** e verificada. Conferido ao vivo: criação de turma com um responsável para várias filiais, gerando a notificação e a pendência corretas para o responsável.

**Validações:** verificação de tipos limpa; 43 testes automatizados de integração (turma, filiais, responsável, pendências) e 30 de interface, todos passando; teste manual dirigindo a interface e a API.

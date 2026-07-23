---
hora: "17:04"
autor: João Pedro
branch: worktree-turma-multi-filial
modulo: Aprendizagem
titulo: Edição inline de filiais e responsável no detalhe da turma
---

**O que foi feito:** adicionada a edição inline de filiais e responsável no painel de detalhe da turma. Antes só era possível definir filiais e responsável na criação; agora, ao abrir uma turma, há um botão "Editar" que permite alterar a lista de filiais (com a opção "selecionar todas") e o responsável pela turma, com botões Salvar e Cancelar. Ao salvar, a lista de turmas reflete a mudança na hora.

**Por quê:** o painel apenas exibia essas informações; qualquer correção exigia recriar a turma. A edição inline fecha essa lacuna, reaproveitando a rota de atualização que já existia.

**Impacto / área afetada:** módulo Aprendizagem (tela de turmas). Sem mudança de banco.

**Status:** entregue no mesmo PR draft (#204). Verificado ao vivo: em uma turma existente, troca de responsável e inclusão de uma filial, refletindo corretamente no banco e na listagem.

**Validações:** verificação de tipos limpa; 4 testes de interface novos do painel (exibir e editar, adicionar filial e trocar responsável, limpar o responsável, cancelar sem salvar) e 1 teste de integração novo (troca de responsável notifica o novo; limpar remove); demais suítes de turma e pendências seguem passando.

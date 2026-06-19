---
hora: "17:40"
autor: João Pedro
branch: worktree-fix+user-create-employee-autofill
modulo: usuarios
titulo: Correção: autofill do navegador contaminava email/senha no cadastro de usuário
---

**O que foi feito:** corrigido bug no diálogo de criação de usuário (Configurações > Usuários). Os campos Email e Senha não tinham atributo `autoComplete`, então o gerenciador de senhas do navegador os preenchia com a credencial salva do próprio administrador ao abrir o diálogo. Como a seleção de colaborador só preenchia o email quando o campo estava vazio, o email do colaborador era descartado e prevalecia o do admin.

**Por quê:** a cliente (Transportes Gabardo) relatou que, ao cadastrar um usuário, os dados do colaborador não eram puxados — o email vinha com o login do próprio admin.

**Como:** adicionado `autoComplete="off"` no email e `autoComplete="new-password"` na senha (o navegador passa a tratar como formulário de criação de conta e não injeta a credencial salva); a seleção do colaborador agora sempre sobrescreve o email, via helper puro `resolveUserEmailFromEmployeePick` coberto por teste unitário.

**Impacto/área:** módulo Configurações > Usuários (criação de usuário da organização). Também elimina o risco latente de o novo usuário ser criado com a senha do admin pré-preenchida.

**Status:** concluído — PR #103 mergeado em `main` (squash, commit 3edb9e8).

**Validações:** teste unitário novo (5 casos, TDD) e demais testes vizinhos verdes; check obrigatório `pnpm typecheck` e CodeQL verdes no CI.

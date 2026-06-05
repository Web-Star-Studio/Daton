---
hora: "21:13"
autor: João Pedro
branch: fix/theme-persistence
modulo: Tema (Aparência)
titulo: Persistência do tema na conta do usuário
---

## Persistência do tema (aparência) na conta do usuário

**O que foi feito:** O tema visual (claro/escuro/sistema) passou a ser salvo na conta do usuário no servidor, deixando de depender apenas do localStorage do navegador. Foi adicionada a coluna `users.theme` (padrão "claro"); o campo passou a ser retornado em `GET /auth/me` e aceito em `PATCH /auth/me` (que se tornou uma atualização parcial). No frontend, o tema da conta é reaplicado no login e a escolha do usuário é gravada na conta. O padrão de exibição mudou de "seguir o sistema operacional" para "claro", e foi removida a remontagem do provedor de tema que causava um "flash" de escuro a cada acesso.

**Por quê:** A cliente Ana Corrêa relatou que, a cada novo acesso, o sistema voltava para o modo escuro e ela precisava reconfigurar o modo claro — a preferência não persistia. A causa era o armazenamento apenas local (por navegador) com padrão "seguir o S.O.".

**Impacto/área:** Banco de dados (coluna nova em usuários), contrato e servidor da API (`/auth/me`) e frontend web (provedor de tema e tela de Ajustes do sistema). A preferência agora acompanha o usuário entre dispositivos, navegadores e limpezas de cache.

**Status:** Concluído e em revisão no PR #84. A coluna `users.theme` já foi aplicada na base de produção (Neon) e os 68 usuários existentes receberam "claro". Pendente apenas o deploy de API + frontend.

**Validações:** `pnpm typecheck` verde em todos os projetos (libs, api-server, web, scripts, mockup-sandbox, e2e). Coluna verificada em produção (text, not null, default 'light').

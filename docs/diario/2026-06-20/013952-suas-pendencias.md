---
hora: "01:39"
autor: João Pedro
branch: suas-pendencias
modulo: Suas Pendências
titulo: Feature publicada na main + DDL em produção (F1–F4 + fechamento)
---

## Suas Pendências — feature concluída e publicada (merge na main + DDL em produção)

**O que foi feito**
- Mergeada na `main` a feature **"Suas Pendências"** (painel pessoal de pendências do usuário) — PR #102, squash `f6e95cc4`. Abrange as quatro fases já desenvolvidas (F1 identidade do usuário, F2 motor de provedores, F3 painel, F4 calendário & concluídos hoje) e o fechamento de UX (escopo por papel + calendário com chips legíveis).
- Antes do merge, triados os achados dos revisores automáticos (cubic). Dois foram corrigidos por serem endurecimentos de baixo risco e alto valor:
  1. Atualização de papel de usuário deixa de **apagar a filial** quando o campo é omitido (passa a preservar; só zera com valor nulo explícito).
  2. Resolução da filial em `/auth/me` passou a ser **escopada por organização** (defesa adicional contra vazamento entre clientes/tenants).
- Acrescentados 4 testes de integração cobrindo exatamente esses dois comportamentos.
- Aplicada a alteração de banco em **produção** de forma cirúrgica (adição da coluna `last_login_at` na tabela de usuários), evitando o `push` completo do schema por estar a branch atrás da main.

**Por quê**
- Concluir e publicar o painel pedido pela cliente (Gabardo/SGI), que se torna a tela inicial pós-login e item de menu.
- Os endurecimentos eliminam um risco latente de perda de dado (filial) e reforçam o isolamento multi-tenant antes de ir para produção.

**Impacto / área afetada**
- Backend (autenticação/usuários e motor de pendências) e frontend (painel, seletor de escopo por papel, calendário).
- Banco de produção: nova coluna `last_login_at` (nullable, sem reescrita de tabela).

**Status e validações**
- CI 100% verde (typecheck, CodeQL JS/TS e Python, Macroscope, CodeRabbit, cubic). Branch atualizada com a main (estado "CLEAN") antes do merge.
- `pnpm typecheck` verde; testes de integração dos arquivos tocados 7/7; suíte do fechamento previamente verde (integração 8/8, unit do front 13/13).
- Coluna de produção verificada presente após a alteração.
- **Concluído.**

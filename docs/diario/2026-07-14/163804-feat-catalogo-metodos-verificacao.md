---
hora: "16:38"
autor: João Pedro
branch: feat/catalogo-metodos-verificacao
modulo: Gestão de Ações
titulo: Método de verificação da eficácia vira catálogo gerenciável
---

Na ficha do plano de ação, o campo **Método de verificação** (bloco Avaliação de eficácia) era uma lista fixa em código: incluir um método novo exigia alteração em três pontos do sistema e um novo deploy. A cliente precisava cadastrar os próprios métodos.

**O que foi feito:** o campo virou um **catálogo gerenciável por organização**, no mesmo padrão já adotado para o catálogo de Normas. A gestão fica em **Configurações → Sistema → aba "Métodos de verificação"**, restrita a administradores, com criar, renomear e ativar/desativar. Os 6 métodos que existiam fixos (Verificação por indicador, Auditoria interna, Inspeção física (campo), Verificação por treinamento, Verificação por amostragem e Redução de risco) foram preservados como itens iniciais do catálogo, com os mesmos nomes.

**Decisões de projeto:** não existe exclusão — desativar um método o remove do seletor sem apagá-lo dos planos que já o utilizam (preserva o histórico e a rastreabilidade da auditoria). O plano de ação passa a referenciar o método por identificador, e a coluna antiga foi mantida como legado (não removida), garantindo rollback. Enquanto a migração de dados não roda, um plano antigo continua exibindo o método registrado, em modo leitura.

**Escopo/impacto:** módulo Gestão de Ações (ficha do plano) e Configurações do Sistema. O campo "Método de verificação" da Conscientização (Aprendizagem) é outro campo, de texto livre, e ficou fora deste escopo.

**Status:** entregue em PR (draft) — Web-Star-Studio/Daton#156, branch `feat/catalogo-metodos-verificacao`. Aguarda revisão e merge.

**Validações:** `pnpm typecheck`, `pnpm build` e testes unitários (node) passando. 7 novos testes de integração (idempotência de cadastro, reativação, permissão de administrador, colisão de nome, carga inicial, e gravação/validação do método no plano, incluindo bloqueio de método de outra empresa). As 2 falhas remanescentes na suíte de integração (LAIA e governança) foram verificadas e **já existem na `main`** — não têm relação com esta entrega.

**Pendências de deploy (dependem de autorização explícita):** aplicar a estrutura no banco de produção e rodar a migração de dados que semeia os 6 métodos em cada organização e converte os planos existentes. A migração é não-destrutiva e idempotente (validada contra banco local).

---
hora: "17:14"
autor: João Pedro
branch: feat/catalogo-metodos-verificacao
modulo: Gestão de Ações
titulo: Catálogo de métodos de verificação: merge e publicação em produção
---

Complemento da entrada anterior do dia (catálogo de métodos de verificação): a funcionalidade foi **aprovada, mergeada e publicada**.

**Merge:** PR #156 integrado à `main` (squash `0301b61`). Publicação automática da API e do front a partir da `main`.

**Banco de produção (aplicado com autorização explícita):**
- Estrutura criada de forma aditiva e cirúrgica: nova tabela do catálogo, índice de unicidade por empresa e o novo campo no plano de ação. Nada foi removido — a coluna antiga permanece intacta como registro histórico e rota de retorno.
- Migração de dados executada: os **6 métodos padrão foram semeados nas 3 organizações** e **17 planos de ação existentes foram convertidos** para o catálogo (14 da Transportes Gabardo e 3 da conta demonstrativa), preservando exatamente o método que cada um já tinha. Conferido: nenhum plano ficou pendente e nenhum aponta para método de outra empresa. A migração é idempotente (reexecutada, não alterou nada).

**Validação:** ambiente de teste levantado em paralelo, contra os dados reais de produção, para conferência do cliente interno antes do merge. Aprovado.

**Resultado para o usuário:** administradores passam a cadastrar, renomear e desativar os próprios métodos de verificação em Configurações → Sistema, sem depender de nova versão do sistema. Desativar um método o retira das novas seleções sem apagá-lo dos planos que já o utilizam, preservando a rastreabilidade exigida em auditoria.

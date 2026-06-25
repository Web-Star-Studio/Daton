---
hora: "13:54"
autor: João Pedro
branch: chore/diario-tooling
modulo: Colaboradores
titulo: Carga V2 de colaboradores (Gabardo) — atualização não-destrutiva do quadro
---

**O que foi feito:** Migração da planilha V2 de colaboradores da Transportes Gabardo (1.866 linhas) como **atualização não-destrutiva** do quadro existente. Casamento de cada pessoa ao cadastro atual por CPF → e-mail → nome → grafia; **atualização** das fichas existentes (preservando o id e o histórico de treinamentos), **inserção** dos novos e **inativação** (status, nunca exclusão) dos que não constam na planilha atual.

**Por quê:** A planilha é a versão atual/"verdade absoluta" do quadro (definição da cliente). A primeira tentativa havia duplicado ~1.319 pessoas porque casava apenas por CPF e o cadastro antigo (import de dezembro/2025) estava sem CPF; essa carga foi revertida e refeita pela abordagem não-destrutiva, preservando o histórico exigido pela ISO (treinamentos e avaliações de eficácia).

**Impacto (PROD, org Gabardo):** 2.005 → 2.399 colaboradores — **1.860 ativos** (= exatamente a planilha), 539 inativados, 394 novos, 1.466 atualizados. **1.394 treinamentos + 159 avaliações de eficácia preservados (zero órfãos).** Nenhum login afetado (usuários e colaboradores são tabelas independentes, sem vínculo). Campos novos (data de nascimento, gênero, escolaridade) e vínculo "terceirizado" disponíveis (PR #105). Motoristas terceiros tratados como pseudo-filial "MOTORISTA TERCEIRO".

**Status:** Concluído em produção em 25/06/2026.

**Validações:** dry-run com rollback contra o prod; teste completo em banco isolado (cópia fiel do prod); verificação adversarial multiagente (identificou e corrigiu um defeito de casamento por similaridade que fundia pessoas distintas); snapshot completo + procedimento de revert testado (restauração byte-perfeita); verificação final cruzando cada pessoa da planilha contra o prod (1.861/1.861 presentes e ativas). Divergências restantes são itens de qualidade de origem sinalizados ao RH: ARISTIDES e YURI com o mesmo CPF; ROBERTO CARLOS listado em duas filiais; 3 sem CPF e 1 CPF inválido.

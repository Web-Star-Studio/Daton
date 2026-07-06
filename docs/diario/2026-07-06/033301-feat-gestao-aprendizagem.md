---
hora: "03:33"
autor: João Pedro
branch: feat/gestao-aprendizagem
modulo: Aprendizagem
titulo: Carga real (zero desperdício) + go-live do módulo em produção
---

## Módulo de Gestão de Aprendizagem — carga da base real (zero desperdício) e go-live em produção

**O que foi feito**

1. **Carga da base real da Gabardo (org 2) em produção**, a partir de duas planilhas do cliente (FUNÇÕES e TREINAMENTOS — 32.636 registros de histórico, período 2009–2017), em modo **"zero desperdício"** (instrução da cliente: nenhum registro pode ser perdido).
   - Regra por situação de casamento: colaborador **casado** ou **weak** (nome bate com um único ativo; a divergência de admissão vinha de datas de lote da planilha, não de homônimo) → o histórico é anexado ao colaborador **ativo**; colaborador **não encontrado** no cadastro → criado como **ex-colaborador INATIVO** (histórico da empresa) e o histórico é anexado a ele.
2. **Módulo completo publicado em produção** (PR #112 — telas SP0–SP6/B + Colaboradores e Eficácia) via merge na `main`, disparando o deploy automático (API na Render, front na Cloudflare).

**Números aplicados em produção**

- +43 cargos, +169 competências, +714 requisitos de competência por cargo
- +840 itens de catálogo de treinamentos
- **+1.419 ex-colaboradores** (inativos, apenas histórico)
- **+32.415 registros de treinamento**
- Colaboradores **ativos intactos** (1.860) — a carga não alterou o quadro ativo

**Impacto / área afetada**

Módulo de Gestão de Aprendizagem no ar e **populado com o histórico real** de treinamentos e competências da Gabardo. A cliente já pode visualizar, testar e dar feedback. Fecha a entrega do módulo (competências por cargo com status OK/Gap/Crítico, histórico por colaborador, indicadores de treinamento e avaliação de eficácia conforme ISO 10015).

**Segurança e reversibilidade**

- Ferramenta de carga transacional por fase (erro → reversão automática, sem linhas parciais), não-destrutiva e idempotente.
- Validação prévia por *dry-run* (somente leitura) contra o banco de produção, confirmando 100% das unidades resolvidas e o casamento por colaborador.
- Testes em banco de homologação: regressão 23/23, modo zero-desperdício 17/17, reversão completa 19/19.
- **Rollback pronto e preservado** (por manifesto de lote), permitindo desfazer integralmente a carga se necessário.

**Status:** concluído. Merge e carga aplicados em produção; deploy automático em rollout.

**Validações:** `pnpm typecheck` verde no CI; dry-run de produção confirmou os números; verificação pós-carga no banco de produção conferida (contagens batendo, ex-colaboradores inativos com função/unidade/treinos).

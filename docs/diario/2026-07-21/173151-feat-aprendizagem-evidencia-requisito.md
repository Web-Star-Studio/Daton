---
hora: "17:31"
autor: João Pedro
branch: feat/aprendizagem-evidencia-requisito
modulo: Aprendizagem
titulo: Evidência pela linha do requisito — MERGEADO (PR #193)
---

## Evidência pela linha do requisito — MERGEADO (PR #193)

**Fechamento:** o recurso "evidência pela linha do requisito do cargo" (Aprendizagem → ficha do colaborador) foi **mesclado na linha principal** (squash `09747a17`, deploy automático). Cada requisito do cargo passou a ser acionável — a evidência entra na própria linha, herda o nome e o tipo do requisito e a lacuna vira "Atende" na hora; a seção manual foi renomeada "Outras competências".

**Revisão e qualidade:** além da execução tarefa-a-tarefa com revisão por etapa e de uma revisão do branch inteiro que evitou uma perda silenciosa de evidência antes da publicação, o material passou por **três rodadas dos revisores automáticos** (três ferramentas independentes). Todos os apontamentos relevantes foram tratados com testes, entre eles um de severidade alta: ao corrigir o nível de uma competência que tinha registros duplicados herdados de migrações antigas, a correção não surtia efeito — passou a atualizar todos os registros da mesma competência de uma vez. Também foram endurecidos o comportamento de limpar anexos na edição, o bloqueio de salvar enquanto um anexo é enviado, e a leitura de quem só visualiza.

**Validação:** verificação de tipos sem erros; testes de interface e de integração das rotas, do mecanismo de reconhecimento e do contrato; e validação em navegador do fluxo ponta a ponta (anexar evidência num requisito "Não avaliável" e vê-lo virar "Atende"). Prints antes/depois arquivados para os superiores.

**Sem risco para produção:** sem tabela nova, sem alteração de estrutura de banco e sem migração de dados; reutiliza estruturas existentes.

**Pendências registradas (follow-up):** (1) tornar a evidência visível também para o perfil somente-leitura/auditor; (2) permitir remover um atestado de competência que tenha registros duplicados herdados. Ambas são melhorias incrementais, não impedem o uso.

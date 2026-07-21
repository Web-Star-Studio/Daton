---
hora: "14:57"
autor: João Pedro
branch: feat/aprendizagem-evidencia-requisito
modulo: Aprendizagem
titulo: Evidência pela linha do requisito na ficha do colaborador (PR #193 draft)
---

## Evidência pela linha do requisito na ficha do colaborador (Aprendizagem)

**O que foi feito:** resolvido o problema relatado pela cliente — na ficha do colaborador ela não encontrava onde anexar a evidência (certificado) de uma competência exigida pelo cargo. A investigação mostrou que a queixa de layout escondia um problema funcional: a ficha passou a ter dois blocos de competência (um somente-leitura no topo, alimentado pelo mecanismo automático; outro manual mais abaixo), e o mecanismo que reconhece uma evidência como prova de um requisito compara nome **e** tipo — como a competência manual tinha nome livre, ela nunca casava com o requisito do cargo e a evidência ficava "órfã".

**Solução:** cada linha de requisito do cargo passou a ser **acionável** — o botão "Anexar evidência" abre um diálogo já com o nome e o tipo travados vindos do próprio requisito, de modo que a evidência casa a chave por construção e o requisito é reconhecido na hora (a lacuna vira "Atende"). O bloco manual de baixo foi renomeado "Outras competências" e passou a mostrar apenas competências que não são requisito do cargo, eliminando a duplicação e a confusão. O casamento de nome/tipo ficou concentrado no servidor (autoritativo), com um endpoint que faz upsert por chave dentro de transação e trava concorrente (advisory-lock) para nunca duplicar. Um selo enganoso ("Requisitos atendidos" quando nada havia sido avaliado) também foi corrigido.

**Impacto/área:** módulo Aprendizagem — ficha do colaborador (competências do cargo e competências manuais), o mecanismo de conformidade e o contrato da API.

**Sem risco para produção:** sem tabela nova, sem DDL e sem migração de dados. Reutiliza a tabela de competências existente; cadastros legados de nome livre passam a aparecer em "Outras competências" naturalmente.

**Processo/qualidade:** executado tarefa-a-tarefa por subagentes com revisão a cada task e uma revisão final do branch inteiro. A revisão final identificou, antes da publicação, um risco sério de perda silenciosa de evidência (reabrir uma evidência parcial abria o formulário em branco e podia apagar o certificado já anexado) — corrigido antes do merge.

**Status:** implementado; PR em **draft (#193)**, aguardando aprovação para merge. Nada foi aplicado em produção.

**Validações:** verificação de tipos sem erros; testes unitários e de integração das rotas, do resolvedor e do contrato; build completo; e validação em navegador do fluxo ponta a ponta (anexar evidência num requisito "Não avaliável" e confirmar que vira "Atende"; enviar deliberadamente tipo/nome divergente pela API e confirmar que o servidor grava pela chave; confirmar que a competência atestada não duplica em "Outras competências").

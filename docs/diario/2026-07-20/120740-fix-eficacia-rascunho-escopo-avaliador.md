---
hora: "12:07"
autor: João Pedro
branch: fix/eficacia-rascunho-escopo-avaliador
modulo: Aprendizagem
titulo: Avaliação de eficácia: correção de três defeitos apontados na revisão
---

Correção de três defeitos identificados na revisão automatizada do wizard de Avaliação de Eficácia, publicados após a entrega inicial.

**Contexto.** A entrega anterior foi publicada com as verificações obrigatórias aprovadas, mas a revisão automatizada de código ainda estava em execução. Ela concluiu depois da publicação e apontou problemas reais, que exigiram uma segunda rodada de correção.

**Defeitos corrigidos.**
1. *Isolamento entre avaliadores.* O preenchimento parcial de um avaliador era exibido aos demais, permitindo que fosse concluído em nome de outra pessoa. Como a avaliação de eficácia admite múltiplos avaliadores (gestor, RH, instrutor e colaborador), o conteúdo passou a ser restrito a quem o registrou.
2. *Distorção de indicadores.* Três consultas que identificam a avaliação mais recente de um treinamento não distinguiam preenchimento parcial de avaliação concluída. Como o preenchimento parcial é sempre mais recente, bastava alguém iniciar um para que um treinamento já avaliado passasse a exibir resultado e data incorretos nos indicadores de eficácia e de cumprimento de prazo.
3. *Inconsistência de estado.* Após a correção do item 1, a listagem podia devolver um mesmo treinamento na coluna "em avaliação" enquanto o classificava como "pendente". A existência de preenchimento parcial passou a ser avaliada independentemente de quem o registrou, mantendo o conteúdo restrito.

**Decisão registrada.** A revisão sugeriu descartar os preenchimentos parciais dos demais avaliadores ao concluir uma avaliação. A sugestão não foi adotada, por implicar perda de trabalho em andamento de terceiros; o efeito indesejado foi eliminado por outro caminho, sem descarte de dados.

**Impacto.** Módulo Aprendizagem — tela de Avaliação de eficácia e indicadores derivados dela.

**Status.** Concluído e publicado. Sem necessidade de alteração de banco.

**Validações.** Verificação de tipos aprovada. Trinta e três testes de integração de eficácia aprovados, sendo três novos cobrindo exatamente os cenários acima, cada um validado por falseamento — desfazendo a correção correspondente, apenas o teste relacionado falha. A revisão automatizada concluiu sem apontamentos na versão final.

**Aprendizado de processo.** Aguardar a conclusão da revisão automatizada antes de publicar, mesmo quando as verificações obrigatórias já estão aprovadas: os apontamentos desta rodada eram todos legítimos e teriam sido evitados na entrega anterior.

---
hora: "09:33"
autor: João Pedro
branch: worktree-catalogo-ficha-turmas
modulo: Aprendizagem
titulo: Catálogo: entrega integrada e publicada (correção do cartão + ficha com turmas, Abrir turma e Realizados)
---

Conclusão da entrega no Catálogo de treinamentos (Aprendizagem): as duas frentes foram integradas à versão principal do sistema e publicadas.

**O que foi publicado.** (1) Correção do rótulo de norma que quebrava o cartão do catálogo — o título do treinamento voltava a ocupar quatro linhas quando a norma tinha nome longo; agora o título tem prioridade de espaço e a norma aparece de forma compacta, com o texto completo disponível ao passar o mouse e na ficha. (2) A ficha do treinamento passou a exibir o histórico de turmas (código, data, filial, inscritos, realizados e situação) e ganhou as ações "Duplicar" e "Abrir turma", que leva direto à criação de turma com o treinamento já selecionado. (3) A coluna "Realizados" — quantos participantes de fato concluíram e foram aprovados — fechando a paridade com o layout de referência.

**Integração e publicação:** integrado à versão principal em 20/07/2026, com publicação automática. Antes da integração o ramo foi atualizado com as mudanças mais recentes da versão principal (que incluíam a entrega de Indicadores), e o código gerado a partir da especificação da API foi regerado para garantir consistência entre as duas entregas — sem divergências.

**Impacto/área:** Aprendizagem (Catálogo e Turmas). Sem alteração de estrutura de banco de dados, portanto sem qualquer passo manual em produção. A mudança na API é aditiva, o que torna segura qualquer ordem de publicação entre servidor e interface.

**Validações antes da integração:** verificação de tipos limpa em todos os pacotes; testes de integração de turmas 7/7; 44 testes de unidade das bibliotecas afetadas e da entrega de Indicadores; todas as verificações automáticas do repositório aprovadas, incluindo a revisão automática de código. Conferência visual na interface reproduzindo os dados do layout de referência.

**Pendência registrada (anterior a esta entrega):** a suíte de testes de integração possui três falhas pré-existentes, em Governança, LAIA e no registro de treinamento a partir do catálogo. Foram reproduzidas sem as mudanças desta entrega, confirmando que são anteriores a ela. Ficam registradas para tratamento próprio.

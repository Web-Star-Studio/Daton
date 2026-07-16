---
hora: "14:13"
autor: João Pedro
branch: feat/catalogo-excluir-cascata
modulo: Aprendizagem
titulo: Exclusão do catálogo em cascata + perfil de treinamento (PR #163)
---

## Exclusão do catálogo de treinamentos em cascata + perfil de treinamento como registro/avaliação (PR #163)

**O que foi feito**

Duas frentes complementares na gestão de treinamentos, entregues e mergeadas na main (squash 53f1405d):

1. **Exclusão do catálogo em cascata.** A exclusão de um treinamento do catálogo passou a lidar corretamente com suas dependências (obrigatoriedades por cargo, turmas e itens do programa anual). Sem cascata, a API responde 409 informando as contagens de dependências; com a cascata confirmada, o treinamento é removido e a obrigatoriedade "cargo X deve fazer Y" deixa de existir junto com as pendências ainda não realizadas — enquanto o registro de quem já concluiu é preservado como histórico. A confirmação passou a ser um diálogo na própria interface (em duas fases, mostrando o impacto antes de excluir), substituindo o pop-up nativo do navegador.

2. **Perfil do colaborador — aba Treinamentos.** O perfil deixou de permitir editar a definição do treinamento (nome, objetivo e conteúdo pertencem ao catálogo e valem para todos). No lugar, passou a focar no registro do colaborador: "Registrar conclusão" (status, data, validade e evidência), "Remover da ficha" (com aviso claro de que só afeta aquele colaborador — não os demais nem o catálogo) e a avaliação de eficácia. A avaliação de eficácia e o indicador "Pendente de eficácia" passaram a aparecer apenas após a conclusão do treinamento.

**Por quê**

A cliente não conseguia excluir treinamentos do catálogo (a proteção bloqueava sem dar retorno visível) e havia uma brecha no perfil que permitia, sem clareza, editar/excluir o treinamento a partir da ficha de um colaborador. Separar "definição do treinamento" (catálogo) de "registro do colaborador" (perfil) reduz ambiguidade e alinha o fluxo à ISO 9001:2015 §7.2 — a eficácia é medida após a conclusão, não antes.

**Impacto / área afetada**

Módulo de Aprendizagem: catálogo de treinamentos, obrigatoriedades, turmas, programa anual e perfil do colaborador. A exclusão reforçou a separação por organização (evita afetar dados de outra empresa). Deploy automático em produção (Render + Cloudflare Pages) ao mergear na main.

**Status e validações**

Concluído e mergeado (PR #163). `pnpm typecheck` verde; testes de integração da exclusão em cascata passando; validado em ambiente de teste antes do merge.

**Pendências relacionadas**

Certificado de conclusão em PDF: especificação aprovada, implementação em andamento (frente separada).

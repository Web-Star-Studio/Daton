---
hora: "00:58"
autor: João Pedro
branch: feat/gestao-aprendizagem
modulo: Gestão de Aprendizagem
titulo: Carga de treinamentos: ajuste do tratamento de Anápolis (esclarecimento da cliente)
---

Correção na ferramenta de carga de treinamentos, a partir de esclarecimento da cliente (Ana, SGI Gabardo).

**O que a cliente esclareceu:** os treinamentos de Anápolis se vinculam ao nome do colaborador; se ele está cadastrado no pátio de carregamento ou no da frota é indiferente para o treinamento — o que vale é a unidade em que o colaborador já está cadastrado.

**O que foi ajustado:** a regra anterior deduzia a filial de Anápolis pela planilha e, quando essa filial divergia da que o colaborador tem cadastrada, marcava o registro como "casamento fraco" e o descartava. Isso descartaria cerca de 14 mil registros de Anápolis (quase metade da base) e também prejudicaria quem trocou de filial ao longo dos anos. Agora as duas unidades de Anápolis são tratadas como equivalentes e a unidade não descarta mais nenhum registro — a checagem de segurança contra homônimos passou a usar apenas a data de admissão. Todos os testes automatizados seguem verdes.

**Status:** ferramenta ajustada e preservada no branch da carga; a carga real permanece para depois da publicação do módulo, com simulação revisada pela cliente.

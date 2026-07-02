---
hora: "14:29"
autor: João Pedro
branch: chore/carga-gabardo
modulo: carga-funcoes-treinamentos
titulo: Dry-run matcher: resolução de unidades/colaboradores/cargos (Task 3)
---

## O que foi feito

Implementação completa da Task 3 do tooling de carga de FUNÇÕES+TREINAMENTOS:

- **`lib/db-load.mjs`**: biblioteca de matchers com caches em memória (evita N+1 nos 32.636 registros):
  - `resolveUnit(client, orgId, unitLabel, area)` — resolve rótulo via `units-map.json` (direct, byArea Anápolis, directConfirmed Corporativo, skip) e localiza a `unit` na org por nome exato
  - `matchEmployee(client, orgId, name, unitId?, admissao?)` — normaliza nome (NFD+uppercase+trim), casa por nome e desambigua por unidade/data de admissão quando há homonímia
  - `resolvePosition(client, orgId, name)` — casa cargo por nome normalizado; null = a criar
  - `normalizeName`, `getMappedFilialName`, `clearCaches`, `createClient`

- **`dry-run.mjs <orgId>`**: carrega staging JSON, roda os matchers sobre todos os registros, grava `report/dry-run-<orgId>.json` e imprime resumo no console. Zero escrita no banco.

- **`test-dry-run.mjs`**: testa contra a base de integração (:55432) — cria org temporária + 3 unidades + 3 colaboradores com nomes do staging; verifica getMappedFilialName (7 asserções), resolveUnit com DB (9), matchEmployee com DB (5), resolvePosition (1), subprocesso dry-run (1) e relatório JSON (17). 39 asserções, 0 falhas. Limpa tudo no finally.

## Por que

Tooling não-destrutivo para carga do histórico de treinamentos e cargos da Gabardo. O dry-run é o gatekeeper: só o apply (Task 4+5) escreve dados, e apenas para colaboradores casados.

## Impacto / Área afetada

Scripts de carga (branch chore/carga-gabardo, a partir de feat/gestao-aprendizagem). Sem impacto em produção — zero escrita.

## Status e validações

- Commit eb9e4f7
- 39 asserções de integração OK (:55432)
- Fixture criada e limpa no teste; banco de integração inalterado ao final

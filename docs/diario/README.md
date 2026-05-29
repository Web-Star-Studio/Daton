# Diário de Bordo — Daton

Registro diário de tudo que é feito no projeto, para **auditoria** e para **envio aos superiores**.

## Como funciona

- **Um arquivo por dia:** `docs/diario/AAAA-MM-DD.md` (ex.: `docs/diario/2026-05-29.md`).
- Ao concluir uma tarefa/feature/correção, adiciona-se uma entrada no arquivo do dia.
- Ao final do dia (ou quando necessário), gera-se o **PDF** a partir do MD para envio.

## Regras de escrita

- **Idioma:** PT-BR, profissional e objetivo (o conteúdo vai para superiores).
- **Fidelidade:** registrar o que foi de fato concluído, o que ficou pendente e o que falhou — sem inflar nem omitir.
- Cada item deve deixar claro: **o que** foi feito, **por quê**, **impacto/área** afetada, **status** e **validações** (typecheck/build/testes).

## Modelo de um dia

```markdown
# Diário de Bordo — AAAA-MM-DD

**Projeto:** Daton (plataforma ESG / Qualidade / Compliance — ISO 9001/14001)
**Responsável:** <nome>
**Módulo(s):** <ex.: Indicadores (KPI)>

## Resumo do dia
<2-4 linhas com o panorama geral do que foi entregue.>

## Atividades

### 1. <Título da atividade>
- **O que:** <descrição objetiva>
- **Por quê:** <motivação / problema resolvido>
- **Impacto/área:** <telas, módulos, arquivos principais>
- **Status:** concluído | em andamento | bloqueado
- **Validação:** <ex.: pnpm typecheck OK, pnpm build OK, testado no app>

### 2. ...

## Validações do dia
- `pnpm typecheck`: <resultado>
- `pnpm build`: <resultado>

## Pendências / próximos passos
- <itens em aberto, decisões pendentes, próximos passos>
```

## Gerar o PDF

Solicitar ao Claude (usa a skill `pdf`): *"gere o PDF do diário de hoje"*.
O PDF fica ao lado do MD: `docs/diario/AAAA-MM-DD.pdf`.

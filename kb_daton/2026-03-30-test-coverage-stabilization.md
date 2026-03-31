# Test Coverage Stabilization - 2026-03-30

## Context

After merging `main` into `test-coverage`, the branch had passing targeted fixes in some areas but still had drift between current UI behavior and existing test assumptions.

## What We Learned

- The supplier detail page is now consultative on the `Cadastro` tab.
- The primary action on the supplier detail header is now `Alterar cadastro`, not `Salvar cadastro`.
- The supplier name is rendered as visible text/heading, not as an editable input.
- The supplier detail page still allows receipt registration for roles with receipt permissions through the `Recebimentos` tab.
- After a page reload, the supplier detail page returns to the default tab, so tests that assert receipt data must reopen `Recebimentos`.
- Selecting organization users by visible label is brittle in E2E because generated admin names may differ from fixture expectations; selecting by user id is more stable.
- Several create/edit flows became much more stable when seeded by API first and then validated through UI.

## Corrections Applied

### Unit tests

- Updated supplier detail unit tests to assert the current read-only UI instead of looking for `displayValue("Fornecedor Exemplo")`.
- Updated header action assertions to use `Alterar cadastro` on the `Cadastro` tab.
- Preserved the behavioral checks for:
  - operator access to receipt registration
  - tab-dependent header actions
  - analyst read-only restrictions

### E2E tests

- Stabilized document workflow tests by separating workflow validation from real storage upload dependency.
- Stabilized governance and organization flows by using more explicit selectors and, where appropriate, API setup before UI assertions.
- Stabilized supplier E2E by creating the supplier and offering via API, then validating receipt registration in UI.
- Stabilized employee E2E by splitting concerns:
  - one test validates detail rendering with seeded history
  - another test validates the wizard profile-history step itself

## Validation Snapshot

- `pnpm test:e2e`: `26 passed`
- `pnpm test:unit:coverage`: `73 passed`

## Coverage Snapshot

- Statements: `5.88%`
- Branches: `52.81%`
- Functions: `23.24%`
- Lines: `5.88%`

## Notes

- The global unit coverage percentage is low because the report includes the whole monorepo, while only a focused subset currently has unit coverage.
- Functional confidence is stronger than the raw unit percentage suggests because the critical end-to-end flows are covered and currently green.

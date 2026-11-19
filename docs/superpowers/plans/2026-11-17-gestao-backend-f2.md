# Gestão backend — Fase F2 (Vendas): plano detalhado

> Detalha a F2 de `2026-11-17-gestao-backend.md`. Spec: `specs/2026-11-17-gestao-backend-design.md`.
> Execução em TDD, na ordem abaixo; cada passo termina com `pnpm vitest run <arquivo>` verde.

**Goal:** vendas do `/gestao` no Postgres, com as regras do domínio rodando no servidor.

**Contratos consumidos da F1 (não criados aqui):** `requireGestaoMember(event)` → `ContextoGestao`,
`exigirPermissao(ctx, chave)`, `registrarEvento(db, tenantId, e)` e `lerSettings(db, tenantId)`.
O serviço (`gestao-vendas.ts`) recebe-os por parâmetro (`DepsVendas`, `CtxVendas` estrutural) e só os
endpoints finos os importam.

**Contrato produzido:** `executarAcao` / `amarrar` / `AcaoPura` em `server/utils/gestao-acoes.ts` (F4 reusa).
Resposta de vendas: `{ versao, processo }`; sem `valores`, `processo` vem sem `pct`, `adiantamentos`, `fin`.

## Passos

- [x] **1. Despachante** (`server/utils/gestao-acoes.ts`, `test/server/gestao-acoes.test.ts`): 404, 422 `{erro}`, 409 «Este processo foi alterado por outra pessoa. Recarregue.», versão+1, ator/data amarrados.
- [x] **2. Migration 0060** (`gestao_vendas`, pk `(tenant_id, id)`, FK composta ao corretor do mesmo tenant, RLS sem policy + `revoke all`) e rollback.
- [x] **3. Mapper** (`server/mappers/gestao-venda.ts`): Zod de `Processo`, colunas copiadas do `dados`, `recortarValores` (também filtra o `hist` que cita adiantamento).
- [x] **4. Repository** (`gestao-venda.repository.ts`): escopo `tenant_id` + `corretor_id` no where, limite 200 por `updated_at desc`, `gravarVenda` com `where versao`, `idsDoAno`, `corretoresDoTenant`.
- [x] **5. Mapa de ações** (`gestao-vendas-acoes.ts`): 12 ações, permissão = a de `capacidades()` na tela, Zod por ação (campos extras descartados).
- [x] **6. Serviço** (`gestao-vendas.ts`): listar, ler, abrir (corretor abre em seu nome; retry no 23505), executar; evento por ação.
- [x] **7. Endpoints** `vendas.get|post`, `vendas/[id].get`, `vendas/[id]/acoes.post`.
- [x] **8. Review Focus**: corretor B → 404; duas abas → 409; recorte de valores; guardrails (`gestao-vendas-guardrail.test.ts`).
- [ ] **9. Pendentes de outras fases:** `documentosDoProcesso` (F3) e os endpoints dependem da F1 para typecheck.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `dados` = `Processo` inteiro; colunas são cópia para filtro | Dividir o processo entre colunas | Mantém o domínio aprovado; a leitura confia em `dados` |
| Serviço com dependências injetadas | `vi.mock` de `gestao-auth` nos endpoints | Teste direto da regra, sem depender de módulo que a F1 ainda escreve |
| Falha ao registrar evento só vai ao log | Devolver 500 depois de gravar | O usuário repetiria uma ação já aplicada e tomaria 409 |
| `hist` filtrado sem `valores` | Só recortar os campos | O texto do histórico traz o valor do adiantamento |
| `documentosDoProcesso` devolve `[]` até a F3 | Criar tabela de documentos aqui | Etapas 2–5 só concluem pela API depois da F3 |

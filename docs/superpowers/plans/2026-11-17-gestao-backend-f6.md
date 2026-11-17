# Gestão backend — F6: leituras agregadas

Spec: `docs/superpowers/specs/2026-11-17-gestao-backend-design.md`. Plano-mãe: `2026-11-17-gestao-backend.md` (Fase F6).

**Objetivo:** financeiro, dashboard, auditoria e consulta cadastral simulada por HTTP, reaproveitando as funções puras de `layers/gestao/domain`.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Regra em `server/utils/gestao-leituras.ts`; endpoints finos chamando `requireGestaoMember(event)` | Regra no endpoint | O guardrail exige a chamada no endpoint; testar sem Nitro exige serviço à parte |
| Escopo do corretor = `verTodos` da matriz, também no financeiro | Escopo pela permissão `valores` | Dar `valores` ao corretor não deve mostrar contrato alheio |
| Dashboard monta o resumo sobre modelos completos e devolve só contagens/avisos | Reusar a lista já recortada de `valores` | Recortada, a locação perde cobranças e o atraso some; o resumo não tem R$ |
| Documentos a conferir lidos por `alvo_id in (ids visíveis)` | Ler os 200 mais recentes do tenant | O limite cortaria documentos do corretor |
| Auditoria sem `atorUserId` na resposta | Devolver o evento cru | A tela mostra nome; uuid de usuário não é assunto dela |
| `gestao_consultas` só com `documento_mascarado` (check de máscara) | Guardar documento cifrado | Sem prazo/base legal definidos; política de privacidade não prevê |
| `C-NNNN` por tenant, 23505 → 409 | Sequence global | Mesma decisão de vendas/locações |
| `contratoId` da consulta validado no escopo do membro (404) | Gravar o texto livre | Evita sondar ids de outro corretor/tenant |

## Fora do escopo

Provedor real de crédito; migration aplicada (só o arquivo); front HTTP (F7); paginação além do limite de 200.

## Tarefas (TDD, `test/server/gestao-leituras.test.ts`)

1. Migration `0063_gestao_consultas.sql` + rollback; teste de forma (`gestao-consulta-mapper.test.ts`); o guardrail de migrations a cobre sozinho.
2. Mapper `gestao-consulta.ts` e repository `gestao-consulta.repository.ts` (colunas listadas, limite 200).
3. `listarParaConferir` em `gestao-documento.repository.ts`.
4. Serviço `gestao-leituras.ts`: `financeiro`, `dashboard`, `auditoria`, `consultas`, `consultar`.
5. Endpoints `financeiro.get`, `dashboard.get`, `auditoria.get`, `consultas.get|post`.
6. `pnpm typecheck && pnpm test`; `tenant-security-reviewer`; commit/push.

## Pontos em aberto (parecer do `tenant-security-reviewer`: sem achados)

- Histórico de consultas e auditoria valem para o tenant inteiro (sem `escopoCorretor`), como no protótipo. Na matriz padrão só perfis com `verTodos` os têm; se o Dono ligar `consulta` para o corretor, ele verá consultas de contratos alheios. Decidir antes de liberar essa permissão ao corretor.
- «Documentos a conferir» do Dashboard conta até 200 (limite da lista); acima disso o número subestima.

# Gestão backend — F3 Documentos: plano detalhado

> Detalha a Fase F3 de `2026-11-17-gestao-backend.md`. Spec: `specs/2026-11-17-gestao-backend-design.md`.

**Goal:** documentos do `/gestao` em bucket privado `gestao-docs`, com versões, lixeira, conferência e
download por URL assinada de 60 s. Caminho do Storage **nunca** vem do cliente.

**Dependência F1:** `requireGestaoMember`, `exigirPermissao`, `registrarEvento` (branch
`claude/friendly-planck-u9wtqu-f1`, ainda inexistente no remoto quando esta fase começou). Os endpoints são
finos e importam esses três por caminho explícito; toda a regra mora em módulos que só dependem de um
`ctx` estrutural (`CtxAlvo`), testáveis sem a F1. Os testes de endpoint usam `vi.mock` da F1.
Não se cria `gestao-auth.ts` aqui.

## Tarefas (TDD: teste vermelho → código → verde)

- [ ] T1 `server/utils/gestao-documento-regras.ts` (puro): limite 15 MB, mimes, extensão×mime, limpeza de
  nome, formato de `alvoId`, `caminhoDoDocumento`, `caminhoPertenceAoTenant`, `inspecionarBytes`.
  Teste: `test/server/gestao-documento-regras.test.ts`.
- [ ] T2 `supabase/migrations/0061_gestao_documentos.sql` + guardrail
  `test/server/gestao-documentos-migration-guardrail.test.ts` (RLS, revoke, sem policy, bucket privado, limites).
- [ ] T3 mapper `server/mappers/gestao-documento.ts` (row → `Documento` do domínio; **sem** `storage_path`).
- [ ] T4 repository `server/repositories/gestao-documento.repository.ts` (tudo com `tenant_id`; update
  condicional por `versao`). Teste com `fakeSupabase`.
- [ ] T5 `server/utils/gestao-alvo.ts` `carregarAlvoVisivel` (404 se não é do tenant ou, para quem só vê os
  próprios, de outro corretor). Teste: corretor A × B, tenant × tenant.
- [ ] T6 `server/utils/gestao-documentos.ts` (orquestração: iniciar envio, confirmar, download, conferir,
  apagar, restaurar, listar, lixeira) com storage falso. Review Focus 1 e 5.
- [ ] T7 endpoints finos em `server/api/gestao/documentos/**` + teste de endpoint (F1 mockada).
- [ ] T8 LGPD: `privacidade.vue` e runbook — decisão registrada no commit/relatório.
- [ ] T9 `pnpm typecheck && pnpm test`, `tenant-security-reviewer`, commit, push só em `-f3`.

## Decisões da fase

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Linha nasce `estado = 'pendente'` e só vira `enviado` em `confirmar`; listas ignoram `pendente` | Gravar já como enviado | O upload é direto ao Storage; sem confirmar, o servidor não sabe o que chegou |
| `confirmar` abre o objeto e decide o formato pelos primeiros bytes (`formatoPelaAssinatura`) | Confiar no `mime` do cliente | Mesmo incidente da 0052 (`.exe` renomeado) |
| Versão nova = novo objeto em `…/<versao>`; confirmar faz `update … where versao = anterior` | Sobrescrever o objeto | Versão antiga continua no bucket; corrida entre duas abas vira 409 |
| Limite 15 MB (plano), não 20 MB do `LIMITE_BYTES` do domínio/`acoes.ts` | Manter 20 MB | O plano fixa 15 MB no bucket; a tela avisava 20 MB; unificada em 15 MB no domínio e na tela (achado no teste de navegador) |
| Validação manual, sem Zod | Zod | Zod não está nas dependências do repo; o padrão de `server/utils/validate.ts` é manual |

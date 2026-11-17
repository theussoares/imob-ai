# Gestão backend — Fase F4 (Locação): plano detalhado

> Detalha a «Fase F4» de `2026-11-17-gestao-backend.md`. Spec: `specs/2026-11-17-gestao-backend-design.md`.
> Escrito e executado inline (os skills `superpowers:*` não estavam disponíveis na sessão); TDD por camada.

**Goal:** persistir e servir a locação do `/gestao` (8 etapas, garantia, vistoria, contrato, cobrança, repasse,
renovar/encerrar/arquivar) rodando as ações puras de `domain/acoes-locacao.ts` no servidor.

## Dependências (outras branches)

| Vem de | Símbolo | Uso |
|---|---|---|
| F1 | `requireGestaoMember`, `exigirPermissao`, `ContextoGestao` (`server/utils/gestao-auth.ts`) | endpoints e serviço |
| F1 | `registrarEvento` (`server/repositories/gestao-evento.repository.ts`) | auditoria append-only |
| F2 | `executarAcao` (`server/utils/gestao-acoes.ts`) | carregar → função pura → gravar (404/422/409) |
| F3 | tabela `gestao_documentos` (0061) | só leitura, para o checklist de «concluir etapa» |

Integrado: as fases estão juntas na branch; os stubs, o alias de `vitest.config.ts` e os `vi.mock` de F1/F2 saíram. Os documentos do checklist vêm de `listarDocumentosDoAlvo` (F3), que exclui upload pendente e lixeira.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `versao` obrigatória no corpo de `acoes` (a que a tela leu); `carregar` compara e dá 409 | Só a versão lida no próprio request (o que `executarAcao` faz sozinho) | Esta só protege a janela de milissegundos entre ler e gravar; «duas abas» exige o número que a aba tinha |
| Recorte sem `valores` por **allowlist** (`semValores`) | `delete contrato.valor` | Campo financeiro novo no domínio nasce escondido |
| 403 pela matriz antes de carregar; `proprio` conferido depois de carregar | Carregar sempre antes | Sem permissão nenhuma o id não importa (nada vaza); `proprio` precisa da locação |
| `corretorId`/`imovelId` do corpo conferidos contra o tenant; corretor não reatribui | Confiar no corpo | Invariante 1: o corpo nunca escolhe a imobiliária de um vínculo |
| `agoraBrasil()` para `quando` e «hoje» dos avisos | `new Date()` (UTC no servidor) | 22h em Brasília viraria 01h do dia seguinte e o aviso «vence hoje» mudaria à noite |
| Falha ao gravar `gestao_eventos` depois da ação: `logError` e segue | Responder 500 | A ação já valeu; 500 faria o cliente repetir e tomar 409. O `hist` do agregado guarda a ação |
| `idDeLocacao` próprio (`L-AAAA-NNNN`) + exceção na varredura `id-de-rota` | Forçar uuid | O id da locação é o código do domínio |

## Tarefas

- [x] **T1 Migration** `0062_gestao_locacoes.sql` — RLS sem policy, `revoke`, pk `(tenant_id, id)`, `versao`. Teste: `gestao-locacoes-migration.test.ts`. **Não aplicada.**
- [x] **T2 Mapper** `server/mappers/gestao-locacao.ts` — Zod de `Locacao`, ida/volta, `semValores`. Teste: `gestao-locacao-mapper.test.ts`.
- [x] **T3 Repository** `server/repositories/gestao-locacao.repository.ts` — tudo com `tenant_id`, colunas explícitas, `gravarLocacao` com `where versao`. Teste: `gestao-locacao-repository.test.ts`.
- [x] **T4 Mapa de ações** `server/utils/gestao-locacao-acoes.ts` — 12 ações, permissão = a da tela, Zod por ação. Teste: `gestao-locacao-acoes.test.ts`.
- [x] **T5 Serviço** `server/utils/gestao-locacao-servico.ts` — listar, ler, abrir, agir; avisos com `hoje` do servidor. Teste: `gestao-locacao-servico.test.ts` (Review Focus 1 e 2).
- [x] **T6 Endpoints** `server/api/gestao/locacoes.get|post.ts`, `locacoes/[id].get.ts`, `locacoes/[id]/acoes.post.ts` (finos).
- [x] **T7 Verificação** `pnpm typecheck && pnpm test`; `tenant-security-reviewer`; commit e push em `claude/friendly-planck-u9wtqu-f4`.

## Contrato HTTP (para a F7)

- `GET /api/gestao/locacoes[?arquivadas=1]` → `{ locacoes: RespostaLocacao[] }`
- `GET /api/gestao/locacoes/:id` → `RespostaLocacao`
- `POST /api/gestao/locacoes` `{ locador, locatario, imovelId, imovel, corretorId? }` → 201 `RespostaLocacao`
- `POST /api/gestao/locacoes/:id/acoes` `{ acao, dados, versao }` → `RespostaLocacao` (409 se `versao` defasada)
- `RespostaLocacao = { locacao: Locacao | LocacaoSemValores, versao: number, avisos: AvisoLocacao[] }`

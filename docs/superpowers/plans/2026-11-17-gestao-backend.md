# Painel de gestão — backend real: plano de orquestração

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Este é o plano **por fase**. Cada fase roda numa sessão própria, que começa invocando
> `superpowers:writing-plans` para detalhar a sua fase em `docs/superpowers/plans/2026-11-17-gestao-backend-fN.md`
> (passo a passo TDD), respeitando os contratos («Interfaces») abaixo, e só então implementa.

**Goal:** trocar o mock do `/gestao` por backend real (Supabase Auth + Postgres + Storage) sem mudar as telas.

**Architecture:** endpoints Nitro em `server/api/gestao/**`; autenticação por `requireGestaoMember(event)`;
agregados (`gestao_vendas`, `gestao_locacoes`) em tabela com colunas de escopo + `dados jsonb`; o servidor
roda as funções puras de `layers/gestao/domain/acoes*.ts` sobre o agregado e grava com concorrência otimista
(`versao`). Front escolhe `Mock*`/`Http*` repository por `NUXT_PUBLIC_GESTAO_BACKEND`.

**Tech Stack:** Nuxt 4 / Nitro, Supabase (`serviceSupabase()`), Zod, Vitest em Node puro com `test/helpers/fake-supabase.ts`.

**Spec:** `docs/superpowers/specs/2026-11-17-gestao-backend-design.md`

## Global Constraints

- Leia `CLAUDE.md` da raiz inteiro antes de codar; as 4 invariantes de segurança valem em toda linha.
- `tenant_id` sai de `useTenantContext(event)` / `requireGestaoMember(event)`, **nunca** do body.
- Toda query por `serviceSupabase()` tem `tenant_id` no `where`. Repository recebe o client por parâmetro e devolve modelo (mapper), nunca row cru.
- Tabelas novas: `enable row level security`, `revoke all … from anon, authenticated`, sem policy. Migrations idempotentes, comentário de porquê no topo.
- **Não aplicar migration em banco nenhum** (develop e produção dividem o banco). Nada de `mcp__Supabase__apply_migration`/`execute_sql` de escrita. Só escrever o arquivo e testar.
- Números de migration reservados: F1 `0059_gestao_acesso.sql`, F2 `0060_gestao_vendas.sql`, F3 `0061_gestao_documentos.sql`, F4 `0062_gestao_locacoes.sql`, F6 `0063_gestao_consultas.sql` (se precisar).
- Celular, CPF e e-mail nunca em log (`server/utils/log.ts`). CPF mascarado em listagem/auditoria.
- Comentários no estilo da casa (porquê + alternativa descartada). Commits em português.
- Validação de fase: `pnpm typecheck && pnpm test` verdes. Guardrails (`public-payload-guardrail`, `privacidade-guardrail`) atualizados quando a fase tocar o que eles cobrem.
- Ator e data das ações vêm do servidor (`membro.nome`, `agora(new Date())`).
- Limite de lista: 200 itens, `order by updated_at desc`.

## Review Focus

- Corretor A pede `GET/POST` num processo/locação/imóvel/documento do corretor B pelo id → 404 (não 403, não vaza existência). Teste em F2, F3, F4, F5.
- Duas abas salvam o mesmo agregado → a segunda recebe 409 com mensagem «Este processo foi alterado por outra pessoa. Recarregue.»; nada é sobrescrito. Teste em F2 e F4.
- Membro removido / recurso `gestao` desligado no tenant com sessão ainda válida → 401/404 na próxima chamada. Teste em F1.
- Código do 2º fator: 6º erro bloqueia 15 min mesmo com o código certo; código de outro usuário/tenant não serve; reuso falha. Teste em F1.
- Documento na lixeira ou de outro tenant não gera URL assinada; caminho do Storage nunca vem do cliente. Teste em F3.

---

### Fase F1: Fundação e acesso — sessão Opus

**Files:**
- Create: `supabase/migrations/0059_gestao_acesso.sql` — `gestao_members` (`id`, `tenant_id`, `user_id` null até aceitar, `email`, `nome`, `perfil` check nos 4 perfis, `broker_id` null → `brokers`, obrigatório se perfil = corretor, `invite_token_hash`, `invite_expires_at`, `created_at`, únicos `(tenant_id, user_id)` e `(tenant_id, lower(email))`), `gestao_otp` (`user_id`, `tenant_id`, `code_hash`, `expires_at`, `attempts`, `locked_until`, `last_sent_at`, `consumed_at`), `gestao_sessions` (`session_id` uuid pk, `user_id`, `tenant_id`, `verified_at`), `gestao_settings` (`tenant_id` pk, `matriz jsonb`, `config jsonb`, `updated_at`), `gestao_eventos` (append-only: `id`, `tenant_id`, `ator_user_id`, `ator_nome`, `acao`, `alvo_tipo`, `alvo_id`, `quando`; trigger que recusa update/delete).
- Create: `server/utils/gestao-auth.ts`, `server/utils/gestao-otp.ts` (puro: gerar, hash com pepper `config.gestaoOtpPepper`, comparar em tempo constante, decidir bloqueio), `server/repositories/gestao-member.repository.ts`, `gestao-settings.repository.ts`, `gestao-evento.repository.ts`, `server/mappers/gestao-*.ts`.
- Create endpoints: `server/api/gestao/auth/convite/[token].get.ts` (valida convite), `auth/aceitar.post.ts` (cria usuário no Supabase Auth com a senha; regra de senha de `layers/gestao/domain/auth.ts`), `auth/login.post.ts` (senha via Supabase → devolve tokens + envia código), `auth/codigo.post.ts` (confere código → grava `gestao_sessions`), `auth/reenviar.post.ts`, `sessao.get.ts`, `membros.get.ts`, `membros.post.ts` (convite; permissão `convidar`), `membros/[id].delete.ts`, `membros/[id].patch.ts` (perfil/corretor), `configuracoes.get.ts|put.ts` (`admin`), `matriz.get.ts|put.ts` (`admin`).
- Test: `test/server/gestao-auth.test.ts`, `gestao-otp.test.ts`, `gestao-membros.test.ts`, `gestao-migration-guardrail.test.ts` (RLS + revoke em toda tabela `gestao_*` das migrations 0059+).

**Interfaces (Produces — todas as outras fases consomem):**
```ts
// server/utils/gestao-auth.ts
export interface MembroGestao { id: string; userId: string; tenantId: string; nome: string; perfil: Perfil; brokerId: string | null }
export interface ContextoGestao { membro: MembroGestao; tenant: Tenant; sessao: Sessao; matriz: MatrizPermissoes; db: SupabaseClient }
export async function requireGestaoMember(event: H3Event): Promise<ContextoGestao>   // 401 sem token/2º fator; 404 se recurso gestao desligado
export function exigirPermissao(ctx: ContextoGestao, chave: PermChave): void          // 403 se 'nao'
// server/repositories/gestao-evento.repository.ts
export async function registrarEvento(db: SupabaseClient, tenantId: string, e: { atorUserId: string; atorNome: string; acao: string; alvoTipo: 'venda'|'locacao'|'documento'|'imovel'|'membro'|'config'|'consulta'; alvoId: string }): Promise<void>
export async function listarEventos(db, tenantId, filtro: { quem?: string; de?: string; ate?: string }): Promise<EventoGestao[]>
// server/repositories/gestao-settings.repository.ts
export async function lerSettings(db, tenantId): Promise<{ matriz: MatrizPermissoes; config: ConfiguracoesGestao }>  // padrão do domínio quando não há linha
```
`Sessao` é a do domínio (`perfil`, `nome`, `corretorId = membro.brokerId`).

- [ ] Plano detalhado F1 (writing-plans) → TDD de `gestao-otp.ts` → migration + guardrail → `requireGestaoMember` com fakeSupabase (Review Focus 3) → endpoints de auth (Review Focus 4) → membros/matriz/config → privacidade: o código do 2º fator por e-mail **e** a conta do usuário do painel precisam constar em `app/pages/privacidade.vue` se a política cobre esse público; se não cobre (é usuário interno), registrar no PR por quê → `pnpm typecheck && pnpm test` → commit e push.

### Fase F2: Vendas — sessão Sonnet

**Files:** `supabase/migrations/0060_gestao_vendas.sql` (`gestao_vendas`: `id` text no formato do domínio `proximoId`, `tenant_id`, `corretor_id`, `status`, `arquivado`, `etapa`, `versao int`, `dados jsonb`, `updated_at`; pk `(tenant_id, id)`), `server/repositories/gestao-venda.repository.ts`, `server/mappers/gestao-venda.ts` (Zod de `Processo`), `server/utils/gestao-acoes.ts` (despachante genérico), `server/api/gestao/vendas.get.ts`, `vendas.post.ts` (abrir), `vendas/[id].get.ts`, `vendas/[id]/acoes.post.ts`. Testes `test/server/gestao-vendas.test.ts`.

**Interfaces:**
```ts
// server/utils/gestao-acoes.ts  (F4 reusa)
export type AcaoPura = (estado: Estado, ator: Ator, quando: string) => Resultado
export async function executarAcao<T extends { id: string; versao: number }>(opts: {
  carregar: () => Promise<T | null>; paraEstado: (a: T) => Estado; doEstado: (e: Estado, antes: T) => T;
  gravar: (novo: T, versaoAnterior: number) => Promise<'ok' | 'conflito'>; acao: AcaoPura }): Promise<T>   // 404 / 422 {erro} / 409
```
Despacho por nome: mapa `acao → { permissao: PermChave; zod; fn }` cobrindo `mudarStatus, concluirEtapa, salvarAbertura, salvarObservacao, arquivarProcesso, restaurarProcesso, registrarAdiantamento, removerAdiantamento, salvarFinanceiro, salvarPessoa, salvarImovel, salvarConferenciaFinal`. Permissão por ação = a mesma que `capacidades()` usa na tela. Corretor: filtro `corretor_id = membro.brokerId` quando `verTodos = proprio`. Cada ação bem-sucedida chama `registrarEvento`. Aba de comissão/valores: sem `valores`, o GET devolve o processo sem `pct`, `adiantamentos`, `fin` (mapper com recorte), e ações dessas partes dão 403.

- [ ] Plano detalhado F2 → TDD do despachante (409, 422, 404) → migration → repository/mapper → endpoints → Review Focus 1 e 2 → commit/push.

### Fase F3: Documentos — sessão Sonnet

**Files:** `supabase/migrations/0061_gestao_documentos.sql` (`gestao_documentos`: `id`, `tenant_id`, `alvo_tipo` venda|locacao, `alvo_id`, `requisito`, `nome`, `categoria`, `estado`, `tamanho`, `versao`, `mime`, `storage_path`, `enviado_por`, `apagado_por`, `apagado_em`, `created_at`; bucket privado `gestao-docs` com `file_size_limit` 15 MB e `allowed_mime_types` pdf/jpeg/png/webp; sem policy de storage para anon/authenticated), `server/repositories/gestao-documento.repository.ts`, endpoints `documentos.get.ts` (`?alvo=`), `documentos/upload.post.ts` (devolve `{ documentoId, uploadUrl, token }`), `documentos/[id]/confirmar.post.ts`, `[id]/download.get.ts` (URL assinada 60 s), `[id]/conferir.post.ts`, `[id]/apagar.post.ts`, `[id]/restaurar.post.ts`, `lixeira.get.ts`.

**Interfaces:** consome F1 e `carregarAlvoVisivel(ctx, tipo, id)` — F3 define em `server/utils/gestao-alvo.ts` lendo `gestao_vendas`/`gestao_locacoes` direto (as duas tabelas existem nas migrations 0060/0062; se F4 ainda não fez merge, F3 cria o teste contra a forma da 0062 descrita aqui). Permissões: `enviarDocs`, `conferir`, `apagarDocs`. Estado do item de checklist continua derivado (`Documento.requisito`).

- [ ] Plano detalhado F3 → TDD de caminho/limites → migration → endpoints → Review Focus 5 → privacidade/runbook LGPD se a política cobrir → commit/push.

### Fase F4: Locação — sessão Sonnet

**Files:** `supabase/migrations/0062_gestao_locacoes.sql` (`gestao_locacoes`, mesma forma de `gestao_vendas` + `imovel_id uuid null → properties`), repository, mapper (Zod de `Locacao`), `server/api/gestao/locacoes.get.ts`, `locacoes.post.ts`, `locacoes/[id].get.ts`, `locacoes/[id]/acoes.post.ts` usando `executarAcao` de F2. Ações: `salvarAberturaLocacao, salvarGarantia, salvarVistoria, salvarContrato, gerarCobranca, registrarPagamento, registrarRepasse, concluirEtapaLocacao, renovarLocacao, encerrarLocacao, arquivarLocacao, restaurarLocacao`. Etapa 7 e cobranças só com `valores` (recorte no mapper). Avisos (`avisos-locacao.ts`) calculados na leitura com `hoje` do servidor.

- [ ] Começa depois do merge de F2 (precisa do `executarAcao`). Plano detalhado → TDD → Review Focus 1 e 2 → commit/push.

### Fase F5: Imóveis — sessão Sonnet

**Files:** `server/api/gestao/imoveis.get.ts`, `imoveis.post.ts`, `imoveis/[id].get.ts|put.ts|delete.ts`, `imoveis/[id]/status.post.ts`, `imoveis/[id]/destaque.post.ts`, `imoveis/[id]/fotos/**`; `server/mappers/gestao-imovel.ts` (`Property` + campos internos → `ImovelGestao`). Reusa `property.repository.ts`; validação com `layers/gestao/domain/imoveis.ts`. Corretor: `broker_id = membro.brokerId` forçado na criação e filtro em leitura/escrita; `trocarCorretor` e exclusão pelas regras de `imoveis-acoes.ts` (`podeExcluirImovel`, que consulta locações ativas — ler `gestao_locacoes` se a tabela existir, senão tratar como nenhuma e marcar TODO no PR). Fotos: mesmo bucket e formato `url`/`urlSm` do `/admin` (`server/api/admin/properties/**`).

- [ ] Plano detalhado → TDD → Review Focus 1 → `tenant-security-reviewer` antes do commit → commit/push.

### Fase F6: Leituras agregadas — sessão Sonnet (depois de F2 e F4)

**Files:** `server/api/gestao/financeiro.get.ts` (`?competencia=`; só `valores`; usa `domain/financeiro.ts`), `dashboard.get.ts` (`domain/dashboard.ts`, recorte por permissão), `auditoria.get.ts` (`auditoria`; `listarEventos` + `hist`), `consultas.get.ts|post.ts` (`consulta`; resultado simulado de `domain/consulta.ts`, grava em `gestao_consultas` 0063 com documento mascarado).

- [ ] Plano detalhado → TDD → commit/push.

### Fase F7: Front HTTP — sessão Sonnet (depois de F1–F6)

**Files:** `layers/gestao/app/services/GestaoRepository.ts` (interface), `MockGestaoRepository.ts` (o que o store faz hoje), `HttpGestaoRepository.ts`, `HttpImoveisRepository.ts`; `useGestaoStore.ts` passa a delegar; `useGestaoAuth.ts` real (Supabase client só para sessão, tokens em memória + refresh, `Authorization: Bearer`); `runtimeConfig.public.gestaoBackend` (`NUXT_PUBLIC_GESTAO_BACKEND`, padrão `mock`). Mocker continua só no `dev:gestao`. Testes de contrato: os mesmos testes rodam contra Mock e Http (Http com `$fetch` falso).

- [ ] Plano detalhado → TDD → roteiro de QA em `layers/gestao/test/qa/fluxos.md` atualizado → commit/push.

## Orquestração

- Branch de integração: `claude/friendly-planck-u9wtqu`. Cada sessão trabalha em `claude/friendly-planck-u9wtqu-fN` criada a partir dela e o orquestrador faz o merge.
- Ordem: F1 → (F2 ∥ F3 ∥ F5) → F4 → F6 → F7.
- Revisão de cada fase pelo orquestrador + `tenant-security-reviewer` antes do merge.

## Pendências após a revisão

Revisão final do branch inteiro (`git diff origin/main...HEAD`) em 18/11, por duas passadas
independentes: segurança multitenant (`tenant-security-reviewer`) e geral (correção, contrato
do front, migrations, privacidade). Nenhum achado **Crítico**. Os **Importantes** que eram bugs
foram corrigidos com teste (abaixo); o resto está aqui, com a decisão que falta.

### Corrigido na revisão

| Achado | Correção |
|---|---|
| Venda aceitava ação em processo arquivado que o membro não vê (o GET dava 404, a escrita passava) | `executarAcaoVenda` devolve 404, como a locação |
| `idsDoAno` listava todos os ids do ano; acima de 1000 linhas o PostgREST corta e a abertura de venda dava 409 para sempre | lê só o maior id (`order desc` + `limit 1`) |
| Locação conferia `versao` (409) antes da permissão (403): confirmava a existência a quem não pode agir | permissão primeiro, como na venda |
| Locação travava o corretor pelo NOME do perfil; a venda, pela matriz (`verTodos`) | locação também usa `verTodos` (Recepção/Jurídico restritos a «os meus» não abrem em nome de outro) |
| Financeiro/dashboard somavam só 200 contratos sem avisar | resposta traz `truncado: true` quando a lista bateu no limite |

### Pendente

| Pendência | Por que não foi feito aqui | Quem decide / próximo passo |
|---|---|---|
| **Política de privacidade e `docs/runbooks/lgpd-site-publico.md` não cobrem o que o `/gestao` coleta**: e-mail e código do 2º fator (envio por terceiro), `gestao_consultas` (CPF/CNPJ mascarado + resultado de crédito + ator), `gestao_login_falhas` (HMAC de e-mail/IP), `gestao_eventos`/`gestao_sessions`/`gestao_otp`. Sem prazo de expurgo definido. O `privacidade-guardrail` passa porque não vigia `/gestao` | Base legal e retenção são decisão do controlador, não do código. As frases da política que existem continuam verdadeiras | Dono do projeto/DPO: tabela de tratamentos + retenção no runbook, expurgo de eventos/sessões/consultas, e se `privacidade.vue` precisa citar a equipe interna. **Antes de ligar para um cliente** |
| **Financeiro e Dashboard cobrem só os 200 contratos mais recentes** (o servidor avisa com `truncado`; a tela ainda não mostra o aviso). As listas de venda e locação já estão paginadas (ver «Paginação das listas») | Os totais somam em cima de todos os contratos: paginar não serve, é preciso somar no banco ou ler em blocos como a busca faz (teto de 5000) | Olmi/produto. Enquanto isso, `truncado` está na resposta |
| `gestao_locacoes` sem FK composta `(corretor_id, tenant_id)` / `(imovel_id, tenant_id)` (a `gestao_vendas` tem) | Hoje o servidor confere o tenant em `abrir` e `validarVinculos`, então não é explorável. A FK de `imovel_id` pede `unique (id, tenant_id)` em `properties` (tabela do catálogo público): migration que mexe em tabela de produção, e as migrations ainda não foram aplicadas | Nova migration depois do go-live, não editando a 0062 já revisada |
| Sem script de rollback para a 0059 e a 0062 (existem 0060, 0061, 0063) | O da 0059 apaga convites/sessões/códigos de todos os tenants: precisa de decisão e aviso | Escrever quando alguém precisar; o runbook já avisa |
| `ultimoIdConsulta`/`ultimoIdDoAno` (locação) ordenam id por texto: após `C-9999`/`L-AAAA-9999` o próximo repete e dá 409. O mesmo limite vale para `idsDoAno` (documentado) | Anos de uso até chegar lá; o comentário do código admite o limite | Trocar por contador/`max` numérico se um tenant se aproximar |
| `matriz.put` e `configuracoes.put` chamam `registrarEvento` sem try/catch: falha de auditoria depois de gravar devolve 500 por algo já aplicado | Vendas/locações/documentos logam e seguem; estes dois não | Mesmo tratamento (log e segue) |
| Fotos de imóvel: `position`/`isCover` calculados pelo `images.length` lido antes; dois envios concorrentes repetem posição/capa. `status`, `destaque` e fotos não usam `expectedUpdatedAt` | Comportamento herdado do `/admin` | Só se aparecer uso concorrente |
| Rebaixar dois Donos ao mesmo tempo pode deixar a imobiliária sem Dono ativo (`contarDonosAtivos` + `alterarMembro` não são atômicos). **Suspeita**, não confirmada | Baixa probabilidade; correção certa é constraint/RPC | Migration futura |
| `toVendaColunas` grava o processo sem passar por Zod (a locação passa) | A leitura já descarta linha inválida com log | Validar na escrita se algum dia entrar dado de outra origem |
| `iniciarEnvio` cria nova linha de documento a cada envio sem `documentoId`; não há índice único por `(tenant, alvo, requisito)` entre não apagados. **Suspeita** | Depende de como o domínio trata duplicata do mesmo item | Conferir no QA em banco de teste |
| Listas/auditoria limitadas a 200; uploads pendentes abandonados nunca são limpos; filtro «Quem» da auditoria sai só dos 200 eventos mais recentes | Limites da fase | Job de limpeza + paginação quando o volume pedir |
| Front manda `versao ?? 1` para locação quando a versão não foi guardada (a venda falha com 422) | Só ocorre com estado inconsistente; o 409 cai no «recarregar» | Igualar à venda |
| Não conferido: TTL do cache de `recursoLigado` (janela em que um `/gestao` desligado ainda responde) e se `auth.getUser` recusa JWT de sessão já encerrada | Revisor não confirmou lendo o código | Conferir no banco de teste (seção H do QA) |

### Paginação das listas (decisão: paginar no servidor, filtro na URL)

- `GET /api/gestao/vendas|locacoes?pagina=N&q=…&status=…` devolve `{ itens, total, pagina, porPagina, paginas, truncado }`. Sem `pagina` a resposta é a de sempre (200 mais recentes, que o store usa para o detalhe, o Dashboard e o Financeiro).
- Tamanho fixo de 24 (`POR_PAGINA`): a URL não escolhe, senão pediria a lista inteira.
- Sem busca de texto, escopo, status e página são do banco (`range` + contagem exata; ordem `updated_at desc, id desc` para a página seguinte não repetir linha). Página além do fim (416 do PostgREST) volta vazia com o total, e a tela vai para a última.
- Com busca, o servidor lê as linhas do filtro (blocos de 1000, teto `LIMITE_BUSCA` = 5000, `truncado` avisa) e casa com a mesma `filtrarProcessos`/`filtrarLocacoes` da tela, que ignora acento e casa CPF por dígitos. Alternativa descartada: `ilike` no `jsonb`, que não ignora acento. Custo: até 5 consultas por busca. Se pesar, o caminho é coluna de busca normalizada + índice (migration nova).
- Na tela, página, busca e status vivem na URL (`?pagina=2&q=silva&status=Concluído`, `useListaPaginada`). Busca e status voltam à página 1 e trocam a entrada do histórico; página empilha. Valor inválido na URL vira o padrão. No `mock` a mesma fatia sai do estado local, com as mesmas funções.
- Não feito: aviso de `truncado` da busca na tela; paginação da tela «Arquivados» e de «Documentos».

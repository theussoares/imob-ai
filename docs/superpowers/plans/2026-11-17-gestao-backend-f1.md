# Gestão backend — Fase F1: Fundação e acesso

> Detalhe da fase F1 de `2026-11-17-gestao-backend.md`. Spec: `docs/superpowers/specs/2026-11-17-gestao-backend-design.md`.
> Execução em TDD: teste vermelho → código mínimo → verde → próximo passo. Validação final `pnpm typecheck && pnpm test`.

**Goal:** login de verdade no `/gestao` (convite → senha → código por e-mail → sessão) e a base que as fases
F2–F7 consomem: `requireGestaoMember`, `exigirPermissao`, `registrarEvento`/`listarEventos`, `lerSettings`.

**Fora desta fase:** front HTTP (F7), Turnstile real, aplicar a migration em qualquer banco.

## Contratos (Produces) — nomes e assinaturas fixos

```ts
// server/utils/gestao-auth.ts
export interface MembroGestao { id; userId; tenantId; nome; perfil: Perfil; brokerId: string | null }
export interface ContextoGestao { membro; tenant: Tenant; sessao: Sessao; matriz: MatrizPermissoes; db: SupabaseClient<Database> }
export async function requireGestaoMember(event: H3Event): Promise<ContextoGestao>
export function exigirPermissao(ctx: ContextoGestao, chave: PermChave): void
// server/repositories/gestao-evento.repository.ts
export async function registrarEvento(db, tenantId, e): Promise<void>
export async function listarEventos(db, tenantId, filtro): Promise<EventoGestao[]>
// server/repositories/gestao-settings.repository.ts
export async function lerSettings(db, tenantId): Promise<{ matriz; config }>
```

## Tarefas

### 1. Regras puras do 2º fator — `server/utils/gestao-otp.ts`
- [x] Teste `test/server/gestao-otp.test.ts`: hash HMAC amarrado a tenant+usuário (código de outro usuário/tenant
      não casa); emissão recusa durante bloqueio e antes de 60 s; verificação: certo passa e consome, reuso falha,
      expirado falha, 5 erros bloqueiam 15 min, a 6ª tentativa com o código CERTO é recusada, bloqueio vencido zera,
      tentativas não zeram com código novo (só com acerto ou fim do bloqueio).
- [x] Implementar `hashCodigoOtp`, `decidirEnvioOtp`, `decidirVerificacaoOtp`, `chaveDeFalha`, `pepperDoOtp`.

### 2. Migration `0059_gestao_acesso.sql` + guardrail
- [x] Teste `test/server/gestao-migration-guardrail.test.ts`: lê toda migration ≥ 0059; cada `create table … gestao_*`
      tem `enable row level security` e `revoke all … from anon, authenticated`; nenhuma `create policy` em `gestao_*`;
      `gestao_eventos` tem trigger que recusa update/delete; `gestao_members` tem os únicos e o check de perfil/corretor.
- [x] Escrever a migration (idempotente, comentário de porquê). Tabelas: `gestao_members`, `gestao_otp`,
      `gestao_sessions`, `gestao_settings`, `gestao_eventos`, `gestao_login_falhas`.
- [x] Acrescentar as tabelas a `shared/types/database.types.ts` (à mão, no formato do gerador).

### 3. Mappers e repositories
- [x] `server/mappers/gestao-member.mapper.ts`, `gestao-evento.mapper.ts`, `gestao-settings.mapper.ts` (matriz/config
      saneadas: chave/perfil/valor desconhecidos caem no padrão; travas do Dono forçadas).
- [x] `gestao-member.repository.ts`, `gestao-settings.repository.ts`, `gestao-evento.repository.ts`,
      `gestao-acesso.repository.ts` (otp, sessões verificadas, falhas de login). Todos com `tenant_id` no `where`.
- [x] Testes `test/server/gestao-membros.test.ts` (repositories + regras de membro) com `fakeSupabase`.

### 4. `requireGestaoMember` — `server/utils/gestao-auth.ts`
- [x] Teste `test/server/gestao-auth.test.ts` (Review Focus 3): sem token 401; recurso desligado 404; token inválido 401;
      membro removido 401; sessão sem 2º fator 401; outro tenant 401; ok devolve contexto com `sessao.corretorId = brokerId`
      e matriz do tenant; `exigirPermissao` 403 em `nao`, passa em `proprio`/`sim`.
- [x] Núcleo testável `resolverAcessoGestao(deps, { segundoFator })`; `requireGestaoMember(event)` só lê o evento.
- [x] Fluxos `emitirCodigoGestao` e `conferirCodigoGestao` (Review Focus 4) com gravação condicional por `attempts`.

### 5. Endpoints de auth
- [x] `auth/convite/[token].get.ts`, `auth/aceitar.post.ts`, `auth/login.post.ts`, `auth/codigo.post.ts`,
      `auth/reenviar.post.ts`, `sessao.get.ts`. E-mail do código em `email-templates.ts`.

### 6. Membros, matriz, configurações
- [x] Regras puras de membro em `server/utils/gestao-membros.ts` (teto do convidante, último Dono, a si mesmo).
- [x] `membros.get|post`, `membros/[id].delete|patch`, `matriz.get|put`, `configuracoes.get|put`; cada escrita chama `registrarEvento`.

### 7. Privacidade, runtimeConfig, verificação
- [x] `gestaoOtpPepper` no `runtimeConfig` (lido por `segredoDeRuntime`) + lista do `segredos-em-runtime.test.ts`.
- [x] Privacidade: ver call abaixo.
- [x] `pnpm typecheck && pnpm test`; `tenant-security-reviewer`; commit e push em `claude/friendly-planck-u9wtqu-f1`.

## Calls do implementador

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Validação de payload à mão (`server/utils/validate.ts` no estilo da casa), sem Zod | Zod, como diz a spec | Zod não é dependência do projeto; acrescentar biblioteca numa fase de fundação, só para três payloads, é decisão maior que a fase. F2/F4 podem trazer se precisarem |
| Hash do código e do convite por HMAC-SHA256 com o pepper, e a mensagem do código inclui `tenant_id` e `user_id` | SHA-256 de `pepper + código` | 10⁶ códigos se quebram de um dump em segundos; com HMAC sem o pepper o dump não serve. Tenant+usuário na mensagem fazem o código de outra conta nunca casar, mesmo na mesma linha |
| Tentativas **não** zeram ao pedir código novo; só com acerto ou fim do bloqueio | Zerar a cada código (como o demo) | Com zeramento, quem já tem a senha ganha 4 palpites por login, sem limite. Acumulando, 5 erros em qualquer combinação de códigos bloqueiam 15 min |
| Gravação da tentativa condicionada ao `attempts` lido (`update … where attempts = $lido`); quem perde a corrida recebe 409 sem resultado | Ler-comparar-gravar sem condição | 100 requisições paralelas leriam `attempts = 0` e teriam 100 palpites. Com a condição, cada valor de `attempts` decide uma vez só |
| Código **não** amarrado ao `session_id` que o pediu; quem apresenta o código certo verifica a própria sessão | Coluna `session_id` em `gestao_otp` | Os dois lados já provaram a senha; o que o código prova é a posse do e-mail, e isso não muda com a sessão. Amarrar só criava o caso «loguei de novo em 60 s e o código do e-mail não vale» |
| Limite de login por conta (5 falhas/15 min) e por IP (20 falhas/15 min) em `gestao_login_falhas`, com a chave em HMAC | Contador em memória; só o limite do Supabase Auth | Memória não vale entre lambdas (`rate-limit.ts`). O limite do Supabase é por IP de origem, e a origem aqui é o servidor: todo usuário dividiria o mesmo balde |
| Convite aceito por e-mail que já tem conta no Supabase Auth (ex.: alguém do `/admin`): exige a senha DESSA conta e só então liga o `user_id` | Trocar a senha da conta existente | Trocar a senha a partir de um link de convite é tomar a conta de alguém (mesmo motivo do `member.repository.ts`). A regra de força vale só para senha nova |
| O link do convite vai **só** por e-mail, nunca na resposta | Devolver como plano B, como o `/admin` | Revisão de segurança: com o link, quem convida criaria a conta de um e-mail que não é dele, já confirmada e com a senha que escolhesse. E o plano B não serve aqui: sem e-mail ninguém passa do 2º fator |
| Membro removido ou sem 2º fator → 401; recurso `gestao` desligado → 404 antes de olhar o token | 403 para membro removido | 401 faz a tela voltar ao login, que é o que se quer de quem perdeu o acesso. 404 para o recurso segue `exigirCobranca`: para aquela imobiliária o painel não existe |
| `configuracoes.get` exige `admin`, como a spec | Qualquer membro | F2 lê o percentual padrão no servidor por `lerSettings`; a tela de configurações é só do Dono |
| `gestao_eventos` recusa update/delete por trigger, **exceto** quando o tenant da linha já não existe | Trigger sem exceção | O e2e apaga o tenant `e2e-*` ao fim; o `on delete cascade` bateria no trigger e a limpeza falharia. Tenant apagado não tem auditoria a proteger |
| Política de privacidade inalterada | Acrescentar seção do painel | `privacidade.vue` fala ao visitante e ao cliente da Área do Cliente. Usuário do `/gestao` é funcionário da imobiliária (operador), como o do `/admin`, que também não aparece lá. Nenhum terceiro novo (o e-mail sai pelo `mailer.ts` existente) e nenhum dado novo do visitante |
| Limite de 200 em `listarEventos` e `listarMembros`, `order by` decrescente | Paginação | Spec global: 200 por lista nesta fase |
| `gestao_sessions` com chave `(session_id, tenant_id)` | `session_id` sozinho como pk (plano) | Quem é membro de duas imobiliárias verifica cada uma; com a sessão sozinha, a segunda verificação sobrescreveria a primeira |
| FK do corretor (`broker_id, tenant_id`) sem `on delete set null` | `set null (broker_id)` como na 0049 | O check «corretor exige corretor» recusaria o nulo de qualquer jeito. Apagar no `/admin` o cadastro de um corretor com acesso ao gestão falha até o acesso ser tirado — melhor que perder o acesso calado |
| `registrarEvento` não lança: falha vira `logError` | Lançar | Quando ele roda a ação já foi gravada; erro na resposta faria a pessoa repetir a ação. A lacuna aparece no log |
| Endpoints públicos do gestão (convite, aceitar, login) conferem `gestaoAtiva`; todo o resto passa por `requireGestaoMember`/`acessoGestao`, travado por varredura em `gestao-migration-guardrail.test.ts` | Confiar na revisão | A F2…F7 cai no teste por padrão; entrar na lista de públicos é ato consciente |
| `[token]` entra na exceção nomeada de `id-de-rota.test.ts` | Validar como uuid | Não é id de tabela; a forma (64 hex) é conferida em `consultarConviteGestao` antes do banco |
| Login entrega também `Entrou no painel` à auditoria (`gestao_eventos`) | Só ações de negócio | É o registro que responde «quem estava no sistema» numa investigação; custa uma linha por login |
| O limite por conta permite a terceiro travar o login de alguém por 15 min errando a senha | Só limite por IP | É o preço do limite por conta, o mesmo de qualquer bloqueio por tentativa; sem ele, um IP rotativo testa senhas sem fim. A janela é deslizante e curta |
| Conta já existente com senha fraca não aceita convite (o aceite exige a regra de força e a senha da conta) | Pular a regra para conta existente | Caso raro (conta do `/admin` antiga); a saída é trocar a senha pelo «esqueci» do `/admin` e aceitar de novo |

## Contratos entregues

Sem desvio de nome ou assinatura. `ContextoGestao.db` é `SupabaseClient<Database>` (o mesmo `SupabaseClient` do contrato, tipado).
Extras exportados para F2–F7: `acessoGestao` (sem 2º fator), `valorPermissao`, `montarContexto`, `respostaSessao`,
tipos `EventoGestao`, `MembroGestaoLista`, `AlvoEvento` em `layers/gestao/domain/types.ts`.

## Para quem aplicar a 0059

- Configurar `NUXT_GESTAO_OTP_PEPPER` (32+ caracteres aleatórios) **antes** de ligar o login: sem ele, produção recusa.
- O primeiro Dono não tem quem o convide: inserir à mão a linha em `gestao_members` (perfil `dono`, `user_id` de uma
  conta existente) ou gerar um convite pelo SQL Editor. Comando no PR.

## Revisão de segurança (`tenant-security-reviewer`)

| Achado | Correção |
|---|---|
| Médio: o código novo era gravado por `upsert` incondicional depois do envio; palpites dados durante o envio (e o bloqueio deles) eram apagados — ~5 palpites/min em vez de 5 a cada 15 min | `gravarOtpNovoSe`: insert no primeiro código, e depois update condicionado a `attempts` e `code_hash` lidos; quem perde recebe 409 |
| Baixo: o Jurídico sobrescrevia o convite pendente de um Dono reconvidando o mesmo e-mail | `gravarConvite` aplica `regraConvite` também ao perfil do convite existente (403) |
| Não verificado pelo revisor: link do convite na resposta permitia criar conta confirmada para e-mail alheio | Link removido da resposta (call acima) |

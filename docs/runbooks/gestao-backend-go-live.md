# /gestao com backend real — go-live

Troca o `/gestao` de dados de demonstração (navegador) para Supabase (Postgres +
Auth + Storage). Spec: `docs/superpowers/specs/2026-11-17-gestao-backend-design.md`.
Plano e fases: `docs/superpowers/plans/2026-11-17-gestao-backend*.md`.

**Ordem, em uma linha:** banco de teste → banco real → variáveis → primeiro Dono →
ligar `gestao` no tenant → `http`. Cada passo abaixo diz como conferir e como
desfazer. Não pule a ordem: com `http` ligado e sem as tabelas, o painel responde
500; sem o Dono, ninguém entra.

> ⚠️ **Nada daqui foi aplicado.** As migrations 0059–0063 estão commitadas e
> testadas contra um banco falso (`test/server/gestao-*migration*.test.ts`). Quem
> aplica é uma pessoa, na ordem abaixo — develop e produção dividem o mesmo banco
> (`supabase/migrations/README.md`), então um erro aqui é erro em produção.

## 0. Antes de começar

- [ ] Branch com as migrations **commitada** (regra do README: commite antes de aplicar).
- [ ] `pnpm typecheck && pnpm test` verdes nesse commit.
- [ ] Acesso de escrita ao Supabase **de teste** e ao **real**, e ao painel da
      hospedagem (Vercel) para variáveis de ambiente.
- [ ] Decidido qual imobiliária liga primeiro (hoje: Olmi) e o e-mail do Dono dela.
- [ ] Os envs de e-mail já funcionam em produção (`MAIL_API_KEY`, `MAIL_FROM`): o
      código do 2º fator sai por eles. Sem e-mail, ninguém passa do login.

## 1. Banco de teste primeiro

Use um projeto Supabase **separado** (ou uma branch do Supabase). Nunca o real.

1. Monte o schema-base. Se o projeto de teste é novo, ele não tem o histórico de
   produção; o mínimo de que 0059–0063 dependem é: `tenants`, `brokers`
   (com o índice único `brokers_id_tenant_idx`, que a 0059 recria se faltar),
   `properties` (a 0062 referencia `imovel_id`), `tenant_features` com a
   constraint da **0056** (aceitar o valor `gestao`) e `public.set_updated_at()`.
   O mais simples é restaurar um dump do esquema de produção.
2. Aplique **na ordem**, uma por vez (SQL Editor ou `supabase db push`), parando
   no primeiro erro: `0059` → `0060` → `0061` → `0062` → `0063`.
   A ordem numérica é a que os testes e o plano assumem.
3. Rode de novo cada uma (todas são idempotentes): tem de passar sem erro e sem
   mudar nada.
4. Confira o resultado:

   ```sql
   -- 10 tabelas gestao_*, todas com RLS ligada
   select c.relname, c.relrowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'gestao\_%'
    order by 1;

   -- tem de vir VAZIO: anon e authenticated não leem nem escrevem nenhuma delas
   select table_name, grantee, privilege_type
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name like 'gestao\_%'
      and grantee in ('anon', 'authenticated');

   -- bucket privado, 15 MB, só pdf/jpeg/png/webp
   select id, public, file_size_limit, allowed_mime_types
     from storage.buckets where id = 'gestao-docs';

   -- tem de vir VAZIO: nenhuma policy de storage para o bucket (o acesso é por URL assinada)
   select policyname from pg_policies
    where schemaname = 'storage' and (qual ilike '%gestao-docs%' or with_check ilike '%gestao-docs%');
   ```

   Esperado: `gestao_members`, `gestao_otp`, `gestao_sessions`, `gestao_settings`,
   `gestao_eventos`, `gestao_login_falhas`, `gestao_vendas`, `gestao_documentos`,
   `gestao_locacoes`, `gestao_consultas`, todas `true`.
5. Aponte uma implantação de teste (preview) para esse banco, faça os passos 4 a 7
   deste runbook **lá** e rode o roteiro da seção H de
   `layers/gestao/test/qa/fluxos.md`. Só siga para o real com a seção H inteira
   passando, incluindo: login com código por e-mail, 409 com duas abas, upload de
   contrato (e a marca «contrato com PDF» ligando sozinha) e corretor B recebendo
   404 no processo do corretor A.

## 2. Banco real — conferir antes de aplicar

**A pasta `supabase/migrations/` não é o banco** (README da pasta). Os números do
histórico real divergem dos arquivos; o que vale é o que está em
`supabase_migrations.schema_migrations`.

```sql
-- 1) as de gestão já foram aplicadas por outro caminho? (esperado: nada)
select version, name from supabase_migrations.schema_migrations
 where name ilike '%gestao%' order by version;
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'gestao\_%';

-- 2) o recurso `gestao` é aceito? (esperado: a lista inclui 'gestao')
select pg_get_constraintdef(oid) from pg_constraint
 where conname = 'tenant_features_feature_check';

-- 3) o índice que a 0059 e a 0060 exigem em brokers
select indexdef from pg_indexes
 where schemaname = 'public' and tablename = 'brokers' and indexname = 'brokers_id_tenant_idx';

-- 4) a função usada pelos triggers
select proname from pg_proc where proname = 'set_updated_at';
```

- Se (2) **não** lista `gestao`, aplique antes a `0056_recurso_gestao.sql`.
  ⚠️ Ela recria a constraint **com todos os valores por extenso**; leia o resultado
  de (2) e confirme que ela não *tira* nenhum recurso que o banco real já tem
  (foi exatamente o risco que motivou a escrita por extenso).
- Se (1) devolver alguma coisa, **pare**: alguém aplicou por fora. Compare o que
  existe com o arquivo antes de rodar qualquer coisa.
- Se (3) ou (4) vierem vazios, o banco real não tem o que o arquivo supõe: pare e
  investigue em vez de adaptar a migration.

## 3. Banco real — aplicar

Uma migration por vez, na ordem, conferindo a de cima antes da próxima:

1. `0059_gestao_acesso.sql` → rode a conferência (1) e (2) do passo 1.4 só para
   `gestao_members/otp/sessions/settings/eventos/login_falhas`.
2. `0060_gestao_vendas.sql`
3. `0061_gestao_documentos.sql` → confira o bucket.
4. `0062_gestao_locacoes.sql`
5. `0063_gestao_consultas.sql` → refaça as quatro conferências do passo 1.4.

Registre no histórico do Supabase como o time já faz (CLI ou SQL Editor): o que
não pode acontecer é aplicar sem commit, nem o arquivo divergir do que rodou.

**Voltar atrás** (só enquanto as tabelas estão vazias — os scripts apagam dado):
`supabase/migrations/rollback/0063_rollback.sql`, `0061_rollback.sql`,
`0060_rollback.sql`. **Não existe rollback escrito para a 0059 nem para a 0062**
(ver «Pendências após a revisão» no plano). Antes de apagar essas duas à mão,
confirme que estão vazias; a 0059 apaga convites, códigos e sessões de todos os
tenants.

## 4. Variáveis de ambiente

No painel da hospedagem (Production, e Preview se for testar lá). **Redeploy
depois de qualquer mudança**: variável sem `NUXT_` só vale no build.

| Variável | Valor | Observação |
|---|---|---|
| `NUXT_GESTAO_OTP_PEPPER` | `openssl rand -base64 32` (mín. 32 caracteres) | Obrigatória. Sem ela, em produção, o login do `/gestao` recusa todo mundo (falha fechado) e o arranque loga `config.segredos_ausentes`. É o segredo do HMAC do código de 6 dígitos e do token de convite. **Trocar** invalida convites e códigos em aberto e mais nada. Guarde-a junto das outras chaves, mas ela não é irrecuperável. |
| `NUXT_PUBLIC_GESTAO_BACKEND` | `http` | Padrão (ausente) é `mock`. É por **implantação**, não por tenant. Enquanto estiver `mock` o painel usa dados de exemplo no navegador. |

Já existentes e necessárias: `SUPABASE_URL`, `SUPABASE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `MAIL_API_KEY`, `MAIL_FROM`, `RATE_LIMIT_IP_SALT`.

Ordem: defina `NUXT_GESTAO_OTP_PEPPER` **primeiro** e faça o deploy; deixe
`NUXT_PUBLIC_GESTAO_BACKEND` para o passo 7.

## 5. Primeiro Dono

Não existe tela para o primeiro Dono: convidar exige a permissão `convidar`, que
só um Dono logado tem. O primeiro convite é inserido à mão.

1. Descubra o tenant:

   ```sql
   select id, slug from public.tenants where slug = '<slug-da-imobiliaria>';
   ```
2. Gere o token e o hash **com o mesmo pepper de produção** (o hash é
   `HMAC-SHA256(pepper, "convite:" + token)`, hex — o token só existe no link):

   ```bash
   P='<NUXT_GESTAO_OTP_PEPPER>' node -e "
   const c=require('node:crypto');
   const t=c.randomBytes(32).toString('hex');
   console.log('TOKEN', t);
   console.log('HASH ', c.createHmac('sha256',process.env.P).update('convite:'+t).digest('hex'))"
   ```
3. Insira o convite (72 h de validade):

   ```sql
   insert into public.gestao_members
     (tenant_id, email, nome, perfil, invite_token_hash, invite_expires_at, convidado_por)
   values
     ('<tenant_id>', lower('<email-do-dono>'), '', 'dono', '<HASH>', now() + interval '72 hours', 'go-live');
   ```
   Se o e-mail já existe nesse tenant, a unicidade `(tenant_id, lower(email))`
   recusa: use `update ... set perfil = 'dono', invite_token_hash = '<HASH>',
   invite_expires_at = now() + interval '72 hours' where tenant_id = ... and lower(email) = ...`.
4. Entregue ao Dono, por canal seguro, o link
   `https://<domínio-do-tenant>/gestao/convite/<TOKEN>`. Ele escolhe nome e senha
   (regra de senha do domínio) e o convite é consumido. **Apague o token** do
   terminal/histórico; no banco só ficou o hash.
5. Convite expirou? Repita os passos 2–3 (novo token, novo hash). Os demais
   usuários o Dono convida pela tela **Usuários**.

> Se o e-mail do Dono já tem conta no Supabase Auth (alguém do `/admin`), o aceite
> pede a senha **daquela conta** e só liga com ela certa — não troca a senha de
> ninguém por um link.

## 6. Ligar `gestao` no tenant

Sem a linha, o painel responde 404 para o tenant (inclusive o login e a API).

```sql
insert into public.tenant_features (tenant_id, feature, enabled, enabled_at)
values ('<tenant_id>', 'gestao', true, now())
on conflict (tenant_id, feature) do update set enabled = true, enabled_at = now();
```

Confira: `select feature, enabled from public.tenant_features where tenant_id = '<tenant_id>';`

## 7. Ligar o `http`

1. Defina `NUXT_PUBLIC_GESTAO_BACKEND=http` e faça redeploy.
2. Em `https://<domínio-do-tenant>/gestao/login`: entre com o Dono, receba o
   código por e-mail, confirme. Abra um processo de venda de teste, envie um
   contrato PDF (a marca «contrato com PDF» deve ligar sozinha) e arquive-o.
3. Confira que a lista de **Usuários** abre e que o `GET /api/gestao/sessao`
   responde 200 com o Dono e 401 sem o token.
4. Convide os demais perfis pela tela **Usuários**. Cada corretor precisa estar
   vinculado a um cadastro de corretor do tenant (`brokers`): corretor sem vínculo
   não enxerga processo nenhum.

Efeito colateral a avisar: em `http` os dados de exemplo do navegador **não**
aparecem; quem validou o demo vai ver o painel vazio. E recarregar a página pede
login e código de novo — os tokens ficam só em memória, de propósito.

## 8. Voltar para `mock`

Três níveis, do mais leve ao mais forte. Em nenhum deles os dados do banco são apagados.

1. **Painel volta a ser demo:** `NUXT_PUBLIC_GESTAO_BACKEND=mock` (ou remova a
   variável) e redeploy. As APIs continuam de pé, só a tela deixa de usá-las. O
   que foi gravado no banco fica lá, mas **não aparece no modo `mock`**.
2. **Fechar o painel num tenant:**
   ```sql
   update public.tenant_features set enabled = false
    where tenant_id = '<tenant_id>' and feature = 'gestao';
   ```
   Efeito imediato: a página, o login e a API respondem 404 para o tenant, e uma
   sessão que ainda estava válida cai na próxima chamada.
3. **Derrubar o acesso de uma pessoa:** na tela **Usuários** (remove o membro) ou
   `delete from public.gestao_members where tenant_id = '<tenant_id>' and lower(email) = '<email>'`.
   A próxima chamada dele responde 401.

Desfazer as tabelas (passo 3 deste runbook, «Voltar atrás») só faz sentido se o
recurso será abandonado e **não há dado real** nelas.

## 9. Conferência final

- [ ] `select feature, enabled from tenant_features where feature = 'gestao'` lista só os tenants que você quer.
- [ ] Nenhum `anon`/`authenticated` com grant em `gestao_*` (consulta do passo 1.4).
- [ ] `config.segredos_ausentes` **não** aparece nos logs após o deploy.
- [ ] Dono entra com código; corretor A não vê processo do corretor B (404).
- [ ] Política de privacidade (`/privacidade`) cobre o público do painel? O código
      do 2º fator vai por e-mail e a conta do usuário guarda e-mail e nome — se a
      política só fala do visitante e do cliente da Área do Cliente, registre a
      a decisão em `docs/runbooks/lgpd-site-publico.md` e, se a política precisar
      mudar, mude `app/pages/privacidade.vue` no mesmo PR (CLAUDE.md, «Privacidade»).

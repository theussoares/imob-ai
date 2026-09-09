-- Corretor vira usuário, e o funil passa a ter dono.
--
-- Até aqui `brokers` era só um cadastro: nome, telefone, CRECI, sem nenhuma
-- ligação com `auth.users`. Quem logava era `tenant_members`, cujo papel só
-- admitia owner/admin. O efeito prático é que corretor não entrava no sistema —
-- e sem isso não existe distribuir lead (para quem?), medir SLA (não há
-- "primeira ação do corretor" para cronometrar) nem carteira ("meus leads").
--
-- Pior: `leads_member_read` liberava tudo para qualquer membro, então mesmo que
-- o corretor entrasse ele veria a carteira inteira da imobiliária.
--
-- ⚠️ Esta migration RESTRINGE acesso. Depende do papel 'broker' criado na 0028 e
-- do deploy que usa `requireTenantAdmin` nos endpoints que rodam por service
-- role (membros, convite), onde a RLS abaixo não alcança.

-- ---------------------------------------------------------------------------
-- 1) O vínculo cadastro <-> login
-- ---------------------------------------------------------------------------

alter table public.brokers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Um login por corretor DENTRO do tenant. O índice é parcial porque a maioria
-- dos corretores não tem acesso ao painel, e `null` não colide com `null` em
-- unique — mas dois cadastros apontando para o mesmo login colidiriam, e é isso
-- que precisa ser barrado: quebraria `current_broker_id`, que devolve um id só.
create unique index if not exists uq_brokers_tenant_user
  on public.brokers(tenant_id, user_id)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- 2) Helpers de autorização
-- ---------------------------------------------------------------------------

-- Quem vê tudo. Deliberadamente NÃO é "é membro": 'broker' também é membro, e o
-- ponto desta migration é justamente separar os dois.
create or replace function public.is_tenant_admin(t_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = t_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

-- O cadastro de corretor do usuário atual neste tenant, ou null.
--
-- Chaveia pelo VÍNCULO, não pelo papel: é o vínculo que diz de quem é o lead.
-- Um membro com role='broker' e sem cadastro ligado não enxerga carteira
-- nenhuma — o que é correto, e é o estado de quem foi convidado mas cujo
-- cadastro ainda não foi vinculado.
create or replace function public.current_broker_id(t_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select b.id
  from public.brokers b
  where b.tenant_id = t_id and b.user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 3) RLS de leads: admin vê tudo, corretor vê a carteira dele
-- ---------------------------------------------------------------------------

-- O corretor vê também os leads SEM dono, e isso é escolha, não descuido.
--
-- Enquanto a roleta não existe (fase seguinte), nada atribui lead
-- automaticamente: todo contato do formulário nasce com broker_id nulo. Sem esta
-- cláusula o corretor abriria o funil e veria um quadro vazio até alguém
-- atribuir na mão — pior que o estado atual. Com ela, ele perde acesso apenas ao
-- que é explicitamente de outro corretor, que é o ganho real de hoje.
--
-- Quando a roleta entrar, "sem dono" vira estado transitório e esta cláusula
-- passa a descrever o bolsão de resgate.
drop policy if exists "leads_member_read" on public.leads;
create policy "leads_member_read" on public.leads
  for select using (
    public.is_tenant_admin(tenant_id)
    or (broker_id is null and public.is_tenant_member(tenant_id))
    or (broker_id = public.current_broker_id(tenant_id))
  );

-- Mesmo alcance da leitura: o corretor mexe no que enxerga. O `with check`
-- repete o `using` para que ele possa devolver um lead ao bolsão (broker_id =
-- null) sem que a linha saia do alcance dele no meio da operação.
drop policy if exists "leads_member_update" on public.leads;
create policy "leads_member_update" on public.leads
  for update using (
    public.is_tenant_admin(tenant_id)
    or (broker_id is null and public.is_tenant_member(tenant_id))
    or (broker_id = public.current_broker_id(tenant_id))
  ) with check (
    public.is_tenant_admin(tenant_id)
    or (broker_id is null and public.is_tenant_member(tenant_id))
    or (broker_id = public.current_broker_id(tenant_id))
  );

-- Cadastro manual continua liberado a qualquer membro: corretor que recebe
-- contato por outro canal precisa registrar.
drop policy if exists "leads_member_insert" on public.leads;
create policy "leads_member_insert" on public.leads
  for insert with check (public.is_tenant_member(tenant_id));

-- Excluir é só de admin. Apagar lead destrói histórico de atendimento e é
-- exatamente o que alguém faria para esconder que não atendeu.
drop policy if exists "leads_member_delete" on public.leads;
create policy "leads_member_delete" on public.leads
  for delete using (public.is_tenant_admin(tenant_id));

-- ---------------------------------------------------------------------------
-- 4) O resto do painel que corretor não deve mexer
-- ---------------------------------------------------------------------------

-- Configuração da imobiliária (marca, contatos, textos do site) é de admin.
drop policy if exists "tenants_member_update" on public.tenants;
create policy "tenants_member_update" on public.tenants
  for update using (public.is_tenant_admin(id)) with check (public.is_tenant_admin(id));

-- O cadastro de corretores é de admin: sem isto, um corretor se vincularia a
-- outro `user_id` ou editaria o cadastro dos colegas. A leitura segue liberada
-- para todo membro — o funil precisa da lista para mostrar responsável.
drop policy if exists "brokers_member_write" on public.brokers;
create policy "brokers_member_insert" on public.brokers
  for insert with check (public.is_tenant_admin(tenant_id));
create policy "brokers_member_update" on public.brokers
  for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id));
create policy "brokers_member_delete" on public.brokers
  for delete using (public.is_tenant_admin(tenant_id));

-- `user_id` é coluna interna (liga cadastro a conta de autenticação). O revoke
-- da 0011 já tirou `brokers` inteira do anon; isto é só a garantia de que um
-- grant futuro não a devolva por engano.
revoke all on public.brokers from anon;

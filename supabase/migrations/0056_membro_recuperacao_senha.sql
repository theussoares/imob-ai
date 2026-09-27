-- "Esqueci minha senha" do painel: intervalo mínimo entre dois e-mails.
--
-- O sintoma (teste de 27/09): o painel não tinha recuperação de senha. Um
-- convite que falhasse (a prévia do WhatsApp gastou o link, BUG-FUN-03) deixava
-- a conta criada e presa — re-convidar não devolve link por segurança
-- (`inviteMember`) — e só um SQL manual destravava.
--
-- O endpoint de recuperação é público por natureza (quem esqueceu não está
-- logado). Sem trava ele vira uma máquina de mandar e-mail em nome da
-- imobiliária e queima a cota diária do provedor, que é compartilhada por
-- TODOS os tenants. É a mesma trava que a 0033 pôs no portal; contador em
-- memória não serve na Vercel (cada requisição pode cair noutra lambda).
--
-- Por vínculo (tenant_members), não por usuário: a mesma pessoa em duas
-- imobiliárias pede a senha por cada uma delas.
--
-- Sem grant novo: tenant_members é lida pelo membro só na própria linha
-- (`tenant_members_self_read`) e fechada ao anon desde a 0044. Quem grava é o
-- servidor, pela service role.

alter table public.tenant_members
  add column if not exists last_recovery_at timestamptz;

comment on column public.tenant_members.last_recovery_at is
  'Último e-mail de "esqueci minha senha" do painel enviado para este vínculo. Trava de reenvio (0056).';

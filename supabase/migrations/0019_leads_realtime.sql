-- Realtime na tabela de leads: o painel assina INSERT para que um contato
-- preenchido no site apareça no funil sem precisar recarregar a página.
--
-- Fica versionado aqui em vez de ser um clique no dashboard: ambiente novo que
-- rodar as migrations já sai com o recurso ligado, e a razão de estar ligado
-- fica escrita junto.
--
-- A RLS continua valendo — o Supabase avalia a policy de SELECT (leads_member_read)
-- por linha contra o JWT de quem assinou, então cada tenant só recebe evento dos
-- próprios contatos.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

-- Nota deliberada: NÃO usar `replica identity full` aqui.
-- Ela só serve para o payload de UPDATE/DELETE carregar a linha antiga — que o
-- painel não assina — e faria cada alteração jogar nome, telefone e mensagem do
-- lead inteiros no WAL. Dado pessoal replicado sem necessidade.

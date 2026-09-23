-- Rollback da 0040.
--
-- ⚠️ Reverter aqui QUEBRA o download de documento do portal para todo cliente,
-- em todo tenant. Não é degradação parcial: o cliente entra, vê a lista e o
-- botão de baixar devolve erro. Era o estado anterior à 0040, e foi assim por
-- semanas sem ninguém notar — porque falha fechada não gera reclamação até
-- alguém tentar usar.
--
-- Só faz sentido rodar isto se `object.sign` se revelar nome errado ou perigoso
-- nesta versão do Storage. Se for só para "voltar ao que era", não vale: o que
-- era estava quebrado.

drop policy if exists "portal client reads own documents" on storage.objects;

create policy "portal client reads own documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portal-docs'
    and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
    and public.portal_can_read_doc_path(name)
  );

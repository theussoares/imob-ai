-- Varredura de imagens órfãs no bucket property-images.
--
-- Órfão é o arquivo que existe no bucket e não é referenciado por nenhuma linha
-- de property_images. Em 09/09/2026 eram 354 de 1342 arquivos (26% do bucket,
-- 309 MB) — o que estourou o limite de 1 GB do plano free.
--
-- As três fontes que criavam órfão no salvamento e na exclusão foram fechadas
-- no servidor (`replaceImages` e `deleteProperty` agora limpam o Storage). Sobra
-- uma que nenhum código de servidor alcança: o ImageUploader sobe o arquivo no
-- instante em que a foto é escolhida, antes de existir imóvel para referenciá-la.
-- Quem sobe 10 fotos e fecha a aba deixa 20 arquivos que nunca terão linha.
-- Fechar a aba não dispara nada confiável no navegador, então esse caso só se
-- resolve varrendo depois — que é o que esta função alimenta.
--
-- POR QUE A CARÊNCIA (grace_hours)
--
-- Este é o detalhe que torna a varredura segura. Um cadastro em andamento é
-- exatamente igual a um upload abandonado: arquivo no bucket, sem linha. A
-- diferença é só o tempo. Sem carência, a varredura que rodasse enquanto um
-- corretor preenche o formulário apagaria as fotos que ele acabou de subir, e a
-- tela dele quebraria no meio do cadastro. 24h dá folga para qualquer sessão
-- humana e ainda recolhe o lixo no mesmo dia.
--
-- A comparação é por igualdade de path, não por LIKE: a URL guardada é
-- `<projeto>/storage/v1/object/public/property-images/<path>`, então basta
-- recortar o que vem depois do prefixo. Um `LIKE '%' || o.name` casaria
-- `a/1.webp` com `outra/a/1.webp` e, pior, faria varredura completa a cada linha.

create or replace function public.orphan_property_images(grace_hours int default 24)
returns table (name text)
language sql
security definer
set search_path = public, storage
as $$
  with referenced as (
    select split_part(split_part(url, '/object/public/property-images/', 2), '?', 1) as name
      from public.property_images
     where url like '%/object/public/property-images/%'
    union
    select split_part(split_part(url_sm, '/object/public/property-images/', 2), '?', 1)
      from public.property_images
     where url_sm like '%/object/public/property-images/%'
  )
  select o.name
    from storage.objects o
   where o.bucket_id = 'property-images'
     and o.created_at < now() - make_interval(hours => grace_hours)
     and not exists (select 1 from referenced r where r.name = o.name);
$$;

comment on function public.orphan_property_images(int) is
  'Arquivos de property-images sem linha em property_images, mais velhos que grace_hours. Usada pela edge function cleanup-orphan-images.';

-- `security definer` para enxergar storage.objects, então o acesso é fechado na
-- porta: a lista diz exatamente o que apagar para deixar o site sem imagem, e
-- anon/authenticated não têm o que fazer com ela. Só a service_role (a edge
-- function) chama.
revoke all on function public.orphan_property_images(int) from public;
revoke all on function public.orphan_property_images(int) from anon;
revoke all on function public.orphan_property_images(int) from authenticated;
grant execute on function public.orphan_property_images(int) to service_role;

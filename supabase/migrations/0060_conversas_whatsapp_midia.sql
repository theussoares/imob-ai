-- Fotos, áudios, vídeos e documentos das conversas do WhatsApp.
--
-- O sintoma: na 0059 a mídia chegava só como "Foto" em itálico. Numa
-- imobiliária é justamente a mídia que importa — a foto do imóvel que o
-- proprietário quer anunciar, o áudio de dois minutos com o que o cliente
-- procura, o PDF do comprovante de renda. Sem ela, o corretor voltava para o
-- celular, e a conversa voltava a morar lá.
--
-- Por que baixar e guardar, e não mostrar direto da Meta: o endereço que a
-- Meta dá expira em minutos e exige o token da imobiliária, que não pode ir ao
-- navegador. Então o servidor baixa, guarda num bucket PRIVADO e o painel lê
-- por URL assinada de vida curta.
--
-- Idempotente: seguro rodar de novo.

-- ---------------------------------------------------------------------------
-- 1. Colunas da mensagem
-- ---------------------------------------------------------------------------
alter table public.whatsapp_messages add column if not exists media_id text;
alter table public.whatsapp_messages add column if not exists media_mime text;
alter table public.whatsapp_messages add column if not exists media_filename text;
alter table public.whatsapp_messages add column if not exists media_path text;
alter table public.whatsapp_messages add column if not exists media_size integer;
-- null = mensagem sem mídia. 'pendente' = ainda não baixada (o webhook tem
-- pouco tempo; o painel baixa na primeira vez que alguém abrir).
alter table public.whatsapp_messages add column if not exists media_status text;

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_media_status_check;
alter table public.whatsapp_messages
  add constraint whatsapp_messages_media_status_check
  check (media_status is null or media_status in ('pendente', 'salva', 'falhou', 'grande_demais'));

-- O retry do painel e a retenção procuram por aqui.
create index if not exists whatsapp_messages_media_path_idx
  on public.whatsapp_messages (conversation_id) where media_path is not null;

-- ---------------------------------------------------------------------------
-- 2. Bucket privado
--
-- 16 MB: o teto de vídeo e áudio do próprio WhatsApp. Documento pode ter até
-- 100 MB lá; acima de 16 MB fica como 'grande_demais' e a tela manda abrir no
-- celular — guardar PDF de 100 MB de cada conversa é custo sem retorno.
--
-- Formatos: os que o WhatsApp entrega. Lista fechada pelo mesmo motivo da
-- 0048 — o bucket não deve aceitar o que ninguém pretende guardar.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp-media',
  'whatsapp-media',
  false,
  16 * 1024 * 1024,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'video/mp4', 'video/3gpp',
    'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Pasta = tenant_id. O membro LÊ só a pasta da própria imobiliária — é o que
-- permite assinar a URL com o client dele, e a RLS confere de novo no banco.
-- Ninguém escreve nem apaga pela API: quem grava é o webhook e quem apaga é a
-- retenção, os dois pela service_role.
--
-- Compara como TEXTO em vez de `is_tenant_member(pasta::uuid)`: um nome de
-- pasta que não fosse uuid faria o cast lançar e a leitura dar erro, em vez
-- de simplesmente negar.
drop policy if exists "whatsapp_media_member_read" on storage.objects;
create policy "whatsapp_media_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and exists (
      select 1 from public.tenant_members m
      where m.user_id = auth.uid()
        and m.tenant_id::text = (storage.foldername(name))[1]
    )
  );

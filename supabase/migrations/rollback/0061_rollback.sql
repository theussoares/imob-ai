-- Rollback da 0061.
--
-- ⚠️ Apaga os metadados dos documentos do /gestao. Os OBJETOS do bucket
-- `gestao-docs` não saem por SQL (o Storage não deixa apagar `storage.objects`
-- à mão sem deixar o arquivo órfão no S3): esvazie o bucket pelo painel do
-- Supabase ou pela API antes de remover o bucket abaixo, ou o remove falha.

drop table if exists public.gestao_documentos;
delete from storage.buckets where id = 'gestao-docs';

-- Rollback da 0048: volta os buckets públicos a aceitar qualquer arquivo, de
-- qualquer tamanho (até o limite global do projeto).

update storage.buckets
set file_size_limit = null,
    allowed_mime_types = null
where id in ('property-images', 'tenant-hero', 'tenant-logos');

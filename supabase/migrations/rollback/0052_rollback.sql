-- Rollback da 0052: `portal-docs` volta a aceitar qualquer arquivo, de
-- qualquer tamanho (até o limite global do projeto). O servidor continua
-- conferindo o conteúdo em `inspecionarArquivoEnviado`.

update storage.buckets
set file_size_limit = null,
    allowed_mime_types = null
where id = 'portal-docs';

-- Tamanho máximo e formatos aceitos no bucket PRIVADO `portal-docs`.
--
-- O sintoma, no teste de 26/09: um `.exe` subiu pela ficha do contrato, foi
-- gravado como `application/octet-stream` e publicado para os clientes. Só o
-- `accept` do `<input>` filtrava, e ele é sugestão ao seletor de arquivos, não
-- controle. A 0048 limitou os três buckets públicos e deixou este de fora
-- ("o formato dos documentos do contrato é outra conversa") — esta é a conversa.
--
-- Duas barreiras, porque falham de jeitos diferentes:
--
--   * aqui, o Storage recusa pelo Content-Type declarado no upload — pega o
--     arquivo que o navegador rotula honestamente (o `.exe` do teste);
--   * no servidor, `inspecionarArquivoEnviado` lê os primeiros bytes antes de
--     registrar o documento — pega o executável renomeado para `.pdf`, que
--     chega aqui com o Content-Type que a pessoa quiser.
--
-- Formatos: PDF, JPEG, PNG e WEBP — a mesma lista de
-- `shared/utils/arquivo-documento.ts`. HEIC fica de fora pelo motivo da 0048:
-- o Chrome não abre, e o cliente receberia um documento que não consegue ver.
--
-- 20 MB: contrato escaneado em PDF passa folgado; vídeo não.
--
-- Vale só para upload novo. O que já está no bucket (inclusive o `.exe` do
-- teste) continua lá: apague pela ficha do contrato.
--
-- Idempotente: `update` com os mesmos valores.

update storage.buckets
set file_size_limit = 20 * 1024 * 1024,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'portal-docs';

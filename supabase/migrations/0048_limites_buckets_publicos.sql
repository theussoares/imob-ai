-- Tamanho máximo e formatos aceitos nos três buckets públicos.
--
-- O sintoma, achado na auditoria de 25/09: `property-images`, `tenant-logos`
-- e `tenant-hero` foram criados na 0003 sem `file_size_limit` nem
-- `allowed_mime_types`. As policies de upload exigem ser membro da imobiliária
-- dona da pasta, mas não dizem O QUE pode subir — um membro (ou uma sessão de
-- membro roubada) conseguia pôr qualquer arquivo, de qualquer tamanho, num
-- endereço público com o nome do projeto: HTML, executável, SVG com script,
-- vídeo de 50 MB.
--
-- Os números saíram do que existe no bucket hoje, não de chute: 2.515
-- arquivos, todos webp/avif, o maior com 531 kB. O painel já redimensiona
-- antes de subir (`app/utils/image.ts`), então os limites só pegam o que
-- escapa desse caminho — o upload "sobe como veio" de formato que o canvas
-- não abre, ou uma chamada direta à API de storage.
--
--   * 5 MB para fotos e hero: 10x o maior arquivo real, folga para a foto
--     que chega sem redimensionar.
--   * 2 MB para logo e favicon: são pequenos; o maior hoje tem 15 kB.
--
-- Formatos:
--
--   * jpeg, png, webp e avif — o que o painel produz ou já está gravado.
--   * SVG só em `tenant-logos`, e é concessão consciente: logo vetorial é
--     pedido legítimo e fica nítida em qualquer tela. O risco do SVG é script
--     embutido, e ele fica contido: exibido por `<img>` o navegador não roda
--     script, e aberto direto roda na origem do Supabase, não na do site —
--     onde não há sessão nenhuma para roubar. Em fotos e hero não há motivo
--     para SVG, então lá não entra.
--   * `.ico` também só em `tenant-logos`: o favicon mora lá (`/admin/site`),
--     e ícone em `.ico` é o formato clássico de favicon, que o painel sobe
--     sem converter. Os dois tipos porque navegadores diferentes rotulam o
--     mesmo arquivo com um ou outro.
--   * HEIC fica de fora de propósito: a foto de iPhone que o navegador não
--     converte "subia como veio" e virava imagem quebrada para o visitante no
--     Chrome. Recusar no upload troca um defeito silencioso no site por uma
--     mensagem no painel (`app/utils/friendly-error.ts`).
--
-- Vale só para upload novo: nada do que já está no bucket é apagado ou
-- revalidado. `portal-docs` fica fora — é privado, e o formato dos documentos
-- do contrato é outra conversa.
--
-- Idempotente: `update` com os mesmos valores.

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id in ('property-images', 'tenant-hero');

update storage.buckets
set file_size_limit = 2 * 1024 * 1024,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/avif',
      'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'
    ]
where id = 'tenant-logos';

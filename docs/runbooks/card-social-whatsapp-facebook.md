# Card social (WhatsApp, Facebook, Instagram)

Como o preview de link do site funciona, por que ele estava quebrado e o que
fazer quando um cliente reclamar que "o link não mostra a foto".

## O que estava errado

Quatro problemas somados, todos confirmados em produção:

1. **`og:image` apontava para o WebP do Storage.** Todo upload do painel é
   convertido para WebP (`app/utils/image.ts`), e **o WhatsApp não renderiza
   WebP em preview de link**; o Facebook documenta apenas JPEG/PNG/GIF. Era a
   causa principal, e explica por que o sintoma parecia aleatório: foto
   cadastrada colando URL (JPEG) previa certo, foto enviada pelo painel não.
2. **A home anunciava a logo**, que também é WebP — e logo quadrada/transparente
   é um card ruim mesmo quando renderiza.
3. **Faltavam `og:image:width` / `height` / `type` / `alt`.** Sem as dimensões,
   a primeira raspagem do Facebook sai sem imagem (ele busca a foto de forma
   assíncrona) e só o segundo compartilhamento acerta.
4. **Categorias, bairros e `/quero-vender` não anunciavam imagem nenhuma.**

## Como funciona agora

Duas rotas devolvem **JPEG 1200×630** (1,91:1, o card grande das redes):

| Rota | Serve |
| --- | --- |
| `/og/home.jpg?v=<hash>` | Home e toda página sem imagem própria |
| `/og/imovel/<CODIGO>.jpg?v=<hash>` | Detalhe do imóvel (a capa) |

- **Quem decide a foto**: `shared/utils/og-image.ts`. Na home a ordem é
  **hero → capa do imóvel em destaque → logo**.
- **Quem converte**: `server/utils/og-render.ts` (`sharp`).
- **Quem anuncia as tags**: `app/composables/useOgCard.ts`, chamado no `app.vue`
  (padrão de toda página) e sobrescrito na home e no detalhe.

### Enquadramento

- **Paisagem** (proporção ≥ 1,2): preenche o card e corta pelo centro.
- **Quadrada ou em pé**: entra **inteira**, sobre uma cópia ampliada e desfocada
  dela mesma. É o que preserva a arte pronta do Canva — que é o que boa parte
  dos corretores sobe como foto do imóvel, com título em cima e preço embaixo.
  Cortar essa arte para 1,91:1 comia exatamente as duas pontas úteis.
- **Logo**: cabe inteira sobre a cor da marca, sem desfoque.
- **Sem foto, URL fora do ar, formato ilegível**: card sólido na cor da marca.
  A rota nunca lança — exceção aqui é preview sem imagem, que é o problema que
  ela existe para resolver.

### O `?v=`

Hash da foto de origem. **O WhatsApp guarda o preview por URL e não revalida**,
então trocar a foto no painel só muda o preview porque muda a URL anunciada.
É também o que torna seguro o `Cache-Control: immutable` das rotas.

## Quando um cliente reclamar

1. Abra o **Sharing Debugger** do Facebook (`developers.facebook.com/tools/debug/`),
   cole a URL e clique em **Scrape Again**. Isso limpa o cache do Facebook e
   mostra o que o crawler realmente leu.
2. Confira o `og:image` no HTML:
   ```bash
   curl -sL -A "facebookexternalhit/1.1" <URL> | grep -oiE '<meta[^>]*og:image[^>]*>'
   ```
   Tem que apontar para `/og/...jpg`, **nunca** para `supabase.co/storage/...`.
3. Confira o card em si:
   ```bash
   curl -sI "<origin>/og/imovel/<CODIGO>.jpg" | grep -i "content-type\|content-length"
   ```
   Esperado: `image/jpeg`, abaixo de 600 KB (acima disso o WhatsApp ignora).
4. **O WhatsApp não tem botão de limpar cache.** Se o link já circulou com o
   preview errado, o cache dele cai sozinho (dias). Para forçar antes disso,
   troque a foto de capa no painel: o `?v=` muda e vira uma URL nova.

## Limites conhecidos

- Cards **não têm texto**. O runtime da Vercel não traz fontes instaladas, então
  `<text>` em SVG rasterizado pelo sharp sai em branco ou com glifos faltando.
  Se um dia quisermos preço e endereço desenhados no card, o caminho é embutir
  um `.woff2` no repo e registrá-lo no sharp — não é só escrever o SVG.
- Tenant **sem hero e sem logo** tem o card da home tirado da capa do imóvel em
  destaque, mas o `?v=` do `app.vue` só olha hero e logo. Trocar o destaque não
  fura o cache do WhatsApp nas páginas internas (a home fura: ela calcula o hash
  com a lista em mãos). Aceito para não carregar o catálogo em toda página.
- Mudar a **cor da marca** não muda o `?v=`, então cards já cacheados mantêm a
  cor antiga até expirarem.

## Dependência

`sharp`. É a única dependência nova, roda só no servidor e entra no bundle da
função (~25 MB). O `@img/sharp-wasm32` vai junto como fallback.

> **Atenção ao instalar:** a Vercel usa `pnpm-lock.yaml`. Depois de mexer em
> dependências, rode `pnpm install` e **comite o lockfile**, senão o build
> quebra em `--frozen-lockfile`.

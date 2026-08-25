# URLs de SEO: slug no detalhe e páginas de pretensão

**Data:** 2026-08-25
**Motivo:** dois buracos de SEO no site público.

1. A página de detalhe é `/imovel/NC-0231`. A URL não diz o que a página é, e
   URL é um dos poucos sinais que aparece inteiro no resultado de busca. O
   Google recomenda o contrário: *"use readable words rather than long ID
   numbers in your URLs"*
   ([Search Central](https://developers.google.com/search/docs/crawling-indexing/url-structure)).
2. Não existe página de "imóveis à venda" nem de "imóveis para alugar" como
   caminho. A de aluguel existe só como `/?purpose=aluguel` — uma variante de
   query param que se auto-canonicaliza, mas que ninguém linka como página e que
   perde para um caminho na hora de ranquear por "imóveis para alugar em X".

## Escopo

Três frentes: a URL do detalhe, as duas páginas de pretensão, e a superfície de
SEO que precisa acompanhar as duas (sitemap, feed XML, llms.txt, agentes).

**Fora do escopo, por decisão:**

- **Trocar a chave da URL por um identificador do sistema.** Foi considerado
  (sequencial por tenant, coluna nova, backfill) porque o campo Código é texto
  livre — a única validação é "não pode ser vazio"
  ([validate.ts:52](../../../server/utils/validate.ts)) — e os dados reais são
  irregulares: `V.D 005`, `V.D0013`, `A.D-0016`. Descartado: hoje a URL **já é**
  o código e já funciona. Foi testado em produção, os três formatos respondem
  200, inclusive o que tem espaço (`/imovel/V.D%20005`). Trocar a chave
  resolveria um problema que não está causando dano, ao custo de migration e
  backfill.
- **Título da página (`<title>`).** Em produção aparecem
  `Terreno · Terreno · Tatiane Pacheco` e `J.D-Alvorada · Terreno`, porque o
  title sai do campo digitado pelo corretor. É a mesma raiz do problema da URL e
  provavelmente vale mais que o slug, já que é a linha clicável no resultado.
  Fica para uma rodada própria.
- **Rota por bairro** (`/imoveis/casas-no-centro`). O `[categoria].vue` já monta
  atalhos de bairro como filtro em memória. Virar rota multiplicaria as
  combinações e cairia no mesmo problema de página fina que o piso atual evita.

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `/{slug}/{codigo}` na raiz | `/imovel/{slug}-{codigo}` | palavra-chave encosta no domínio; código isolado dispensa heurística de sufixo para achar onde termina o slug |
| slug de campos estruturados (tipo, quartos, bairro) | slug do título digitado | títulos reais se repetem (`Casa no Centro`) e a qualidade dependeria do texto de cada corretor |
| código continua sendo a chave | sequencial do sistema | ver "fora do escopo" |
| caminho vira canônico, `?purpose=` redireciona | manter os dois | duas URLs para o mesmo conteúdo competem entre si |
| abaixo do piso: 200 + `noindex` | 404 | as páginas de pretensão ficam linkadas na home; 404 na cara de visitante é pior que página fina desindexada |

## A. URL de detalhe

Formato:

```
/casa-3-quartos-centro/NC-0231
/apartamento-2-quartos-jardim-alvorada/NC-0244
/terreno-village-do-lago/NC-0258        ← terreno omite quartos
/casa-3-quartos/NC-0301                 ← imóvel sem bairro omite o trecho
```

O primeiro segmento é **decorativo**: derivado de tipo + quartos + bairro,
normalizado (sem acento, minúsculo, hífen). O segundo é a **chave**: o código,
como já é hoje.

**Resolução.** Só o último segmento importa. Reaproveita
`getPropertyByCodeWithBrokerPhone`, que já é `ilike` e já é case-insensitive.
Se o primeiro segmento não corresponder ao slug canônico atual do imóvel,
responde 301 para a URL canônica — assim editar quartos ou bairro no painel não
quebra link nenhum, só redireciona.

**Namespace da raiz.** `/{slug}/{codigo}` compete com `/imoveis/{categoria}`.
Não é problema: o ranqueador do vue-router 4.6.4 pontua `Segment=40`,
`Static=+40`, `Dynamic=+20`, comparando segmento a segmento — `imoveis/[categoria]`
pontua `[80, 60]` contra `[60, 60]` do padrão da raiz, e vence no primeiro
segmento. Vale para qualquer rota estática futura de dois níveis.

**Um helper, oito chamadores.** Hoje a URL é montada à mão em oito lugares.
Passa a existir `propertyPath(property)` em `shared/utils/`, e todos passam a
usá-lo:

| arquivo | uso |
|---|---|
| `app/components/PropertyCard.vue` | link do card (2 ocorrências) |
| a nova página de detalhe | canonical |
| `app/pages/admin/leads/index.vue` | link do imóvel no lead |
| `app/plugins/webmcp.client.ts` | URL exposta ao agente |
| `server/routes/sitemap.xml.get.ts` | `<loc>` |
| `server/routes/feed/imoveis.xml.get.ts` | `<DetailViewUrl>` (vai para portais) |
| `server/utils/markdown.ts` | 3 ocorrências (llms.txt e markdown do imóvel) |
| `server/middleware/agents.ts` | hoje fatia `/imovel/` na marra; passa a resolver pelo helper |

## B. Páginas de pretensão

`shared/utils/category.ts` passa a aceitar categoria só de pretensão:
`PropertyCategory.type` vira `PropertyType | null`.

- `categorySlug({ type: null, purpose: 'venda' })` → `a-venda`
- `categoryLabel({ type: null, purpose: 'venda' })` → `Imóveis à venda`

As duas páginas reusam o `app/pages/imoveis/[categoria].vue` que já existe — sem
rota nova, sem componente novo. O filtro deixa de exigir `type` quando ele é
nulo.

```
/imoveis/a-venda        /imoveis/para-alugar
```

**Piso de conteúdo.** `CATEGORY_MIN_PROPERTIES` (3) continua valendo, mas o
efeito muda **só para as categorias de pretensão**: em vez de 404, a página
responde 200 com estado vazio e CTA de contato, leva `noindex,follow` e fica
fora do sitemap. As categorias tipo+pretensão continuam com 404 — ninguém chega
nelas pelo menu, então 404 ali não aparece para visitante.

Com o inventário atual: `tatiane` (0 aluguel) e `olmi` (1 aluguel) recebem a
página desindexada; `demo` e `tres-lagoas` (3 cada) recebem a página indexada.

**Home.** Perde o `?purpose=` da URL e volta a ser só a vitrine da marca:
canonical `/`, sem title/description condicional. `/?purpose=aluguel` responde
301 para `/imoveis/para-alugar`.

**Links internos.** O bloco `catLinks` da home (que hoje lista as categorias
qualificadas) passa a incluir as duas páginas de pretensão, sempre — inclusive
quando desindexadas, porque `noindex,follow` só tira do índice, não da
navegação.

## Arquivos de rota

O arquivo da página de detalhe **move**, não é duplicado:

```
app/pages/imovel/[code].vue   →   app/pages/[slug]/[codigo].vue
```

`app/pages/imovel/` deixa de existir como página. `/imovel/{codigo}` passa a ser
tratado só pelo redirect, no servidor — sem página Vue, para não haver dois
componentes servindo o mesmo imóvel.

## Redirects

Todos 301, permanentes, e **emitidos no servidor**, não no cliente: redirect
feito depois da hidratação chega tarde demais para o rastreador e desperdiça uma
renderização.

`/imovel/{codigo}` e `/?purpose=aluguel` entram como middleware de servidor
(`server/middleware/`, no padrão do `agents.ts` que já existe), porque são
reescritas de caminho que não dependem de carregar o imóvel. O
`/{slug-desatualizado}/{codigo}` é o único que precisa do imóvel em mãos para
saber o slug canônico, então sai da própria página de detalhe, via
`sendRedirect` no `setup` do lado servidor.

| de | para | onde |
|---|---|---|
| `/imovel/{codigo}` | `/{slug-atual}/{codigo}` | middleware de servidor |
| `/?purpose=aluguel` | `/imoveis/para-alugar` | middleware de servidor |
| `/{slug-desatualizado}/{codigo}` | `/{slug-atual}/{codigo}` | página de detalhe (SSR) |

As duas primeiras linhas ficam para sempre: há link em WhatsApp de cliente, no
índice do Google e possivelmente em portal.

Nota: o middleware de `/imovel/{codigo}` precisa do slug canônico para montar o
destino, o que exige resolver o imóvel. Como a lista ativa do tenant já está
cacheada (`tenantCacheKey(tenant.id, 'properties:active')`, o mesmo cache que o
`agents.ts` usa), isso não custa consulta extra. Código inexistente segue para o
fluxo normal e termina em 404, como hoje.

## Testes

Unitários, no padrão do projeto (vitest Node puro, sem ambiente Nuxt):

- `propertySlug`: casa com quartos e bairro; terreno sem quartos; imóvel sem
  bairro; acento e caixa (`Três Lagoas` → `tres-lagoas`); código preservado cru.
- `propertyPath`: o helper produz a mesma string que sitemap, feed e card
  esperam — é o teste que impede os oito chamadores de divergirem de novo.
- `categorySlug`/`parseCategorySlug`/`categoryLabel` com `type: null`, ida e
  volta, e a garantia de que `a-venda` não colide com `casas-a-venda`.
- `qualifyingCategories` com pretensão: quem entra no sitemap e quem não entra,
  usando os números reais dos quatro tenants.
- Resolução: código exato, código com caixa diferente, código inexistente (404),
  slug desatualizado (301 com o destino certo).

## Riscos aceitos

- **Editar o código de um imóvel indexado quebra a URL antiga** (404, perde o
  ranqueamento). É o comportamento de hoje, então não é regressão — mas com o
  slug a página passa a valer mais, e o prejuízo cresce junto. Mitigação barata,
  se incomodar depois: travar o campo Código na edição, ou avisar ao salvar.
- **O `<DetailViewUrl>` do feed XML muda**, e portais vão re-crawlear. As URLs
  antigas continuam respondendo 301, o que cobre a transição.
- **`/?purpose=aluguel` pode já estar indexado.** O 301 transfere o sinal, mas a
  troca leva algumas semanas para refletir na busca.

# Venda e locação no mesmo imóvel

**Data:** 2026-11-04
**Motivo:** um cliente tem imóveis que podem ser vendidos **ou** alugados e hoje
cadastra o mesmo imóvel duas vezes (um como venda, outro como aluguel). Isso
duplica fotos e descrição, gera dois códigos para a mesma casa e deixa o
catálogo mostrando o mesmo imóvel como se fossem dois.

## Escopo

Um imóvel pode ter finalidade `venda`, `aluguel` ou `ambos`. Em `ambos` ele tem
dois preços: `price` (venda) e `rent_price` (locação). Um cadastro, um código,
uma página.

**Fora do escopo, por decisão:**

- **Status por finalidade** (vendeu mas segue para alugar). O cliente decidiu:
  se vendeu não se aluga, se alugou não se vende. O status continua único e
  tira o imóvel do site inteiro.
- **Dois cards no catálogo, dois códigos, duas URLs.** É o problema que estamos
  resolvendo.
- **Migrar imóveis já duplicados.** Quem tem a mesma casa cadastrada duas vezes
  junta à mão no painel; detectar e fundir automaticamente é arriscado
  (códigos são texto livre).

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Uma linha, `purpose = 'ambos'` + coluna `rent_price` | Duas linhas ligadas por um id | duplicaria fotos/descrição e a edição teria de manter as duas em sincronia |
| `ambos` entra no enum existente | Tabela de finalidades, `purposes[]` | só há duas finalidades; o enum já está em índices e RLS |
| `price` segue sendo o preço de venda; imóvel só-aluguel continua com o aluguel em `price` | Mover o aluguel de todo mundo para `rent_price` | backfill em produção sem ganho; o helper `precoPara` esconde a diferença |
| Helpers `atendeFinalidade` e `precoPara` em `shared/utils/` | `=== 'aluguel'` espalhado | hoje há ~25 pontos que testam `purpose === 'aluguel'`; com `ambos`, cada um viraria "venda" em silêncio |
| Um card, filtro Comprar/Alugar inclui `ambos` e o card mostra o preço da finalidade filtrada; sem filtro mostra os dois | Um card por finalidade | decisão do cliente; uma URL só, sem conteúdo duplicado para a busca |
| Feed VRSync: um anúncio por finalidade, `ListingID` = código + sufixo (`-V`, `-L`) | Um anúncio com os dois preços | o portal trata venda e locação como anúncios distintos (a confirmar no teste do feed) |
| Status único | Status por finalidade | decisão do cliente |
| Título/SEO "… à venda e para alugar", JSON-LD com duas `offers` | Duas páginas | idem |

## Mudanças por camada

1. **Banco** (`0059_...`, idempotente): `alter type property_purpose add value
   if not exists 'ambos'` (comando isolado); `rent_price numeric(12,2) null`;
   `check`: `ambos` exige `rent_price > 0`, as outras finalidades exigem
   `rent_price is null`; `grant select (rent_price)` para anon (é público).
2. **Modelo/mapper:** `Property`, `PropertyCard`, `PropertyInput` ganham
   `rentPrice`; `PropertyPurpose` ganha `'ambos'`; `Finalidade` (filtro) segue
   `venda | aluguel`.
3. **Validação:** `assertPropertyInput` exige os dois preços em `ambos`, cada um
   com o teto da sua finalidade (`priceRangeError`).
4. **Painel:** o campo "Pretensão" ganha "Venda e aluguel" e mostra o segundo
   preço; avisos de preço/m² usam o preço de venda.
5. **Catálogo:** `useCatalog`, `catalog-query`, `PropertyCard`, `HomeDestaques`,
   `similar-properties`, `category` (sitemap/contagem: `ambos` conta nas duas
   páginas de categoria), `[codigo].vue`, CTA e WhatsApp.
6. **SEO/feeds:** `propertyTitle`, `property-jsonld`, `vrsync-feed`,
   `portal-feed.repository`.
7. **Segurança (invariantes do CLAUDE.md):** `rent_price` é público, então entra
   na lista explícita de colunas públicas e no guardrail
   (`public-payload-guardrail.test.ts`); toda query segue por `tenant_id`.
8. **Privacidade:** nenhum dado novo sobre o visitante; a política não muda.

## Verificação

- Testes de unidade (Vitest) escritos antes: helpers, validação, mapper,
  catálogo, título, JSON-LD, feed, guardrail.
- Migration aplicada em Postgres local com um tenant `demo` (não há `.env`, e o
  Supabase conectado nesta sessão é o do Lagoa+, não o do imob-ai).
- Fluxo no app contra esse banco, com prints: criar imóvel em `ambos` no
  painel, ver o card nos filtros Comprar e Alugar, abrir a página, marcar como
  vendido e ver que sai das duas listas.
- `pnpm typecheck && pnpm test`.

## Para o construtor decidir

Rótulos exatos dos textos (ex.: "Venda e aluguel"), ordem dos dois preços no
card e o texto do selo quando os dois aparecem.

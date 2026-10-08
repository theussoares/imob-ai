# Hub local: "Imobiliária em <cidade> - <UF>"

**Data:** 2026-10-08
**Motivo:** a OLMI já aparece bem para a marca e para "imóveis para alugar em
Três Lagoas", mas `imobiliaria em tres lagoas` está na 4ª página e
`imobiliaria tres lagoas` perto da 10ª posição. Quem digita isso não conhece o
nome da imobiliária. Nenhuma página do site diz, no título e no H1, que é uma
imobiliária e onde: a home responde a quem já a conhece, e o "Quem somos" é
institucional e opcional (recurso `about`).

## Escopo

- Rota `/imobiliaria-<cidade>` (`app/pages/imobiliaria-[cidade].vue`), com o slug
  derivado de `tenant.city`. A cidade do tenant é a **única** que a rota aceita.
- Conteúdo a partir de dados reais: contagem de imóveis, categorias que existem,
  seis destaques, bairros com imóveis suficientes, contato e CRECI.
- Link da home (primeiro item do "Explore"), do rodapé, do sitemap e do llms.txt.
- JSON-LD: `BreadcrumbList` + `WebPage` com a mesma entidade `RealEstateAgent`
  (`@id` = origem) da home. No helper compartilhado, `areaServed` vira `City` e
  entra `hasMap` (só com coordenadas ou endereço). O `/quero-vender` passou a usar
  o helper em vez da cópia inline, que ia sem `@id`, sem endereço e sem CRECI.

**Fora do escopo, por decisão:**

- **URLs novas do plano** (`/casas-venda-tres-lagoas`, `/imoveis-tres-lagoas`…).
  A spec de 25/08 decidiu não trocar URLs que já ranqueiam, e `/imoveis/a-venda`,
  `/imoveis/para-alugar` e `/imoveis/casas-a-venda` já existem com título "… em
  <cidade>". `imoveis tres lagoas` e `imoveis para alugar` já estão no topo.
- **Páginas de bairro novas.** Já existem em `/imoveis/bairro/<slug>`, com piso de
  conteúdo; o hub só as linka.
- **Blog, Google Business Profile, avaliações, backlinks.** Não são código.
- **Flag em `tenant_features`.** É página pública sobre dados que o tenant já
  tem; sem cidade, 404. Evita migration (develop e produção dividem o banco).

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Slug derivado de `tenant.city` | `/imobiliaria-tres-lagoas` fixo no código | A plataforma é multitenant: outra cidade ganha o hub sem tocar em código |
| 404 para qualquer segmento que não seja o slug da cidade do tenant | Aceitar `/imobiliaria-<qualquer-coisa>` | Cada URL inventada seria conteúdo duplicado indexável, com canonical se afirmando autoritativo |
| Sem cidade, 404 e fora do sitemap | Publicar "Imobiliária em " | Página sem lugar nenhum |
| Descrição só com o que o cadastro sabe (nome, lugar, contagem real) | "Casas, apartamentos, terrenos e imóveis comerciais" do plano | Prometeria tipo de imóvel que a imobiliária pode não ter |
| Textos corridos usam a marca (parte antes de " \| " no nome) | Usar `tenant.name` inteiro | O nome da OLMI é "OLMI Imóveis \| Imobiliária em Três Lagoas": o lugar saía duas vezes na mesma frase |
| Título pelo `titleTemplate` do app ("… · <nome>") | `\| OLMI Imóveis` do plano | Um separador a mais de configuração por página; as demais páginas já seguem o template |
| Link no rodapé fora do registro `STATIC_FOOTER_PAGES` | Registrar a página | O registro é de caminhos fixos; este depende da cidade. Consequência: a imobiliária não consegue escondê-lo pelo painel |
| Hub primeiro no "Explore" da home | Bloco novo | Reaproveita o bloco de links de texto que já leva o rastreador às categorias |

## Observação sobre os dados

O nome da OLMI no cadastro ("OLMI Imóveis | Imobiliária em Três Lagoas") faz o
`<title>` sair "Imobiliária em Três Lagoas - MS · OLMI Imóveis | Imobiliária em
Três Lagoas". Não é bug do hub: é o nome que o tenant escolheu, e já se repete em
todas as páginas. Se a OLMI trocar para "OLMI Imóveis", o título fica limpo.

## Como medir

Registrar no Search Console, **antes** de subir, a posição de `imobiliaria em tres
lagoas`, `imobiliaria tres lagoas`, `imoveis tres lagoas` e `imoveis para alugar em
tres lagoas`, e comparar depois de algumas semanas. Não mexer em outras páginas
que já estão no topo enquanto isso.

# Temas da vitrine

**Data:** 2026-09-25
**Motivo:** com cores diferentes, os sites dos clientes ainda parecem o mesmo
site. Hoje a imobiliária muda cor principal, destaque e WhatsApp, logo,
favicon, textos e foto do hero, rodapé e "Quem somos". Todo o resto é igual
para todos: fonte, raio de borda, estilo do card, cabeçalho. Um corretor que
entra no site de outro cliente reconhece a mesma estrutura, e a própria
landing promete "a mesma plataforma, com a cara de cada imobiliária".

A diferença que mais pesa entre imobiliárias não é a cor: é o **registro**. Uma
imobiliária de alto padrão e uma de imóvel popular querem parecer coisas
opostas, e hoje as duas recebem a mesma tipografia geométrica e os mesmos cards.

## Escopo

Fase 1, esta spec:

1. **Tema visual**, escolhido numa lista fechada de quatro: fonte de título e de
   texto, escala de raio, estilo do card e respiro. Um tema é um conjunto de
   variáveis CSS pronto, não um editor.
2. **Estilo do cabeçalho**, independente do tema: claro, na cor da marca ou
   escuro. É onde a identidade aparece primeiro.
3. **Pré-requisito técnico:** tirar do CSS as fontes, sombras e bordas de card
   fixas, trocando por variáveis. Sem isso nenhum tema consegue mudar nada.
4. **Painel:** seção "Aparência" em Meu site, com a prévia do hero já existente
   renderizada em cada tema.
5. **Landing:** a seção "sua marca" passa a mostrar temas, não só cores.

**Fora do escopo, por decisão:**

- **Seções da home ligáveis e ordenáveis** (destaques em carrossel, bairros com
  foto, equipe de corretores, números da imobiliária) e **variações do hero**
  ("busca primeiro", "destaques"). Ficam para a fase 2, com spec própria: são
  mudança de estrutura e de dado (o que existe na home), não de aparência, e
  misturar as duas numa entrega só dobra o que precisa ser revisado.
- **CSS livre ou editor de estilo.** Cada controle livre (fonte, raio, sombra)
  é uma combinação a mais que ninguém testou, e o site feio do cliente vira
  problema nosso — de suporte e de reputação, porque o site mostra "Desenvolvido
  por". Tema curado é o modelo das lojas de tema: garante combinações que
  funcionam e ainda deixa os sites diferentes entre si.
- **Qualquer fonte do Google.** Cada família custa `@font-face` inline no HTML
  de todos os clientes (ver "Fontes") e fontes sem métrica ajustada fazem o
  layout pular na troca.
- **Modo escuro no site inteiro.** O tema "Alto padrão" usa cabeçalho e rodapé
  escuros, não o corpo. Fundo escuro no catálogo exige revisar contraste de
  toda cor de cliente, de foto e de selo; é um projeto à parte.
- **Tema por página** (home num tema, imóvel em outro). Um site, um tema.
- **Depoimentos.** Aparecem sempre na conversa de "diferenciar", mas são outra
  coisa (conteúdo, fase 2), e só podem existir se digitados e assumidos pelo
  cliente — nunca gerados.

## Os quatro temas

Nomes em português porque o cliente escolhe pelo nome. Os valores (a chave
gravada) vão sem acento, como todo enum que entra no banco
(`shared/models/*` é a fonte única dos rótulos).

| Chave | Rótulo | Títulos / texto | Raio | Card | Cabeçalho sugerido |
|---|---|---|---|---|---|
| `classico` | Clássico | Space Grotesk / Inter | médio (8/12/18) | borda fina | claro |
| `moderno` | Moderno | Figtree / Figtree | grande, botão pílula | sombra, sem borda | claro |
| `alto_padrao` | Alto padrão | Playfair Display / Inter | pequeno (2/4/6) | plano, linha fina, mais respiro | escuro |
| `acolhedor` | Acolhedor | Nunito / Nunito | grande (12/18/24) | sombra suave | na cor da marca |

- **`classico` é exatamente o site de hoje.** É o padrão da coluna, então
  nenhum cliente muda de aparência no dia do deploy. Critério de aceite: os
  prints da demo (`scripts/prints-landing.mjs`) saem idênticos antes e depois
  da fase de variáveis.
- O "cabeçalho sugerido" é só o valor que o painel pré-seleciona ao trocar de
  tema; o cliente pode mudar. Trocar de tema não sobrescreve um cabeçalho que ele
  escolheu à mão depois.

### Estilo do cabeçalho

| Chave | Rótulo | Fundo | Texto |
|---|---|---|---|
| `claro` | Claro | branco (hoje) | tinta |
| `marca` | Cor da marca | `--brand` | branco |
| `escuro` | Escuro | `--ink` | branco |

`marca` põe texto branco sobre a cor do cliente: o painel mostra o mesmo aviso
de contraste que já existe para as cores (`shared/utils/contrast.ts`) quando a
cor principal não dá 4,5:1 com branco.

Logo com traço escuro e fundo transparente some em `marca` e `escuro`. O selo do
logo ganha fundo branco arredondado nesses dois estilos — o mesmo tratamento que
o rodapé (fundo escuro) já dá à logo hoje.

## Como o tema chega ao CSS

**Nenhum valor do banco entra no CSS.** O tema vira um atributo no `<html>`:

```html
<html data-tema="alto_padrao" data-cabecalho="escuro">
```

e o `main.css` tem um bloco estático por tema:

```css
[data-tema="alto_padrao"] {
  --font-display: "Playfair Display", Georgia, serif;
  --font-body: "Inter", system-ui, sans-serif;
  --r-sm: 2px; --r-md: 4px; --r-lg: 6px;
  --card-border: 1px solid var(--line);
  --card-shadow: none;
  --space-section: 64px;
}
```

A leitura normaliza o valor para a lista fechada antes de pôr no atributo
(`temaValido`, no molde de `tomValido` em `shared/models/ai-tone.ts`): `tenants`
aceita UPDATE direto pelo PostgREST, e é quem lê que precisa desconfiar — é o
mesmo raciocínio que levou ao `temaCss` das cores. Valor desconhecido vira
`classico`, nunca um atributo com texto arbitrário.

O seletor é de atributo em **qualquer ancestral**, não só no `<html>`: é o que
deixa o painel renderizar a prévia do hero dentro de uma `div data-tema="..."`,
com o tema aplicado só ali, sem afetar o painel em volta.

## Fontes

O `@nuxt/fonts` foi enxugado em 24/09 (só `latin`, só `normal`) porque o
`@font-face` inline chegava a 149 regras e 54 KB no HTML da home, atrasando o
preload do hero (ver o comentário em `nuxt.config.ts`). Cada família que entra
agora tem custo para **todos** os clientes, não só para quem usa o tema.

- `Figtree` já está declarada (landing) e serve o `moderno`: família nova zero.
- Entram `Playfair Display` e `Nunito`, só `latin`, só `normal`, pesos
  400/600/700: cerca de 6 regras de `@font-face` a mais.
- O navegador só baixa o `.woff2` da face que o CSS da página usa; o que todos
  pagam é o texto das regras. **Critério de aceite: medir os bytes de CSS inline
  da home antes e depois; teto de +4 KB.** Se passar, a alternativa é injetar o
  `@font-face` do tema só na página do tenant que o usa (ver tabela).
- Risco a validar: o `@nuxt/fonts` descobre as famílias varrendo o CSS. Nomes
  que só aparecem dentro de `[data-tema]` precisam estar em `families`
  explicitamente, senão a face não é gerada e o navegador cai na fonte de
  sistema sem avisar ninguém.

## Pré-requisito: variáveis no lugar de valor fixo

Hoje há 33 declarações de `font-family: "Space Grotesk"` e 7 de `"Inter"` em 16
arquivos, além de sombra e borda de card escritas à mão. Elas viram
`var(--font-display)`, `var(--font-body)`, `var(--card-border)` e
`var(--card-shadow)`, com os valores atuais como padrão em `:root`.

Esta etapa entra **sozinha e antes** de qualquer tema, num PR próprio: é a
parte com mais arquivos e a única que pode mudar o site de hoje por engano.
Separada, a revisão é "nada mudou" (prints idênticos); junta com os temas,
seria impossível distinguir regressão de tema novo.

Um teste de guarda (no molde de `public-payload-guardrail.test.ts`) passa a
recusar `font-family` com nome de fonte literal fora dos blocos de tema: sem
ele, o próximo componente escreve `"Space Grotesk"` à mão e fica igual em todos
os temas, sem erro nenhum.

## Dados

Duas colunas em `tenants`, na próxima migration numerada:

```sql
alter table public.tenants
  add column if not exists site_theme text not null default 'classico',
  add column if not exists header_style text not null default 'claro';
-- check constraints nas duas, com a lista fechada
```

- Entram em `TENANT_PUBLIC_COLUMNS`: são públicas por natureza (o site as usa
  para se desenhar), não coluna interna.
- `assertTenantSettingsInput` recusa valor fora da lista com mensagem que nomeia
  o campo, como já faz com a posição da foto do hero.
- Default no banco = aparência atual: a migration não muda nenhum site.

## Painel

Em **Meu site**, seção nova "Aparência", antes do hero:

- quatro cartões de tema, cada um com a prévia do hero do próprio cliente
  (logo, cores, textos e foto dele) renderizada naquele tema — escolher vendo o
  resultado, não pelo nome;
- o estilo do cabeçalho como três opções com miniatura;
- aviso de contraste quando `marca` não dá 4,5:1 com texto branco.

Nada muda no site antes de salvar, como o resto de Meu site.

## Landing

A seção "A mesma plataforma, com a cara de cada imobiliária" hoje mostra a demo
em três cores. Passa a mostrar a demo em três **temas** — é a prova mais forte
de "cara de cada imobiliária" que o produto tem. Os prints saem do
`scripts/prints-landing.mjs`, estendido para aplicar `data-tema` e
`data-cabecalho` na captura, sem gravar nada no tenant da demo.

## Ordem de entrega

1. **Variáveis** (sem tema nenhum): fontes, sombra e borda de card viram
   variáveis; teste de guarda; prints idênticos.
2. **Colunas + leitura**: migration, modelo, mapper, validação, `temaValido`,
   atributos no `<html>`. Ainda sem tela — dá para testar pelo atalho de dev.
3. **Blocos de tema e de cabeçalho** no `main.css`, fontes novas, medição do CSS
   inline.
4. **Painel**: seção Aparência com prévias.
5. **Landing**: prints e texto.

Cada etapa é um PR e deixa o produto num estado válido sozinha.

## Testes

- `temaValido` e `cabecalhoValido`: valor desconhecido, nulo e de outra lista
  caem no padrão.
- Validação: gravar tema ou cabeçalho fora da lista é 422 com o nome do campo.
- Todo tema da lista tem bloco em `main.css`, e todo bloco de `main.css` está na
  lista (lê o arquivo): tema acrescentado só de um lado sai igual ao `classico`
  sem erro nenhum.
- Guarda de fonte literal fora dos blocos de tema.
- O teste de payload público de tenant (`public-payload-guardrail.test.ts`)
  continua passando com as colunas novas no select público: ele confere que
  nada interno (`updatedBy`, `aiTone`) vaza, e as duas colunas são públicas.

## Decisões e o porquê

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Temas curados, lista fechada | Editor livre de fonte/raio/sombra | combinação não testada vira site feio do cliente e suporte nosso |
| Cabeçalho separado do tema | Cabeçalho embutido no tema | é o controle de identidade mais pedido; amarrar ao tema força trocar tudo para mudar só o topo |
| Tema como atributo `data-tema` + CSS estático | Gerar CSS a partir do banco (como as cores) | nenhum texto do banco entra no CSS; o valor inválido não tem como virar injeção, só cai no padrão |
| Seletor em qualquer ancestral | Só no `<html>` | permite a prévia de cada tema dentro do painel |
| Duas colunas `text` com `check` | Uma coluna JSONB `aparencia` | dois valores fechados cabem em coluna com constraint; JSONB fica para a fase 2 (seções da home), que é lista ordenada de verdade |
| `classico` = site atual e padrão da coluna | Migrar clientes para um tema novo | deploy sem mudança visual para ninguém; o cliente decide quando mudar |
| Figtree no `moderno` | Uma quinta família nova | já está declarada para a landing; custo zero |
| Fontes no `@nuxt/fonts` global, com teto de +4 KB | `@font-face` injetado por tenant | mais simples e com métrica de fallback calculada pelo módulo; a injeção por tenant fica como plano B medido, não como ponto de partida |
| Variáveis num PR antes dos temas | Tudo num PR | a etapa de variáveis só pode ser revisada como "nada mudou"; misturada, regressão e tema novo ficam indistinguíveis |
| Alto padrão escuro só em cabeçalho e rodapé | Site inteiro escuro | fundo escuro exige revisar contraste de toda cor de cliente e de foto |

## Decidido com o produto (25/09)

- **Todos os planos.** Tema não entra em `tenant_features`: nenhuma trava de
  plano no painel nem na leitura.
- **Rótulos aprovados:** Clássico, Moderno, Alto padrão, Acolhedor.

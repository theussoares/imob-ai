# Auditoria — página "Quem somos" e seu editor no painel

Data: 2026-09-26 · Alvo: `app/pages/quem-somos.vue` (site) e
`app/pages/admin/quem-somos.vue` (painel), com `shared/models/about-page.ts` e
`shared/utils/about-content.ts`.

## Motivo

"Quem somos" é a página que o visitante abre quando **já gostou de um imóvel e
está decidindo se confia na imobiliária**. Pesquisa de usabilidade (NN/g,
relatório de "About Us", 85 diretrizes) mostra que o usuário espia essa página
atrás de respostas rápidas — quem são, há quanto tempo, onde, com quem vou falar
— e lê como evasiva a empresa que enterra isso. No mercado brasileiro soma-se um
item regulatório: o **CRECI** da empresa e dos corretores é o primeiro sinal de
legitimidade que o comprador procura.

Hoje o sistema de blocos é tecnicamente sólido (sanitização, 404 quando
desligada, JSON-LD, carrossel sem autoplay), mas **a página publicada depende
100% do talento editorial de cada imobiliária** e o editor não ajuda a chegar
numa boa página. O resultado provável é uma coluna de 920px com blocos soltos,
sem título principal e sem chamada no fim.

## Método

- **impeccable** (v4.4): `audit` (5 dimensões técnicas, 0–4) no site e no
  painel; heurísticas de Nielsen do `critique` no painel (modo *Operate*); o
  site é modo *Persuade*. Detector determinístico rodado nos dois arquivos: 1
  achado (ver P2-4). Execução em contexto único — sem as duas avaliações
  isoladas que o `critique` pede — e **sem navegador**: o container não tem
  `.env` do Supabase, então a leitura é de código, não de tela renderizada.
- **ui-ux-pro-max**: busca no banco de padrões por "real estate" e "trust /
  social proof". Aproveitado: a ordem de seções *Trust & Authority*
  (credibilidade → prova → solução → CTA) e *Hero + Testimonials + CTA* (prova
  social **antes** do CTA; depoimento com nome, contexto e foto). **Descartado:**
  a recomendação de estilo para o setor (glassmorphism + Cinzel + teal). A cor
  e a fonte aqui são do tenant e dos temas da vitrine
  (`2026-09-25-temas-da-vitrine-design.md`); impor outra paleta quebraria a
  premissa multitenant.
- **taste-skill** (design-taste-frontend): leitura do brief e dials.
  > **Leitura:** página institucional de imobiliária local para comprador,
  > vendedor e inquilino brasileiros, linguagem *trust-first* e próxima,
  > renderizada no tema do tenant. Dials: VARIANCE 5 · MOTION 3 · DENSITY 4.

  Isso descarta hero cinematográfico, parallax e contador animado de números: é
  página de confiança, não de campanha.
- Pesquisa web (fontes no fim).

## Placar

### Site — `app/pages/quem-somos.vue` (impeccable audit)

| # | Dimensão | Nota | Achado principal |
|---|---|---|---|
| 1 | Acessibilidade | 2 | Página com blocos não tem `<h1>`; texto branco do banner sem overlay |
| 2 | Performance | 3 | `loading="lazy"` e transform do Storage ok; sem `width/height` nem `srcset` (CLS) |
| 3 | Responsivo | 3 | Funciona no celular; tudo preso em 920px no desktop |
| 4 | Temas | 3 | Usa tokens e herda os temas; `#fff` e sombras fixas pontuais |
| 5 | Integridade | 2 | Sem arco narrativo, espaçamento uniforme, borda lateral de depoimento |
| | **Total** | **13/20** | Aceitável — trabalho significativo |

### Painel — `app/pages/admin/quem-somos.vue`

impeccable audit: A11y 2 · Performance 3 · Responsivo 3 · Temas 2 · Integridade 2
= **12/20**.

Nielsen (critique):

| # | Heurística | Nota | Problema |
|---|---|---|---|
| 1 | Visibilidade do estado | 2 | "Salvo!" só no pé de um formulário longo; nada diz "há alterações não salvas" |
| 2 | Linguagem do mundo real | 3 | Rótulos claros, exemplos bons nos placeholders |
| 3 | Controle e liberdade | 1 | "Remover" apaga bloco sem confirmar nem desfazer; sair da tela perde tudo |
| 4 | Consistência | 3 | Segue os componentes `admin-*` |
| 5 | Prevenção de erro | 1 | Corrida de upload troca imagem de bloco; publica com zero blocos; alt opcional |
| 6 | Reconhecer > lembrar | 2 | `<select>` de 10 tipos só em texto — a pessoa não vê como cada bloco fica |
| 7 | Flexibilidade | 2 | Bloco novo só entra no fim; sem duplicar; sem inserir entre blocos |
| 8 | Estética e minimalismo | 2 | Todos os blocos abertos ao mesmo tempo — parede de campos |
| 9 | Recuperação de erro | 2 | Erro de salvar aparece, mas não aponta o bloco |
| 10 | Ajuda | 3 | Dicas por bloco (equipe, logos, galeria) são boas |
| | **Total** | **21/40** | Típico de editor funcional sem cuidado de UX |

## O que já funciona (manter)

- **404 quando desligada** em vez de página rala indexada — decisão correta e bem
  documentada.
- **Sanitização por bloco** que descarta bloco vazio em vez de quebrar a página.
  Isso torna seguro oferecer *modelos* de blocos vazios (ver Fase 2).
- **Carrossel sem autoplay**, com setas de 44px e `prefers-reduced-motion`.
- **Bloco de equipe dinâmico**, lendo do cadastro de corretores — o time se
  atualiza sem tocar na página.
- **SEO**: `title`/`ogTitle` sem duplicar nome, descrição derivada do primeiro
  texto, `AboutPage` + `BreadcrumbList` em JSON-LD.
- Interruptor de publicar **na mesma tela** do conteúdo.

## Achados

### P0 — bloqueia ou corrompe dado

**P0-1. Corrida de upload grava a imagem no bloco errado.**
`admin/quem-somos.vue:52-57` guarda um único `pendingSetter`. Envie foto no
bloco A e, antes de terminar, no bloco B: o setter vira o de B, a foto de A cai
em B, e a foto de B é descartada (`pendingSetter = null` após o primeiro
`onDone`). Em galeria de 12 fotos, enviar várias em sequência é o uso normal.
*Correção:* capturar o setter na closure de cada chamada (um `onFile` que
recebe o destino) ou desabilitar todos os botões de envio enquanto
`uploadingImage` for true. *impeccable harden.*

**P0-2. Sair da tela perde o trabalho.** A página não usa `useUnsavedGuard`
(que já existe e é usado em imóveis, leads e contratos). Montar uma página de
10 blocos e clicar em outro item do menu apaga tudo sem aviso. *harden.*

### P1 — prejudica muito ou viola WCAG AA

**P1-1. Não há `<h1>` quando a página tem blocos** (`quem-somos.vue:135-138`).
O único `h1` está no estado vazio. Leitor de tela e buscador veem uma página
sem título principal; o bloco "Título de seção" vira `h2` mesmo sendo o
primeiro. *Correção:* cabeçalho fixo da página — `h1` com o nome da imobiliária
(ou "Quem somos"), frase de posicionamento (`tagline`/`heroSubtitle`) e
`CRECI-J`, sempre renderizado antes dos blocos. *typeset.*

**P1-2. Banner sem garantia de contraste** (`quem-somos.vue:376`). Título
branco só com `text-shadow` sobre foto escolhida pelo cliente: em céu, parede
branca ou fachada clara, falha 4.5:1. O comentário defende não escurecer a
foto, mas o custo é ilegibilidade. *Correção:* gradiente de baixo para cima só
atrás do texto (`linear-gradient(to top, rgb(0 0 0/.6), transparent 60%)`),
que preserva a parte de cima da imagem. *colorize.*

**P1-3. Rótulos do editor não estão ligados aos campos.** `<label
class="admin-label">Título</label>` seguido de `<input>` sem `for`/`id` (ex.:
linhas 169, 214, 270). Leitor de tela anuncia "campo de edição" sem nome; clicar
no rótulo não foca o campo. *Correção:* envolver o input no label ou gerar
`id` por bloco (`useId()`). *audit.*

**P1-4. Setas ↑ ↓ sem nome acessível** (linha 155). O leitor lê "seta para
cima" sem dizer de qual bloco. *Correção:* `aria-label="Mover 'Nossa
história' para cima"`. *clarify.*

**P1-5. Remover bloco é irreversível.** Um clique apaga um depoimento de 600
caracteres. *Correção:* desfazer por 5s via toast (padrão melhor que
`confirm()`, que ninguém lê). *harden.*

**P1-6. Página publicada termina sem próximo passo.** Com blocos, não há CTA
final: o visitante lê a história, confia, e a página acaba. O WhatsApp só
existe no estado vazio. Todas as referências de conversão (ui-ux-pro-max
*Trust & Authority*, *Hero + Testimonials + CTA*) terminam em CTA depois da
prova social. *Correção:* rodapé fixo da página — "Fale com a gente" (WhatsApp)
+ "Ver imóveis" + "Quero vender", renderizado sempre. *layout.*

### P2 — incômodo real, tem contorno

**P2-1. Tudo em coluna única de 920px com `gap: 30px` uniforme**
(`quem-somos.vue:262-267`). Banner, galeria e equipe não respiram em
desktop; texto corrido chega a ~100 caracteres por linha (ideal 60–75). Ritmo
igual entre todo par de blocos apaga a hierarquia. *Correção:* layout de duas
larguras — `.qs > *` com `max-width: 68ch` para texto, e banner/galeria/equipe/
números em largura cheia (até ~1200px); espaço maior entre **seções**
(heading inicia seção) que entre blocos da mesma seção. *layout.*

**P2-2. Números em destaque são cartões iguais em fileira.** É o "três cards
iguais" que o taste-skill aponta como padrão genérico. Para imobiliária, os
números são a prova mais forte da página. *Correção:* faixa sem cartão, número
grande na fonte display e legenda curta embaixo, separados por fio vertical;
sem contador animado (MOTION 3). *bolder.*

**P2-3. Depoimentos empilham um por bloco, em itálico, sem contexto.** Três
depoimentos viram três citações de largura cheia seguidas. Falta o que dá
credibilidade: **que tipo de negócio** (comprou, vendeu, alugou), bairro, ano.
*Correção:* agrupar depoimentos consecutivos como já se faz com `stat` (grade
de 2–3 colunas) e mostrar o complemento com mais peso. *layout.*

**P2-4. Borda lateral colorida no depoimento** (`quem-somos.vue:443`). Único
achado do detector (`side-tab`): assinatura de UI gerada. *Correção:* aspas
tipográficas grandes na cor da marca, ou nada. *quieter.*

**P2-5. Equipe em carrossel de 200px com foto redonda.** Para 3–8
corretores, carrossel esconde gente atrás de rolagem lateral — e a equipe é o
coração de um "Quem somos". *Correção:* grade em desktop (carrossel só acima de
~8 ou no celular); foto 4:5 em vez de círculo de 108px; CRECI visível; bio
limitada a 3 linhas. Ver P3-3 sobre contato por corretor. *layout.*

**P2-6. Bloco de equipe some sem aviso.** Se nenhum corretor estiver marcado
como público, o bloco renderiza nada (`v-if="teamBrokers?.length"`), e o
painel não avisa. *Correção:* no painel, contar corretores públicos e mostrar
"Nenhum corretor aparece no site ainda — marque em Corretores". *onboard.*

**P2-7. Publicar com zero blocos mostra o texto genérico de fallback.** O
comentário do 404 argumenta que página rala não deve ir ao ar, mas o
interruptor aceita publicar vazio e o fallback é exatamente página rala.
*Correção:* desabilitar o interruptor enquanto não houver um mínimo (1 texto
ou split), com a razão escrita ao lado. *harden.*

**P2-8. Imagens sem dimensões nem `srcset`.** Um tamanho só por bloco (960,
640, 480) servido a qualquer tela; sem `width`/`height`, o texto pula quando a
foto carrega. *optimize.*

**P2-9. Cores fixas no painel**: `#f9fafb` (l.372), `#b91c1c` (l.351), estilos
inline de margem e cor. Quebra se o painel ganhar tema. *audit.*

**P2-10. Texto alternativo opcional e silencioso.** `alt=""` marca foto da
equipe ou do escritório como decorativa. *Correção:* no painel, aviso (não
bloqueio) em imagem sem alt. *clarify.*

### P3 — acabamento

- **P3-1.** JSON-LD `RealEstateAgent` só tem nome e URL. O tenant já tem
  endereço, telefone, Instagram e CRECI: `address`, `telephone`, `sameAs`,
  `logo` e `identifier` ajudam o resultado local no Google.
- **P3-2.** Galeria sem ampliar a foto ao clicar. Reusar o visualizador de
  `PropertyGallery`.
- **P3-3.** Botão de WhatsApp **por corretor** no card da equipe é o pedido
  óbvio, mas `PublicBroker` não expõe telefone, e a exceção de telefone do
  CLAUDE.md é só a do captador no imóvel. Expor exige decisão consciente,
  entrada no guardrail de payload público e revisão de
  `app/pages/privacidade.vue`. Fica registrado, não recomendado nesta leva.
- **P3-4.** Logos cinza "até passar o mouse": no celular nunca ganham cor.
  Aceitável; só registrar.

## Estrutura proposta da página

Hoje a página é "blocos na ordem que o cliente quiser". A proposta mantém essa
liberdade, mas **cerca o conteúdo livre com uma moldura fixa** que garante o
mínimo que toda página de confiança precisa, independente do que o cliente
escreveu:

```
┌ MOLDURA FIXA (sempre renderizada, vem do cadastro do tenant) ────────────┐
│ 1. Cabeçalho: h1 nome · frase de posicionamento · cidade/UF · CRECI-J   │
├ BLOCOS LIVRES (painel) ─────────────────────────────────────────────────┤
│ 2. Números (faixa)          "18 anos · 1.200 famílias · 3 cidades"      │
│ 3. História (split)         por que começou, foto real do fundador/sede │
│ 4. Como trabalhamos         3–4 compromissos concretos, não "missão"    │
│ 5. Equipe (grade)           foto, nome, CRECI, especialidade            │
│ 6. Depoimentos (grade)      2–3, com tipo de negócio + bairro + ano     │
│ 7. Selos / portais                                                      │
├ MOLDURA FIXA ───────────────────────────────────────────────────────────┤
│ 8. Fechamento: endereço, horário, [WhatsApp] [Ver imóveis] [Quero vender]│
└─────────────────────────────────────────────────────────────────────────┘
```

A ordem 2→8 é a do padrão *Trust & Authority* (credibilidade → prova → CTA) e
é o que as páginas de imobiliária bem avaliadas fazem: foto real e local em vez
de banco de imagem, números concretos ("220+ famílias desde 2018"), equipe com
nome e rosto, depoimento com contexto, contato visível no fim.

"Como trabalhamos" (4) seria um bloco novo, `values`: lista de 3–4 itens com
título curto e uma frase. Resolve o texto de "missão, visão e valores" que
ninguém lê, trocando por compromissos verificáveis ("Visita no mesmo dia",
"Contrato revisado por advogado", "Fotos profissionais em todo anúncio").

## Editor proposto (painel)

1. **Começar com um modelo.** Com a página vazia, um botão "Montar a
   estrutura recomendada" insere os blocos 2–7 **vazios**, cada um com a
   dica de o que escrever. Seguro por construção: o sanitizador já descarta
   bloco vazio, então nada de placeholder vaza para o site.
2. **Paleta visual de blocos** no lugar do `<select>`: grade com miniatura de
   como o bloco fica + uma linha de "para que serve". Botão "+" **entre**
   blocos, não só no fim.
3. **Blocos recolhíveis.** Fechados mostram tipo + resumo (o `blockLabel` já
   existe); abre um de cada vez.
4. **Pré-visualização ao lado** (desktop) usando o **mesmo componente** que
   renderiza o site: extrair `AboutBlocks.vue` de `quem-somos.vue` e montá-lo
   no painel com o rascunho do formulário. Sem iframe, sem rota de preview,
   sem salvar para ver.
5. **Checklist de publicação** ao lado do interruptor: ✓ tem texto de
   história · ✓ tem números · ✓ equipe com corretores públicos · ✓ tem
   depoimento · ✓ todas as imagens com descrição. Não bloqueia (só o mínimo de
   P2-7 bloqueia); orienta.
6. **Números e depoimentos como bloco com itens** (igual galeria/logos):
   "Números em destaque" com até 4 itens, "Depoimentos" com até 6. Os tipos
   antigos `stat` e `testimonial` continuam lidos pelo sanitizador — o
   agrupamento de consecutivos que a página já faz os renderiza igual.
7. Barra de salvar **fixa no rodapé** com estado ("Alterações não salvas" /
   "Salvo às 14:32"), mais P0-2, P1-3, P1-4 e P1-5.

## Fora do escopo por decisão

- **Widget de avaliações do Google.** É script de terceiro no site público:
  exige atualizar `privacidade.vue`, o runbook de LGPD e banner de bloqueio
  até o aceite. Alternativa dentro do escopo: campo manual "Nota no Google"
  (4,9 · 312 avaliações) com link para o perfil — sem script.
- **Vídeo institucional embutido** (YouTube/Vimeo): mesmo motivo — terceiro
  que grava cookie. Se entrar, entra com facade (thumbnail + clique carrega) e
  revisão de política.
- **Arrastar e soltar** para reordenar: continua setas. Com blocos recolhidos
  e "+" entre blocos, arrastar vira luxo e exige lib ou código de pointer
  events com toque.
- **WhatsApp por corretor** (P3-3): decisão de privacidade própria.
- **Contador animado nos números, parallax, fade-in por rolagem**: dial de
  movimento 3 para página de confiança.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Moldura fixa (cabeçalho + fechamento) em volta dos blocos livres | Tudo livre, como hoje | Garante `h1`, CRECI e CTA em toda página sem depender do cliente lembrar |
| Cabeçalho lê `name`/`tagline`/`creci` do cadastro | Bloco "hero" editável | Dado já existe; um segundo lugar para o nome da empresa desalinha |
| Modelo insere blocos vazios | Modelo com texto-exemplo | Texto-exemplo publicado por esquecimento vira conteúdo falso no site do cliente |
| Preview com o componente real extraído | Iframe de `/quem-somos?preview` | Iframe exige rota de rascunho, auth e salvar antes de ver |
| Números e depoimentos com itens | Manter um bloco por item | 3 números = 3 blocos, 3 conjuntos de setas; agrupamento implícito confunde |
| Grade de equipe; carrossel só com muitos | Carrossel sempre | Com poucos corretores, rolagem lateral esconde o conteúdo principal |
| Gradiente parcial no banner | Só `text-shadow` | Contraste AA não é garantido com foto clara |
| Paleta e fonte do tenant/tema | Paleta "Trust Blue + Gold"/Cinzel do ui-ux-pro-max | Multitenant: a marca é do cliente |

## Plano em fases

**Fase 1 — correções (pequena, sem mudança de modelo).** P0-1, P0-2, P1-1 a
P1-6, P2-4, P2-7, P2-9. Página ganha moldura fixa (cabeçalho + fechamento).

**Fase 2 — editor.** Modelo recomendado, blocos recolhíveis, paleta visual,
"+" entre blocos, aviso de equipe vazia, checklist, barra de salvar fixa.

**Fase 3 — página.** Layout de duas larguras e ritmo por seção, faixa de
números, grade de depoimentos e de equipe, bloco `values`, blocos com itens,
imagens com dimensões/`srcset`, lightbox, JSON-LD completo, preview lado a
lado.

Nenhuma fase exige migration: o conteúdo é JSONB, validado em
`shared/utils/about-content.ts`. Nenhuma toca a política de privacidade — os
itens que tocariam estão fora do escopo acima.

## Fontes

- NN/g — [Presenting Company Information on Corporate Websites](https://www.nngroup.com/reports/about-us-presenting-company-information/), [About Us summaries](https://www.nngroup.com/articles/about-us-summaries/), [About Us information: research findings](https://www.nngroup.com/articles/about-us-information-on-websites/)
- [Best Real Estate Website Examples 2026 — Propphy](https://www.propphy.com/blog/best-real-estate-website-examples-2026)
- [24 Best Real Estate Agent Website Examples — Placester](https://placester.com/real-estate-marketing-academy/real-estate-website-design-24-best-examples)
- [10 Best Brokerage Website Examples — Maxa Designs](https://www.maxadesigns.com/blogs/best-real-estate-agents-and-brokerage-website-examples)
- [Imobiliária de confiança: como escolher — Mapa do Imóvel](https://www.imobiliariaemgramado.com.br/blog/imobiliaria-de-confianca-como-escolher)
- [Regras do CRECI para anúncios — Tecimob](https://tecimob.com.br/blog/quais-sao-as-regras-do-creci-para-anuncios-de-imoveis/)
- [Content Editor UX: why CMS usability is tough — Evolving Web](https://evolvingweb.com/blog/content-editor-ux-why-cms-usability-tough)
- Skills: [impeccable](https://github.com/pbakaus/impeccable), [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), [taste-skill](https://github.com/Leonxlnx/taste-skill)

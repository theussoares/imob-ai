# Landing da Moradi — nova identidade

## Motivo

A landing da raiz (`usemoradi.com.br`) vinha de um template de clínica: azul do
Tailwind, Plus Jakarta Sans (a mesma do Kenlo), nenhuma foto e um "print" do
produto feito de caixas cinzas em CSS. Lado a lado com a useimob, concorrente
direto, parecia amador, e nada nela era reconhecível como marca.

A proposta foi feita depois de capturar e comparar 11 landings (Luxury
Presence, AgentFire, Placester, Opendoor, Compass, QuintoAndar, Loft,
Squarespace, Framer, Tecimob, useimob). O que as boas têm em comum e entrou
aqui: o produto real como prova, gente no hero com interface por cima, preço à
vista e FAQ.

## Escopo

- `app/components/MoradiLanding.vue` reescrito; `MoradiVitrine.vue` removido
  (a vitrine de sites virou a seção "Sua marca", com a demo).
- Identidade: amarelo-ipê `#F4B400` só no CTA principal e em marcas pontuais,
  grafite, fundo neutro. Schibsted Grotesk nos títulos, Figtree no texto,
  Instrument Serif itálico em uma palavra por título no máximo.
- Imagens em `public/moradi/` (WebP): prints da demo (inclusive com três cores
  de marca), fotos Unsplash (licença Unsplash, uso comercial livre).
  Os prints saem de `scripts/prints-landing.mjs` (Playwright contra o dev
  server, tenant `demo`, cores aplicadas só na captura). Toda mudança visual no
  catálogo pede rodar de novo: o print é prova só enquanto for igual à demo —
  na primeira mudança, ele passou a mostrar um defeito já corrigido.
- Preços, teste grátis de 3 dias e recursos tirados do código e do banco.

## Fora do escopo por decisão

- **Login na landing.** Não existe cadastro self-service: o acesso ao painel é
  liberado manualmente, pelo WhatsApp. Um botão "Entrar" prometeria algo que o
  produto não faz.
- **Números de vitrine** (nº de clientes, leads, imóveis). Continua valendo a
  decisão da versão anterior: número que o visitante não confere é invenção.
- **Sites de clientes e depoimentos.** Entram quando combinados com o cliente,
  com nome e autorização. Até lá, a prova é a demo.
- **Tema escuro.** A landing é peça de marca em tema único; a fotografia foi
  escolhida para fundo claro.

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Amarelo-ipê como cor de ação | Azul (atual), petróleo/limão | O segmento inteiro é azul (Tecimob, Imobzi, Jetimob); petróleo com limão é a useimob. |
| Prints reais da demo | Ilustração do produto em CSS | O esqueleto cinza era o que mais passava "amador". Print real é prova que o visitante confere clicando. |
| Preço no componente, em constante | Tabela de planos no banco | Só a landing mostra preço, e muda raramente. Uma tabela pediria migration, RLS e tela de admin sem uso. |
| Cota da IA importada de `shared/models/ai-generation` | Número digitado na copy | É a mesma constante que o servidor usa para barrar; mudar a cota muda a landing junto. |
| CTA principal "Testar grátis por 3 dias" | "Quero meu site" | O teste é o que diminui o risco percebido de um contrato de 6 ou 12 meses. |
| "Contrato de 6 ou 12 meses" dito às claras | "Sem fidelidade" (versão anterior) | Com contrato mínimo, a frase era falsa. |
| "Sua marca" com a demo em três cores | Prints dos sites de clientes reais | Nenhum cliente combinou aparecer. As cores vêm do campo de marca do painel, o que o cliente faz sozinho — não é montagem. |

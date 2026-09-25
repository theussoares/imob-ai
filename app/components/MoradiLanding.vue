<script setup lang="ts">
/**
 * Landing da raiz da plataforma (usemoradi.com.br), renderizada quando o host
 * não resolve nenhum tenant — ver `platformRoot` em `app/pages/index.vue`.
 *
 * Decisões de identidade, o que ficou de fora e por quê:
 * docs/superpowers/specs/2026-09-24-landing-moradi-design.md.
 *
 * Toda imagem de produto aqui é print de verdade da demo,
 * e todo botão leva a algo que existe: a demo no ar ou uma conversa no
 * WhatsApp. Não há "Entrar": o acesso ao painel é liberado à mão, e um botão de
 * login prometeria um cadastro que o produto não tem.
 */
import { COTA_MENSAL_DESCRICAO } from "~~/shared/models/ai-generation";

const config = useRuntimeConfig();
const builtByName = config.public.builtByName || "MA Tech";
const demoUrl = config.public.demoUrl || "https://demo.usemoradi.com.br";
const waDigits = (config.public.builtByWhatsapp || "").replace(/\D/g, "");
const year = new Date().getFullYear();

/**
 * Duas mensagens, e não uma: quem clica em "testar" e quem clica num plano
 * estão em pontos diferentes da conversa, e a mensagem pronta é a primeira
 * coisa que se lê do outro lado — responder "qual plano?" a quem só quer testar
 * é começar errado.
 */
function wa(msg: string) {
  return waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`
    : "#";
}
const waTeste = wa("Olá! Quero o teste grátis de 3 dias da Moradi. Como faço?");
const waSite = wa(
  "Olá! Quero um site de imóveis pela Moradi. Pode me passar mais informações?",
);

const incluso = [
  {
    icone: "globe",
    t: "Domínio próprio",
    d: "Seu endereço e seu e-mail, registrados no seu nome.",
  },
  {
    icone: "panel",
    t: "Painel no seu login",
    d: "Cadastre, troque foto e mude preço sem pedir a ninguém.",
  },
  {
    icone: "search",
    t: "Feito para o Google",
    d: "Uma página por imóvel, com os dados que a busca lê.",
  },
  {
    icone: "chat",
    t: "WhatsApp integrado",
    d: "Cada anúncio abre a conversa com a mensagem pronta.",
  },
];

/**
 * Lista tirada do código, não do desejo: cada item corresponde a algo que
 * existe hoje (rota, tela ou tabela). Recurso novo entra aqui quando estiver no
 * ar — landing que promete o que o painel não tem vira chamado de suporte.
 */
const recursos = [
  { icone: "search", t: "Catálogo com busca", d: "Filtros por tipo, bairro, preço e quartos, rápido no celular." },
  { icone: "globe", t: "Google e buscas por IA", d: "Página por imóvel, sitemap, dados estruturados e llms.txt para ChatGPT e afins." },
  { icone: "chat", t: "WhatsApp em cada anúncio", d: "A conversa abre com o código do imóvel na mensagem." },
  { icone: "funnel", t: "Funil de leads", d: "Novo, contato, visita, proposta e fechado, com retorno agendado e corretor responsável." },
  { icone: "share", t: "Integração com portais", d: "Feed no padrão do Canal Pro: ZAP, Viva Real e OLX atualizam sozinhos." },
  { icone: "spark", t: "Descrição por IA", d: "Texto do anúncio no tom da imobiliária, com revisão antes de publicar." },
  { icone: "users", t: "Corretores com perfil", d: "Cada corretor com foto e contato, e o lead atribuído a quem atende." },
  { icone: "doc", t: "Contratos e Área do Cliente", d: "Inquilinos e proprietários acessam contratos e documentos com login próprio." },
  { icone: "home", t: "Captação \"Quero vender\"", d: "Página para o proprietário oferecer o imóvel, direto no seu funil." },
  { icone: "phone", t: "App no celular", d: "O painel instala na tela inicial e avisa quando há versão nova." },
  { icone: "panel", t: "Quem somos e rodapé", d: "Página institucional, redes sociais e endereço editáveis no painel." },
  { icone: "lock", t: "Domínio e marca próprios", d: "Seu domínio, seu logo, suas cores, sem selo da Moradi no anúncio." },
];

/**
 * A demo com três cores de marca, e não sites de clientes: mostrar cliente real
 * exige combinar com ele antes, e nenhum foi combinado. As cores são as do
 * campo de marca do painel (`brand_primary`/`brand_accent`) aplicadas à demo —
 * é exatamente o que um cliente consegue fazer sozinho, então não é montagem.
 */
const temas = [
  { nome: "Verde e coral", cores: ["#0f3d38", "#f87171"], img: "/moradi/tema-verde.webp", alt: "Site de demonstração com a marca em verde e coral" },
  { nome: "Marinho e dourado", cores: ["#1b2a4a", "#c9a24a"], img: "/moradi/tema-marinho.webp", alt: "O mesmo site com a marca em azul-marinho e dourado" },
  { nome: "Vinho e areia", cores: ["#6d1f2f", "#e0b48a"], img: "/moradi/tema-vinho.webp", alt: "O mesmo site com a marca em vinho e areia" },
];

const comparacao = [
  { q: "Seu nome em destaque", rede: ["sim", "Sim"], portal: ["nao", "Ao lado dos concorrentes"], moradi: "Só você" },
  { q: "Busca por bairro e preço", rede: ["nao", "Não"], portal: ["sim", "Sim"], moradi: "Sim" },
  { q: "Aparece no Google", rede: ["nao", "Raramente"], portal: ["neutro", "Com o nome do portal"], moradi: "Com o seu nome" },
  { q: "O contato é seu", rede: ["sim", "Sim"], portal: ["neutro", "Passa pelo portal"], moradi: "Direto no seu WhatsApp" },
  { q: "O anúncio fica no ar", rede: ["neutro", "Some no feed"], portal: ["neutro", "Enquanto pagar o destaque"], moradi: "Até você tirar" },
] as const;

const passos = [
  { t: "A gente conversa", d: "Pelo WhatsApp, você conta como trabalha, quantos imóveis tem e se já possui domínio.", nota: "Uma conversa" },
  { t: "Você testa grátis por 3 dias", d: "Liberamos o seu acesso ao painel. Cadastre imóveis, veja o site e o funil de leads funcionando.", nota: "3 dias, sem custo" },
  { t: "Seu site vai ao ar", d: "Gostou? Fechamos o contrato, configuramos marca e domínio, e você assume o painel.", nota: "Contrato de 6 ou 12 meses" },
];

/**
 * Preço em constante e não em tabela: só a landing mostra, e muda raramente.
 * Ver a tabela de decisões da spec. `null` é "sob consulta" — o seletor de
 * prazo não mexe nesse plano.
 */
type Prazo = 12 | 6;
const prazo = ref<Prazo>(12);
const planos = [
  {
    nome: "Corretor",
    para: "Para quem vende por conta própria",
    preco: { 12: 149, 6: 189 } as Record<Prazo, number> | null,
    itens: [
      "Site com catálogo e busca",
      "Página própria por imóvel, pronta para o Google",
      "WhatsApp em cada anúncio",
      "Funil de leads com retornos",
      "Feed para ZAP, Viva Real e OLX",
      "Domínio próprio e app do painel",
    ],
    cta: "Quero o Corretor",
    destaque: false,
  },
  {
    nome: "Imobiliária",
    para: "Para quem tem equipe, locação e carteira",
    preco: { 12: 400, 6: 450 } as Record<Prazo, number> | null,
    itens: [
      "Tudo do Corretor",
      `Descrição por IA, até ${COTA_MENSAL_DESCRICAO} por mês`,
      "Vários corretores, com perfil e leads atribuídos",
      "Contratos de administração",
      "Área do Cliente para inquilino e proprietário",
      "Página Quem somos",
    ],
    cta: "Quero o Imobiliária",
    destaque: true,
  },
  {
    nome: "Sob medida",
    para: "Para redes e grandes carteiras",
    preco: null as Record<Prazo, number> | null,
    itens: [
      "Tudo do Imobiliária",
      "Importação assistida dos imóveis",
      "Mais de um site ou domínio",
      "Suporte prioritário",
    ],
    cta: "Conversar",
    destaque: false,
  },
];
const outroPrazo = computed<Prazo>(() => (prazo.value === 12 ? 6 : 12));

const faq = [
  {
    q: "Tem teste grátis?",
    a: "Tem, e recomendamos. São 3 dias grátis com acesso ao painel de verdade, sem cobrança nenhuma: você cadastra imóveis, vê como fica o site e recebe contatos. O acesso é liberado por nós, pelo WhatsApp.",
  },
  {
    q: "Em quanto tempo o site fica no ar?",
    a: "Com as fotos e os dados dos imóveis em mãos, configurar site, cores e domínio é questão de dias. O que costuma demorar é reunir o conteúdo, e nisso a gente ajuda.",
  },
  {
    q: "Preciso ter domínio próprio?",
    a: "Não para começar. O site pode subir em seunome.usemoradi.com.br e passar para o seu domínio depois, sem refazer nada.",
  },
  {
    q: "Quem cadastra os imóveis?",
    a: "Você, pelo painel, no computador ou no celular. Se preferir, fazemos a carga inicial junto com você.",
  },
  {
    q: "Como funciona o contrato?",
    a: "Depois do teste, você escolhe 6 ou 12 meses. No de 12, a mensalidade é menor: R$ 149 no Corretor e R$ 400 no Imobiliária.",
  },
  {
    q: "E se eu não renovar?",
    a: "Os imóveis, as fotos e o domínio são seus, e o domínio fica registrado no seu nome. Ao fim do contrato, é só apontar o domínio para outro lugar. Nada fica preso aqui.",
  },
  {
    q: "A descrição por IA publica sozinha?",
    a: "Não. A IA sugere o texto e você decide: usa, edita, pede outra versão ou desfaz. Nada vai para o site sem passar pelos seus olhos.",
  },
  {
    q: "Meus imóveis vão para os portais?",
    a: "Sim. O painel gera um feed no padrão do Canal Pro. Você cola o endereço uma vez e ZAP, Viva Real e OLX passam a receber os imóveis publicados, e as atualizações.",
  },
];

useSeoMeta({
  title: "Sites de imóveis para corretores e imobiliárias",
  description:
    "Site de imóveis com a sua marca, no seu domínio: catálogo com busca, página por imóvel no Google, funil de leads e descrição por IA. Teste grátis por 3 dias.",
  ogTitle: "Moradi — Sites de imóveis para corretores e imobiliárias",
  ogDescription:
    "Seus imóveis no Google, com a sua marca. Catálogo, funil de leads e descrição por IA. Teste grátis por 3 dias.",
  ogSiteName: "Moradi",
  ogType: "website",
});
</script>

<template>
  <div class="lp">
    <!-- Sprite dos ícones de traço. Tabler (`AppIcon`) só tem os ícones que o
         site dos clientes usa; estes são da landing e não justificam crescer a
         coleção bundlada que vai para todo tenant. -->
    <svg width="0" height="0" class="lp-sprite" aria-hidden="true">
      <symbol id="lp-i-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".14" /><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M7.5 12.5l3 3 6-6.5" /></symbol>
      <symbol id="lp-i-tick" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7" /></symbol>
      <symbol id="lp-i-x" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 7l10 10M17 7L7 17" /></symbol>
      <symbol id="lp-i-plus" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14" /></symbol>
      <symbol id="lp-i-arrow" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" /></symbol>
      <symbol id="lp-i-globe" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></g></symbol>
      <symbol id="lp-i-panel" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></g></symbol>
      <symbol id="lp-i-search" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></g></symbol>
      <symbol id="lp-i-chat" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8M8 13h5" /></g></symbol>
      <symbol id="lp-i-spark" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></symbol>
      <symbol id="lp-i-funnel" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 4h18l-7 8v6l-4 2v-8z" /></symbol>
      <symbol id="lp-i-share" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" /></g></symbol>
      <symbol id="lp-i-users" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></g></symbol>
      <symbol id="lp-i-doc" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M8.5 13h7M8.5 17h5" /></g></symbol>
      <symbol id="lp-i-home" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10M10 20v-6h4v6" /></g></symbol>
      <symbol id="lp-i-phone" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M11 18h2" /></g></symbol>
      <symbol id="lp-i-lock" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></g></symbol>
      <symbol id="lp-mark" viewBox="0 0 26 26"><path d="M13 2 24 10.5V23a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10.5Z" fill="#f4b400" /><path d="M8 24v-8.5a5 5 0 0 1 10 0V24" fill="none" stroke="#16181b" stroke-width="2.6" /></symbol>
    </svg>

    <a class="trialbar" :href="waTeste" target="_blank" rel="noopener">
      <span class="tb-tag">3 dias de teste grátis</span>
      <span class="tb-txt">Use o painel de verdade, com os seus imóveis, sem pagar nada e antes de assinar o contrato.</span>
      <span class="tb-go">Pedir meu teste grátis<svg aria-hidden="true"><use href="#lp-i-arrow" /></svg></span>
    </a>

    <div class="lp-wrap">
      <header class="nav">
        <div class="nav-in">
          <a class="logo" href="#topo"><svg aria-hidden="true"><use href="#lp-mark" /></svg>moradi</a>
          <nav class="nav-links" aria-label="Seções">
            <a href="#vitrine">O site</a>
            <a href="#recursos">Recursos</a>
            <a href="#marca">Sua marca</a>
            <a href="#como">Como funciona</a>
            <a href="#planos">Planos</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <a class="btn primary sm nav-cta" :href="waSite" target="_blank" rel="noopener"><AppIcon name="wa" />Quero meu site</a>
        </div>
      </header>

      <main>
        <!-- ============ HERO ============ -->
        <section id="topo" class="hero">
          <div class="hero-copy">
            <span class="lp-eyebrow">Site de imóveis para corretores e imobiliárias</span>
            <h1>Seus imóveis no Google, com a <em class="s">sua</em> marca.</h1>
            <p class="sub">
              Um site com catálogo, busca e página própria para cada imóvel, no
              seu domínio. Você publica pelo celular e o cliente chega no seu
              WhatsApp.
            </p>
            <div class="ctas">
              <a class="btn primary" :href="waTeste" target="_blank" rel="noopener"><AppIcon name="wa" />Testar grátis por 3 dias</a>
              <a class="btn outline" :href="demoUrl" target="_blank" rel="noopener">Ver um site no ar</a>
            </div>
            <div class="micro">
              <span><svg aria-hidden="true"><use href="#lp-i-tick" /></svg>A partir de R$ 149/mês</span>
              <span><svg aria-hidden="true"><use href="#lp-i-tick" /></svg>Domínio no seu nome</span>
              <span><svg aria-hidden="true"><use href="#lp-i-tick" /></svg>3 dias de teste grátis</span>
            </div>
          </div>
          <div class="hero-media">
            <!-- LCP da página: sem lazy e com prioridade alta. -->
            <img class="photo" src="/moradi/corretora-chaves.webp" alt="Corretora de óculos e blazer segurando as chaves de um imóvel" width="1400" height="934" fetchpriority="high">
            <!-- Os dois cards são ilustração do que o produto faz (lead chegando,
                 página indexável), montados com dados da demo — não afirmam
                 volume nem resultado. -->
            <div class="float f-lead" aria-hidden="true">
              <span class="ic"><AppIcon name="wa" /></span>
              <b>Novo contato no WhatsApp</b>
              <span>"Olá! Tenho interesse no Sobrado NC-0339."</span>
            </div>
            <div class="float f-google" aria-hidden="true">
              <span class="ic"><svg><use href="#lp-i-search" /></svg></span>
              <b>Sobrado em Quinta da Lagoa</b>
              <span>Página própria, pronta para o Google</span>
            </div>
            <div class="phone"><img src="/moradi/tema-verde.webp" alt="Catálogo de imóveis do site de demonstração, visto no celular" width="700" height="1400"></div>
          </div>
        </section>

        <div class="band" aria-label="O que vem incluso">
          <div v-for="i in incluso" :key="i.t">
            <svg aria-hidden="true"><use :href="`#lp-i-${i.icone}`" /></svg>
            <b>{{ i.t }}</b>
            <span>{{ i.d }}</span>
          </div>
        </div>

        <!-- ============ O SITE ============ -->
        <section id="vitrine" class="section">
          <div class="showcase">
            <div class="head">
              <span class="lp-eyebrow">O que o seu cliente vê</span>
              <h2>Um site de imobiliária de verdade, não um perfil com link na bio.</h2>
              <p>
                Estes são prints do site de demonstração, sem retoque. Busca por
                bairro, preço e quartos, fotos grandes e o botão de WhatsApp
                sempre à mão.
              </p>
              <div class="ctas">
                <a class="btn primary" :href="demoUrl" target="_blank" rel="noopener">Abrir o site de demonstração<svg aria-hidden="true"><use href="#lp-i-arrow" /></svg></a>
              </div>
            </div>
            <div class="stage">
              <div class="laptop">
                <div class="screen"><img src="/moradi/print-catalogo.webp" alt="Catálogo do site de demonstração no computador, com cards de imóveis e filtros" width="1400" height="532" loading="lazy" decoding="async"></div>
                <div class="base" />
              </div>
              <div class="phone"><img src="/moradi/print-imovel.webp" alt="Página de um imóvel no celular, com preço, fotos e botão Tenho interesse" width="700" height="1515" loading="lazy" decoding="async"></div>
            </div>
            <div class="notes">
              <div><i>BUSCA</i><b>O cliente filtra, não rola feed</b><span>Tipo, bairro, faixa de preço e quartos, rápido no celular e sem recarregar a página.</span></div>
              <div><i>GOOGLE</i><b>Cada imóvel tem endereço próprio</b><span>Quem pesquisa "sobrado em Quinta da Lagoa" pode cair direto no seu anúncio.</span></div>
              <div><i>CONTATO</i><b>O lead chega com contexto</b><span>A mensagem já vem com o código do imóvel. Você sabe do que se trata antes de responder.</span></div>
            </div>
          </div>
        </section>

        <!-- ============ IA ============ -->
        <section id="ia" class="section">
          <div class="split">
            <!-- Réplica da tela do painel, não print: a tela real fica atrás do
                 login e o texto de exemplo precisa ser legível neste tamanho. -->
            <div class="ai-card" aria-hidden="true">
              <div class="ai-top">
                <span class="ai-title"><svg><use href="#lp-i-spark" /></svg>Descrição por IA</span>
                <span class="ai-quota">37 de {{ COTA_MENSAL_DESCRICAO }} este mês</span>
              </div>
              <div class="ai-field">
                <span class="ai-label">Dicas para a IA</span>
                <div class="ai-input">Rua tranquila, perto da escola, quintal com churrasqueira, reformado em 2024</div>
              </div>
              <div class="ai-field">
                <span class="ai-label">Tom da imobiliária</span>
                <div class="ai-tones"><span>Sóbrio</span><span class="is-on">Caloroso</span><span>Alto padrão</span></div>
              </div>
              <div class="ai-out">
                <p>Sobrado de 3 quartos em rua tranquila do Quinta da Lagoa, a poucos minutos da escola. A reforma de 2024 deixou a casa pronta para morar, e o quintal com churrasqueira é o lugar dos fins de semana em família.</p>
                <div class="ai-actions"><span class="btn dark sm">Usar este texto</span><span class="ai-undo">Desfazer</span></div>
              </div>
            </div>
            <div class="copy">
              <span class="lp-eyebrow">Descrição por IA</span>
              <h2>A descrição do anúncio, escrita em segundos.</h2>
              <p class="lp-lead">
                A IA lê os dados e as fotos do imóvel, junta com as suas dicas e
                escreve a descrição no tom da sua imobiliária. Você lê, ajusta e
                só então publica.
              </p>
              <ul class="checks">
                <li><svg aria-hidden="true"><use href="#lp-i-check" /></svg><div><b>Três tons para escolher</b><span>Sóbrio, caloroso ou alto padrão, definido uma vez no painel.</span></div></li>
                <li><svg aria-hidden="true"><use href="#lp-i-check" /></svg><div><b>Nada vai ao ar sem você</b><span>A IA sugere o texto. Quem publica é sempre o corretor, depois de ler.</span></div></li>
                <li><svg aria-hidden="true"><use href="#lp-i-check" /></svg><div><b>Gerar, reescrever ou desfazer</b><span>Não gostou? Peça outra versão ou volte ao texto anterior com um clique.</span></div></li>
              </ul>
              <p class="ai-note">Até {{ COTA_MENSAL_DESCRICAO }} descrições por mês no plano Imobiliária.</p>
            </div>
          </div>
        </section>

        <!-- ============ RECURSOS ============ -->
        <section id="recursos" class="section">
          <div class="head">
            <span class="lp-eyebrow">Tudo o que vem pronto</span>
            <h2>O site na frente, a operação por trás.</h2>
            <p>Não é só vitrine. O painel cuida dos contatos, dos portais e dos contratos, no mesmo login.</p>
          </div>
          <div class="feats">
            <div v-for="r in recursos" :key="r.t" class="feat">
              <svg aria-hidden="true"><use :href="`#lp-i-${r.icone}`" /></svg>
              <b>{{ r.t }}</b>
              <span>{{ r.d }}</span>
            </div>
          </div>
        </section>

        <!-- ============ SUA MARCA ============ -->
        <section id="marca" class="section">
          <div class="head center">
            <span class="lp-eyebrow">Sua marca, não a nossa</span>
            <h2>A mesma plataforma, com a cara de cada imobiliária.</h2>
            <p>Logo, cores e textos você define no painel. O cliente vê o seu nome do começo ao fim, sem selo da Moradi atravessando o anúncio.</p>
          </div>
          <div class="brands">
            <figure v-for="t in temas" :key="t.nome" class="brand-card">
              <div class="phone"><img :src="t.img" :alt="t.alt" width="700" height="1400" loading="lazy" decoding="async"></div>
              <figcaption><span class="chips"><i v-for="c in t.cores" :key="c" :style="{ background: c }" /></span>{{ t.nome }}</figcaption>
            </figure>
          </div>
          <p class="fine">
            Três variações do site de demonstração, trocando só as cores da marca.
            <a :href="demoUrl" target="_blank" rel="noopener">Abra a demo e clique em tudo</a>.
          </p>
        </section>

        <!-- ============ PAINEL ============ -->
        <section class="section">
          <div class="split">
            <figure class="pic">
              <img src="/moradi/corretora-mesa.webp" alt="Corretora usando o celular à mesa de trabalho, com o notebook aberto" width="1200" height="800" loading="lazy" decoding="async">
              <span class="tag" aria-hidden="true"><i />Novo lead: Sobrado NC-0339</span>
            </figure>
            <div class="copy">
              <span class="lp-eyebrow">O painel</span>
              <h2>Publicou, está no ar. Sem abrir chamado.</h2>
              <p class="lp-lead">O site é seu no dia a dia também. Tudo o que muda na rotina de um corretor, você mesmo resolve pelo celular.</p>
              <ul class="checks">
                <li><svg aria-hidden="true"><use href="#lp-i-check" /></svg><div><b>Cadastrar e editar imóveis</b><span>Fotos, preço, descrição e características, do computador ou do celular.</span></div></li>
                <li><svg aria-hidden="true"><use href="#lp-i-check" /></svg><div><b>Acompanhar cada lead</b><span>O contato entra no funil na hora, com o imóvel de origem e a data do retorno.</span></div></li>
                <li><svg aria-hidden="true"><use href="#lp-i-check" /></svg><div><b>Marcar como vendido ou alugado</b><span>Sai do site e dos portais, sem anúncio velho no ar.</span></div></li>
                <li><svg aria-hidden="true"><use href="#lp-i-check" /></svg><div><b>Mudar cores, textos e capa</b><span>O site acompanha a sua marca quando ela mudar.</span></div></li>
              </ul>
            </div>
          </div>
        </section>

        <!-- ============ COMPARAÇÃO ============ -->
        <section class="section">
          <div class="split">
            <div class="copy">
              <span class="lp-eyebrow">Por que um site próprio</span>
              <h2>Seu cliente procura no celular. <em class="s">Onde</em> ele te encontra?</h2>
              <p class="lp-lead">No feed, o imóvel some em dois dias. No portal, você divide a tela com o concorrente. No seu site, o cliente é seu.</p>
            </div>
            <figure class="pic">
              <img src="/moradi/casal-tablet.webp" alt="Casal sentado no chão entre caixas de mudança, olhando imóveis em um tablet" width="1200" height="675" loading="lazy" decoding="async">
            </figure>
          </div>
          <div class="cmp">
            <table>
              <thead>
                <tr><th><span class="sr">Critério</span></th><th>Rede social</th><th>Portal</th><th class="us">Site Moradi</th></tr>
              </thead>
              <tbody>
                <tr v-for="l in comparacao" :key="l.q">
                  <th>{{ l.q }}</th>
                  <td v-for="(cel, k) in [l.rede, l.portal]" :key="k" :class="{ no: cel[0] !== 'sim' }">
                    <span class="y"><svg v-if="cel[0] !== 'neutro'" aria-hidden="true"><use :href="cel[0] === 'sim' ? '#lp-i-tick' : '#lp-i-x'" /></svg>{{ cel[1] }}</span>
                  </td>
                  <td class="us"><span class="y"><svg aria-hidden="true"><use href="#lp-i-tick" /></svg>{{ l.moradi }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ============ COMO FUNCIONA ============ -->
        <section id="como" class="section">
          <div class="head">
            <span class="lp-eyebrow">Como funciona</span>
            <h2>Do primeiro contato ao site no ar.</h2>
          </div>
          <ol class="steps">
            <li v-for="(p, i) in passos" :key="p.t" class="step">
              <span class="n" aria-hidden="true">{{ i + 1 }}</span>
              <h3>{{ p.t }}</h3>
              <p>{{ p.d }}</p>
              <small>{{ p.nota }}</small>
            </li>
          </ol>
        </section>

        <!-- ============ PLANOS ============ -->
        <section id="planos" class="section">
          <div class="head center">
            <span class="lp-eyebrow">Planos</span>
            <h2>Preço à vista, antes de qualquer conversa.</h2>
            <p>Primeiro você testa grátis por 3 dias. Gostou, escolhe o contrato de 6 ou 12 meses. No de 12, a mensalidade cai.</p>
            <div class="term" role="group" aria-label="Duração do contrato">
              <button type="button" :class="{ 'is-on': prazo === 12 }" :aria-pressed="prazo === 12" @click="prazo = 12">12 meses</button>
              <button type="button" :class="{ 'is-on': prazo === 6 }" :aria-pressed="prazo === 6" @click="prazo = 6">6 meses</button>
            </div>
          </div>
          <div class="plans">
            <div v-for="p in planos" :key="p.nome" class="plan" :class="{ hi: p.destaque }">
              <span v-if="p.destaque" class="lp-badge">Para equipes</span>
              <h3>{{ p.nome }}</h3>
              <p class="for">{{ p.para }}</p>
              <div class="lp-price" aria-live="polite">
                <template v-if="p.preco"><b>R$ {{ p.preco[prazo] }}</b><span>/mês</span></template>
                <b v-else>Consulte</b>
              </div>
              <p class="alt">
                <template v-if="p.preco">ou R$ {{ p.preco[outroPrazo] }}/mês no contrato de {{ outroPrazo }} meses</template>
                <template v-else>Contrato e valor combinados com você</template>
              </p>
              <ul>
                <li v-for="it in p.itens" :key="it"><svg aria-hidden="true"><use href="#lp-i-tick" /></svg>{{ it }}</li>
              </ul>
              <a class="btn" :class="p.destaque ? 'primary' : 'outline'" :href="waSite" target="_blank" rel="noopener"><AppIcon name="wa" />{{ p.cta }}</a>
            </div>
          </div>
        </section>

        <!-- ============ DÚVIDAS ============ -->
        <section id="duvidas" class="section">
          <div class="faq">
            <div class="head">
              <span class="lp-eyebrow">Dúvidas</span>
              <h2>O que perguntam antes de fechar.</h2>
              <p>Não achou a sua? Chame no WhatsApp: quem responde é quem faz o site.</p>
            </div>
            <div class="faq-list">
              <details v-for="(f, i) in faq" :key="f.q" :open="i === 0">
                <summary>{{ f.q }}<svg aria-hidden="true"><use href="#lp-i-plus" /></svg></summary>
                <p>{{ f.a }}</p>
              </details>
            </div>
          </div>
        </section>

        <!-- ============ CTA FINAL ============ -->
        <section class="final">
          <img src="/moradi/chaves.webp" alt="" width="1600" height="1067" loading="lazy" decoding="async">
          <div class="final-in">
            <h2>O próximo cliente vai procurar no Google. Esteja lá com o seu nome.</h2>
            <p>Peça seu acesso pelo WhatsApp e teste grátis por 3 dias, com os seus imóveis, antes de assinar qualquer coisa.</p>
            <div class="ctas">
              <a class="btn primary" :href="waTeste" target="_blank" rel="noopener"><AppIcon name="wa" />Testar grátis por 3 dias</a>
              <a class="btn outline" :href="demoUrl" target="_blank" rel="noopener">Ver um site no ar<svg aria-hidden="true"><use href="#lp-i-arrow" /></svg></a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div class="foot">
          <div>
            <a class="logo" href="#topo"><svg aria-hidden="true"><use href="#lp-mark" /></svg>moradi</a>
            <p>Sites de imóveis para corretores e imobiliárias, com a sua marca e no seu domínio.</p>
          </div>
          <div><h4>Produto</h4><ul><li><a href="#vitrine">O site</a></li><li><a href="#recursos">Recursos</a></li><li><a href="#planos">Planos</a></li></ul></div>
          <div><h4>Ajuda</h4><ul><li><a href="#como">Como funciona</a></li><li><a href="#duvidas">Dúvidas</a></li><li><a :href="waSite" target="_blank" rel="noopener">Falar no WhatsApp</a></li></ul></div>
          <div><h4>Teste</h4><ul><li><a :href="waTeste" target="_blank" rel="noopener">Pedir meus 3 dias de teste grátis</a></li><li><a :href="demoUrl" target="_blank" rel="noopener">Site de demonstração</a></li></ul></div>
        </div>
        <div class="legal">
          <span>© {{ year }} Moradi</span>
          <span>Desenvolvido por <a :href="waSite" target="_blank" rel="noopener">{{ builtByName }}</a></span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* ============================================================
   Tokens da landing.
   Escopo local (.lp) e não :root: o resto do app pinta por tenant (--brand
   injetado no SSR), e misturar os dois faria a cor do último cliente vazar
   para cá. Tema único claro, de propósito — ver a spec.
   ============================================================ */
.lp {
  --ink: #16181b;
  --ink-2: #3d4248;
  --muted: #6a7076;
  --paper: #fbfbf9;
  --stone: #efeee9;
  --stone-2: #e4e2db;
  --line: #dcdad3;
  /* Amarelo-ipê: só CTA principal e marcas pontuais. Texto por cima é sempre
     --ink — branco sobre este amarelo reprova em contraste. */
  --ipe: #f4b400;
  --ipe-soft: #fff3cc;
  --night: #1c1f23;
  --r-lg: 28px;
  --r-md: 18px;
  --shadow: 0 1px 2px rgba(22, 24, 27, 0.06), 0 12px 32px -12px rgba(22, 24, 27, 0.22);
  --shadow-hi: 0 30px 60px -24px rgba(22, 24, 27, 0.45);
  --display: "Schibsted Grotesk", system-ui, sans-serif;
  --body: "Figtree", system-ui, sans-serif;
  --serif: "Instrument Serif", Georgia, serif;

  background: var(--paper);
  color: var(--ink);
  font: 17px/1.6 var(--body);
  padding-inline: 16px;
  /* O layout não tem overflow controlado e a faixa de topo sangra até a borda
     com margem negativa: sem isto, um arredondamento vira rolagem lateral. */
  overflow-x: clip;
}
.lp-sprite { position: absolute; }
/* Classes com prefixo `lp-` onde o nome óbvio (.eyebrow, .badge, .price,
   .wrap, .lead) já existe no main.css global: `scoped` protege o global do
   componente, não o componente do global — o eyebrow herdava a pílula do
   Hero dos clientes. */
/* Nomes por extenso aqui, além das variáveis acima: o @nuxt/fonts só detecta
   a família num `font-family` literal. Via `var()` ele não gera o @font-face e
   a página inteira cai na fonte de sistema, sem erro nenhum. */
.lp { font-family: "Figtree", system-ui, sans-serif; }
.lp :where(h1, h2, h3, h4, .logo) { font-family: "Schibsted Grotesk", system-ui, sans-serif; }
em.s { font-family: "Instrument Serif", Georgia, serif; }
.lp img { display: block; max-width: 100%; height: auto; }
.lp :where(h1, h2, h3, h4) {
  font-family: var(--display);
  margin: 0;
  letter-spacing: -0.025em;
  line-height: 1.05;
  text-wrap: balance;
}
.lp p { margin: 0; }
.lp a { color: inherit; }
.lp :where(a, button, summary):focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; border-radius: 6px; }
em.s { font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
.lp-wrap { max-width: 1200px; margin: 0 auto; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px;
  min-height: 50px; padding: 0 24px; border-radius: 99px;
  font: 600 16px/1 var(--body); text-decoration: none; white-space: nowrap; cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
.btn :deep(svg), .btn > svg { width: 19px; height: 19px; flex: none; }
.btn.primary { background: var(--ipe); color: var(--ink); box-shadow: 0 8px 20px -10px rgba(217, 154, 0, 0.9); }
.btn.primary:hover { background: #ffc21a; }
.btn.outline { background: transparent; color: var(--ink); box-shadow: inset 0 0 0 1.5px var(--ink); }
.btn.outline:hover { background: var(--ink); color: var(--paper); }
.btn.dark { background: var(--ink); color: var(--paper); }
.btn.sm { min-height: 42px; padding: 0 18px; font-size: 15px; }
@media (prefers-reduced-motion: no-preference) { .btn:active { transform: scale(0.97); } }

.lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font: 600 13px/1.3 var(--body); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-2); }
.lp-eyebrow::before { content: ""; flex: none; width: 8px; height: 8px; background: var(--ipe); transform: rotate(45deg); }
.section { padding-block: 104px 0; scroll-margin-top: 72px; }
.head { display: grid; gap: 16px; max-width: 720px; margin-bottom: 48px; }
.head h2 { font-size: clamp(34px, 4.4vw, 54px); font-weight: 700; }
.head p { color: var(--ink-2); font-size: 18.5px; max-width: 58ch; }
.head.center { margin-inline: auto; text-align: center; justify-items: center; }
.ctas { display: flex; gap: 12px; flex-wrap: wrap; }

/* ---------- faixa do teste ---------- */
/* `.lp` na frente: `.lp a { color: inherit }` ganharia de uma classe sozinha
   e o texto da faixa sumiria no fundo escuro. */
.lp .trialbar {
  display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap;
  background: var(--ink); color: #f2f1ec; text-decoration: none;
  margin-inline: -16px; padding: 11px 16px; font-size: 15px; line-height: 1.35; text-align: center;
}
.tb-tag { background: var(--ipe); color: var(--ink); font: 700 12.5px var(--body); letter-spacing: 0.05em; text-transform: uppercase; padding: 5px 10px; border-radius: 99px; white-space: nowrap; }
.tb-go { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--ipe); white-space: nowrap; }
.tb-go svg { width: 16px; height: 16px; }
.trialbar:hover .tb-go { text-decoration: underline; text-underline-offset: 3px; }

/* ---------- logo e menu ---------- */
.logo { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; font: 800 25px/1 var(--display); letter-spacing: -0.045em; color: var(--ink); }
.logo svg { width: 26px; height: 26px; }
.nav { position: sticky; top: 0; z-index: 20; background: rgba(251, 251, 249, 0.9); backdrop-filter: saturate(1.4) blur(10px); margin-inline: -16px; padding-inline: 16px; }
.nav-in { display: flex; align-items: center; gap: 28px; min-height: 74px; }
.nav-links { display: flex; gap: 26px; margin-left: 12px; font: 500 15.5px var(--body); }
.nav-links a { text-decoration: none; color: var(--ink-2); }
.nav-links a:hover { color: var(--ink); }
.nav-cta { margin-left: auto; }

/* ---------- hero ---------- */
.hero { background: var(--stone); border-radius: var(--r-lg); display: grid; grid-template-columns: 1fr 1.02fr; min-height: 620px; overflow: hidden; position: relative; margin-top: 8px; }
.hero-copy { padding: 72px 24px 64px 64px; display: grid; gap: 26px; align-content: center; justify-items: start; position: relative; z-index: 2; }
.hero h1 { font-size: clamp(42px, 5.4vw, 72px); font-weight: 700; letter-spacing: -0.04em; line-height: 0.98; }
.hero h1 em.s { font-size: 1.08em; }
.hero .sub { font-size: 19px; color: var(--ink-2); max-width: 44ch; }
.micro { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 14.5px; color: var(--ink-2); }
.micro span { display: inline-flex; align-items: center; gap: 7px; }
.micro svg { width: 16px; height: 16px; color: var(--ink); }
.hero-media { position: relative; min-height: 520px; }
.hero-media .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 22% 30%; }
.hero-media .phone { position: absolute; right: 46px; bottom: -40px; width: 230px; transform: rotate(3deg); }
.float { position: absolute; background: #fff; border-radius: 16px; box-shadow: var(--shadow-hi); padding: 14px 16px; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; align-items: center; font-size: 14px; line-height: 1.35; max-width: 290px; }
.float .ic { grid-row: span 2; width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; }
.float .ic :deep(svg), .float .ic svg { width: 20px; height: 20px; }
.float b { font: 700 14.5px var(--body); }
.float span { color: var(--muted); }
.f-lead { left: -8px; top: 70px; }
.f-lead .ic { background: #dcf5e3; color: #0d7539; }
.f-google { left: 40px; bottom: 64px; }
.f-google .ic { background: var(--ipe-soft); color: var(--ink); }

/* ---------- aparelhos ---------- */
.phone { background: #0e0f11; border-radius: 38px; padding: 9px; box-shadow: var(--shadow-hi); }
.phone img { border-radius: 30px; width: 100%; aspect-ratio: 1 / 2; object-fit: cover; object-position: top; }
.laptop .screen { background: #0e0f11; border-radius: 14px 14px 0 0; padding: 12px 12px 14px; }
.laptop .screen img { border-radius: 4px; width: 100%; }
.laptop .base { height: 16px; margin-inline: -5%; background: linear-gradient(#dcdde0, #a7a9ae); border-radius: 0 0 16px 16px; }
.laptop .base::after { content: ""; display: block; width: 16%; height: 6px; margin: 0 auto; background: #8e9095; border-radius: 0 0 8px 8px; }

/* ---------- faixa do incluso ---------- */
.band { display: grid; grid-template-columns: repeat(4, 1fr); border-block: 1px solid var(--line); margin-top: 40px; }
.band > div { padding: 26px 26px 26px 0; display: grid; gap: 6px; grid-template-columns: auto 1fr; column-gap: 14px; }
.band > div + div { padding-left: 26px; border-left: 1px solid var(--line); }
.band svg { width: 24px; height: 24px; grid-row: span 2; margin-top: 2px; }
.band b { font: 700 17px var(--display); letter-spacing: -0.01em; }
.band span { color: var(--ink-2); font-size: 15px; line-height: 1.45; }

/* ---------- o que o cliente vê ---------- */
.showcase { background: var(--night); color: #f2f1ec; border-radius: var(--r-lg); padding: 80px 64px 0; overflow: hidden; display: grid; gap: 52px; }
.showcase .head { margin-bottom: 0; }
.showcase .head h2 { color: #fff; }
.showcase .head p { color: #b9bcbf; }
.showcase .lp-eyebrow { color: #d9d8d2; }
.stage { position: relative; max-width: 1000px; margin: 0 auto; width: 100%; }
.stage .laptop { width: 88%; }
.stage .phone { position: absolute; right: 0; bottom: -30px; width: 23%; min-width: 150px; }
.notes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; padding-block: 36px 72px; margin-top: 40px; border-top: 1px solid #34383d; }
.notes div { display: grid; gap: 6px; }
.notes b { font: 700 18px var(--display); color: #fff; }
.notes span { color: #b9bcbf; font-size: 15.5px; }
.notes i { font: normal 600 13px var(--body); color: var(--ipe); letter-spacing: 0.04em; }

/* ---------- split com foto ---------- */
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center; }
.pic { margin: 0; border-radius: var(--r-lg); overflow: hidden; position: relative; }
.pic img { width: 100%; aspect-ratio: 5 / 4; object-fit: cover; }
.copy { display: grid; gap: 22px; justify-items: start; }
.copy h2 { font-size: clamp(32px, 3.8vw, 48px); font-weight: 700; }
.lp-lead { color: var(--ink-2); font-size: 18.5px; max-width: 48ch; }
.checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.checks li { display: grid; grid-template-columns: 26px 1fr; gap: 12px; align-items: start; }
.checks svg { width: 22px; height: 22px; margin-top: 3px; }
.checks b { display: block; font-weight: 700; }
.checks span { color: var(--ink-2); font-size: 16px; }
.tag { position: absolute; left: 18px; bottom: 18px; background: #fff; border-radius: 14px; padding: 12px 14px; box-shadow: var(--shadow); display: flex; align-items: center; gap: 10px; font-size: 14.5px; font-weight: 600; }
.tag i { width: 10px; height: 10px; border-radius: 50%; background: #1fa855; box-shadow: 0 0 0 4px #dcf5e3; }

/* ---------- descrição por IA ---------- */
.ai-card { background: var(--night); color: #eceae4; border-radius: var(--r-lg); padding: 26px; display: grid; gap: 18px; box-shadow: var(--shadow-hi); }
.ai-top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.ai-title { display: inline-flex; align-items: center; gap: 9px; font: 700 17px var(--display); color: #fff; }
.ai-title svg { width: 20px; height: 20px; color: var(--ipe); }
.ai-quota { font-size: 13px; color: #a9adb1; background: #2a2e33; padding: 5px 10px; border-radius: 99px; font-variant-numeric: tabular-nums; }
.ai-field { display: grid; gap: 8px; }
.ai-label { font-size: 13px; font-weight: 600; color: #a9adb1; }
.ai-input { background: #26292e; border: 1px solid #3a3f45; border-radius: 12px; padding: 12px 14px; font-size: 15px; }
.ai-tones { display: flex; gap: 8px; flex-wrap: wrap; }
.ai-tones span { font-size: 14px; font-weight: 600; padding: 8px 14px; border-radius: 99px; border: 1px solid #3a3f45; color: #cfd1d3; }
.ai-tones span.is-on { background: var(--ipe); border-color: var(--ipe); color: var(--ink); }
.ai-out { background: #fff; color: var(--ink); border-radius: 16px; padding: 18px; display: grid; gap: 14px; font-size: 15.5px; line-height: 1.6; }
.ai-actions { display: flex; align-items: center; gap: 16px; }
.ai-undo { font-size: 14.5px; font-weight: 600; color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
.ai-note { font-size: 14.5px; color: var(--muted); }

/* ---------- recursos ---------- */
.feats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; }
.feat { background: var(--paper); padding: 26px 24px 28px; display: grid; gap: 8px; align-content: start; }
.feat svg { width: 26px; height: 26px; margin-bottom: 6px; }
.feat b { font: 700 17.5px var(--display); letter-spacing: -0.01em; }
.feat span { color: var(--ink-2); font-size: 15px; line-height: 1.5; }

/* ---------- sua marca ---------- */
.brands { display: grid; grid-template-columns: repeat(3, 1fr); gap: 36px; align-items: start; }
.brand-card { margin: 0; display: grid; gap: 18px; justify-items: center; }
.brand-card .phone { width: min(270px, 100%); }
/* O do meio desce: três celulares alinhados leem como tabela, e o degrau é o
   que faz o olho comparar um com o outro. */
.brand-card:nth-child(2) { margin-top: 48px; }
.brand-card figcaption { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 15px; }
.chips { display: flex; gap: 5px; }
.chips i { width: 18px; height: 18px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1); }
.lp .fine { margin-top: 40px; text-align: center; color: var(--muted); font-size: 15px; }
.fine a { color: var(--ink); font-weight: 600; }

/* ---------- comparação ---------- */
.cmp { margin-top: 48px; border: 1px solid var(--line); border-radius: var(--r-md); overflow-x: auto; background: #fff; }
.cmp table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 16px; }
.cmp th, .cmp td { padding: 18px 22px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: middle; }
.cmp thead th { font: 600 13px var(--body); letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); background: var(--paper); }
.cmp thead th.us { background: var(--ink); color: var(--ipe); }
.cmp td.us { background: #fffaeb; font-weight: 600; }
.cmp tbody th { font-weight: 600; width: 28%; }
.cmp tr:last-child th, .cmp tr:last-child td { border-bottom: 0; }
.cmp td.no { color: var(--muted); }
.y { display: inline-flex; align-items: center; gap: 8px; }
.y svg { width: 18px; height: 18px; flex: none; }

/* ---------- passos ---------- */
.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.step { background: var(--stone); border-radius: var(--r-md); padding: 30px 28px 32px; display: grid; gap: 12px; align-content: start; }
.step .n { font: 800 15px var(--display); width: 40px; height: 40px; border-radius: 50%; background: var(--ink); color: var(--ipe); display: grid; place-items: center; }
.step h3 { font-size: 23px; font-weight: 700; }
.step p { color: var(--ink-2); font-size: 16px; }
.step small { font-size: 13.5px; color: var(--muted); font-weight: 600; }

/* ---------- planos ---------- */
.term { display: inline-flex; background: var(--stone); border-radius: 99px; padding: 5px; margin-top: 8px; }
.term button { border: 0; background: transparent; font: 600 15px var(--body); color: var(--ink-2); min-height: 42px; padding: 0 20px; border-radius: 99px; cursor: pointer; }
.term button.is-on { background: var(--ink); color: #fff; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; }
.plan { border: 1px solid var(--line); border-radius: var(--r-md); background: #fff; padding: 32px 28px; display: grid; gap: 20px; align-content: start; position: relative; }
.plan.hi { background: var(--ink); color: #f2f1ec; border-color: var(--ink); }
.lp-badge { position: absolute; top: -13px; left: 28px; background: var(--ipe); color: var(--ink); font: 700 12.5px var(--body); letter-spacing: 0.04em; text-transform: uppercase; padding: 6px 11px; border-radius: 99px; }
.plan h3 { font-size: 22px; font-weight: 700; }
/* `.plan` na frente: `.lp p` zera a margem e ganharia de uma classe sozinha. */
.plan .for { color: var(--muted); font-size: 15px; margin-top: -12px; }
.plan.hi .for, .plan.hi .alt { color: #b9bcbf; }
.lp-price { display: flex; align-items: baseline; gap: 6px; font-family: var(--display); }
.lp-price b { font-size: 46px; font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
.lp-price span { color: var(--muted); font-size: 15px; font-family: var(--body); }
.plan.hi .lp-price span { color: #b9bcbf; }
.plan .alt { font-size: 14.5px; color: var(--muted); margin-top: -12px; }
.plan ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; font-size: 15.5px; }
.plan li { display: grid; grid-template-columns: 20px 1fr; gap: 10px; }
.plan li svg { width: 18px; height: 18px; margin-top: 3px; }
.plan .btn { width: 100%; }
.plan.hi .btn.outline { color: #fff; box-shadow: inset 0 0 0 1.5px #fff; }

/* ---------- dúvidas ---------- */
.faq { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 64px; align-items: start; }
.faq .head { margin: 0; }
.faq-list { border-top: 1px solid var(--line); }
.faq details { border-bottom: 1px solid var(--line); }
.faq summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; gap: 20px; padding: 22px 0; font: 600 18.5px/1.35 var(--display); letter-spacing: -0.01em; }
.faq summary::-webkit-details-marker { display: none; }
.faq summary svg { width: 22px; height: 22px; flex: none; transition: transform 0.2s ease; }
.faq details[open] summary svg { transform: rotate(45deg); }
.faq details p { padding: 0 40px 24px 0; color: var(--ink-2); font-size: 16.5px; }

/* ---------- CTA final ---------- */
.final { position: relative; border-radius: var(--r-lg); overflow: hidden; min-height: 480px; display: grid; align-items: end; color: #fff; margin-top: 104px; }
.final img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 45%; }
.final::before { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(16, 18, 20, 0.9) 0%, rgba(16, 18, 20, 0.6) 45%, rgba(16, 18, 20, 0.1) 80%); z-index: 1; }
.final-in { position: relative; z-index: 2; padding: 64px; display: grid; gap: 22px; justify-items: start; max-width: 680px; }
.final h2 { font-size: clamp(36px, 4.6vw, 58px); font-weight: 700; color: #fff; }
.final p { color: #e2e2dd; font-size: 18.5px; max-width: 46ch; }
.final .btn.outline { color: #fff; box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.7); }
.final .btn.outline:hover { background: #fff; color: var(--ink); }

/* ---------- rodapé ---------- */
.foot { display: grid; grid-template-columns: 1.3fr repeat(3, 1fr); gap: 40px; padding-block: 72px 40px; border-bottom: 1px solid var(--line); }
.foot p { color: var(--ink-2); font-size: 15px; margin-top: 14px; max-width: 34ch; }
.foot h4 { font: 700 14px var(--body); letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }
.foot ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; font-size: 15.5px; }
.foot a { text-decoration: none; color: var(--ink-2); }
.foot a:hover { color: var(--ink); }
.legal { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-block: 22px 56px; color: var(--muted); font-size: 13.5px; }

/* ---------- responsivo ---------- */
@media (max-width: 1000px) {
  .nav-links { display: none; }
  .hero { grid-template-columns: 1fr; }
  .hero-copy { padding: 48px 28px 32px; }
  .hero-media { min-height: 460px; }
  .hero-media .phone { right: 24px; width: 190px; bottom: -30px; }
  .f-lead { left: 16px; top: 24px; }
  .f-google { left: 16px; bottom: 28px; }
  .band { grid-template-columns: 1fr 1fr; }
  .band > div:nth-child(3) { padding-left: 0; border-left: 0; }
  .band > div:nth-child(n + 3) { border-top: 1px solid var(--line); }
  .showcase { padding: 56px 24px 0; }
  .notes { grid-template-columns: 1fr; gap: 20px; }
  .split, .faq { grid-template-columns: 1fr; gap: 36px; }
  .steps, .plans, .brands { grid-template-columns: 1fr; }
  .brands { justify-items: center; }
  .brand-card:nth-child(2) { margin-top: 0; }
  .feats { grid-template-columns: 1fr 1fr; }
  .final-in { padding: 36px 24px; }
  .final::before { background: linear-gradient(0deg, rgba(16, 18, 20, 0.92) 10%, rgba(16, 18, 20, 0.45) 100%); }
  .foot { grid-template-columns: 1fr 1fr; }
  .section { padding-top: 80px; }
}
@media (max-width: 560px) {
  .nav-cta { font-size: 14px; padding: 0 14px; }
  .band, .feats, .foot { grid-template-columns: 1fr; }
  .band > div { padding: 20px 0 !important; border-left: 0 !important; }
  .band > div + div { border-top: 1px solid var(--line); }
  .hero-media .phone { width: 160px; }
  .float { max-width: 240px; font-size: 13px; }
  .stage .laptop { width: 100%; }
  .stage .phone { position: relative; width: 60%; margin: -40px auto 0; right: auto; bottom: auto; }
}
</style>

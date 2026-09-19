<script setup lang="ts">
/**
 * Landing da raiz da plataforma (usemoradi.com.br), renderizada quando o host
 * não resolve nenhum tenant — ver `platformRoot` em `app/pages/index.vue`.
 *
 * O desenho veio de um template externo ("Clinical Prestige"): topo de
 * confiança, hero com prova ao lado, faixa escura de âncora, cards brancos
 * sobre fundo azul-gelo e CTA pill. Duas coisas do template NÃO vieram junto,
 * de propósito:
 *
 * - a barra de métricas ("+6.500 atendimentos", "4.9 no Google") virou "o que
 *   está incluso". Número de vitrine que ninguém pode conferir é invenção, e
 *   esta landing vende justamente a ideia de site honesto;
 * - os depoimentos assinados saíram. A prova social aqui é a vitrine: dois
 *   endereços que a pessoa abre e navega. Quando houver depoimento real de
 *   cliente, ele entra — com nome de quem falou.
 */
const config = useRuntimeConfig();
const builtByName = config.public.builtByName || "Matheus Soares";
const demoUrl = config.public.demoUrl || "https://demo.usemoradi.com.br";
const waDigits = (config.public.builtByWhatsapp || "").replace(/\D/g, "");
const waLink = computed(() => {
  const msg =
    "Olá! Quero um site de imóveis pela Moradi. Pode me passar mais informações?";
  return waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}`
    : "#";
});
const year = new Date().getFullYear();

/**
 * Faixa de âncora, no lugar das métricas do template. Tudo aqui é verificável
 * abrindo a demo — nada afirma volume, nota ou resultado.
 */
const incluso = [
  {
    t: "Domínio próprio",
    d: "Seu endereço, com certificado e e-mail no seu nome.",
  },
  {
    t: "Painel próprio",
    d: "Você cadastra, edita e publica sem depender de ninguém.",
  },
  {
    t: "SEO técnico",
    d: "Sitemap, dados estruturados e uma página por imóvel.",
  },
  {
    t: "WhatsApp integrado",
    d: "Cada imóvel abre a conversa com a mensagem já escrita.",
  },
];

const contraste = {
  comum: [
    {
      t: "Um perfil de rede social como vitrine",
      d: "O imóvel some no feed em dois dias e o cliente não consegue filtrar por bairro nem por preço.",
    },
    {
      t: "Site que só o desenvolvedor mexe",
      d: "Cada foto trocada vira um pedido, uma espera e, quase sempre, uma cobrança.",
    },
    {
      t: "Página bonita que o Google não acha",
      d: "Sem endereço próprio por imóvel, quem procura pelo bairro na busca nunca chega até você.",
    },
  ],
  moradi: [
    {
      t: "Catálogo com busca de verdade",
      d: "Filtro por tipo, bairro, preço e quartos — sem recarregar a página, rápido no celular.",
    },
    {
      t: "Painel no seu login",
      d: "Cadastrar imóvel, subir foto, mudar cor e texto: tudo você mesmo, na hora.",
    },
    {
      t: "Uma página por imóvel",
      d: "Endereço próprio, título, descrição e dados estruturados — o que o Google precisa para indexar.",
    },
  ],
};

const features = [
  {
    t: "Catálogo com busca",
    d: "Imóveis com filtros por tipo, bairro, preço e quartos — rápido e sem recarregar a página.",
  },
  {
    t: "Encontrado no Google e na IA",
    d: "SEO técnico pronto: dados estruturados, sitemap, títulos e páginas otimizadas para buscas.",
  },
  {
    t: "WhatsApp integrado",
    d: "Cada imóvel com botão de contato direto no WhatsApp, com mensagem já preenchida.",
  },
  {
    t: "Painel próprio",
    d: "O corretor cadastra e edita imóveis, sobe fotos e muda cores e textos — sem depender de ninguém.",
  },
  {
    t: "Domínio ou subdomínio",
    d: "Seu site no seu domínio (ou em seunome.usemoradi.com.br), com identidade e cores próprias.",
  },
  {
    t: "Rápido e mobile-first",
    d: "Feito para carregar rápido no celular, onde a maioria dos clientes procura imóveis.",
  },
];

const steps = [
  {
    n: "1",
    t: "Fale com a gente",
    d: "Você entra em contato e conta sobre o seu trabalho.",
  },
  {
    n: "2",
    t: "Montamos seu site",
    d: "Configuramos o site, as cores, o domínio e publicamos.",
  },
  {
    n: "3",
    t: "Você gerencia",
    d: "Cadastra os imóveis no painel e começa a receber contatos.",
  },
];

const faq = [
  {
    q: "Em quanto tempo o site fica no ar?",
    a: "Depende de quanto material você já tem pronto. Com as fotos e os dados dos imóveis em mãos, a configuração do site, das cores e do domínio é questão de dias — não de meses. O que costuma demorar é reunir o conteúdo, e nisso a gente ajuda.",
  },
  {
    q: "Preciso ter domínio próprio?",
    a: "Não para começar. O site pode subir em seunome.usemoradi.com.br e passar para o seu domínio depois, sem refazer nada. Se você já tem um domínio, ele é apontado para o site — inclusive um que hoje esteja em outro serviço.",
  },
  {
    q: "Quem cadastra os imóveis?",
    a: "Você, no painel, pelo computador ou pelo celular. Cadastrar imóvel, subir foto, marcar como vendido, mudar preço e alterar textos do site são coisas que não passam por nós. Se preferir, fazemos a carga inicial junto com você.",
  },
  {
    q: "O site funciona bem no celular?",
    a: "É onde ele foi pensado primeiro. A maior parte de quem procura imóvel procura no celular, então o catálogo, a busca e as fotos são feitos para carregar rápido em conexão de rua — e é exatamente isso que a demonstração mostra.",
  },
  {
    q: "E se eu quiser sair depois?",
    a: "Os imóveis e as fotos são seus, e o domínio também — ele está registrado no seu nome, não no nosso. Sair significa apontar o domínio para outro lugar; não existe conteúdo preso aqui dentro.",
  },
];

useSeoMeta({
  title: "Sites de imóveis para corretores e imobiliárias",
  description:
    "A Moradi cria sites de imóveis rápidos, otimizados para o Google e com painel próprio para o corretor. Cada cliente com seu site e domínio.",
  ogTitle: "Moradi — Sites de imóveis para corretores",
  ogDescription:
    "Sites de imóveis rápidos, encontrados no Google e com painel próprio. Cada corretor com o seu site e domínio.",
  ogSiteName: "Moradi",
  ogType: "website",
});
</script>

<template>
  <div class="lp">
    <header class="lp-bar">
      <div class="lp-bar-top">
        <div class="lp-wrap lp-bar-top-in">
          <span class="lp-trust">
            <span class="lp-trust-dot" aria-hidden="true" />
            Site próprio, domínio próprio, painel próprio
          </span>
          <span class="lp-trust-sep" aria-hidden="true">•</span>
          <span class="lp-trust hide-sm">Publicação em poucos dias</span>
          <a
            v-if="waDigits"
            class="lp-trust-wa"
            :href="waLink"
            target="_blank"
            rel="noopener"
          >
            <AppIcon name="wa" />
            Falar agora
          </a>
        </div>
      </div>

      <div class="lp-wrap lp-bar-in">
        <a class="lp-logo" href="/">moradi<span>.</span></a>

        <nav class="lp-nav">
          <a href="#modelos">Sites no ar</a>
          <a href="#recursos">O que vem pronto</a>
          <a href="#como">Como funciona</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>

        <a class="lp-btn wa sm" :href="waLink" target="_blank" rel="noopener">
          <AppIcon name="wa" />
          <span>Fale conosco</span>
        </a>
      </div>
    </header>

    <main>
      <section class="lp-hero">
        <div class="lp-glow" aria-hidden="true" />
        <div class="lp-wrap lp-hero-in">
          <div class="lp-hero-copy">
            <span class="lp-badge">
              <span class="lp-badge-dot" aria-hidden="true" />
              Plataforma para corretores e imobiliárias
            </span>

            <h1>Seu site de imóveis, pronto para <em>vender</em>.</h1>

            <p class="lp-sub">
              Um catálogo online rápido, otimizado para o Google e com painel
              próprio. Cada corretor com o seu site, o seu domínio e a sua
              marca.
            </p>

            <div class="lp-actions">
              <a class="lp-btn wa" :href="waLink" target="_blank" rel="noopener">
                <AppIcon name="wa" />
                <span>Quero meu site</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M5 12h13m0 0-5-5m5 5-5 5"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </a>
              <a class="lp-btn ghost" href="#modelos">Ver os sites no ar</a>
            </div>

            <p class="lp-microcopy">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  stroke-width="2.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              Sem taxa de setup escondida • Domínio no seu nome • Suporte direto
              com quem fez
            </p>

            <div class="lp-selos">
              <span class="lp-selo">Painel próprio</span>
              <span class="lp-selo">SEO técnico pronto</span>
              <span class="lp-selo">Mobile-first</span>
            </div>
          </div>

          <!-- Ilustração do produto, não captura de tela: nada aqui afirma
               número nem resultado. O endereço na barra é a demo de verdade,
               e o card inteiro leva até ela. -->
          <a class="lp-shot" :href="demoUrl" target="_blank" rel="noopener">
            <span class="lp-shot-bar" aria-hidden="true">
              <i /><i /><i />
              <span class="lp-shot-url">demo.usemoradi.com.br</span>
            </span>
            <span class="lp-shot-body" aria-hidden="true">
              <span class="lp-shot-nav">
                <span class="lp-shot-logo" />
                <span class="lp-shot-pills"><i /><i /><i /></span>
              </span>
              <span class="lp-shot-grid">
                <span v-for="n in 4" :key="n" class="lp-shot-card">
                  <span class="lp-shot-img" />
                  <span class="lp-shot-line w70" />
                  <span class="lp-shot-line w40" />
                </span>
              </span>
            </span>
            <span class="lp-shot-cap">
              Abrir a demonstração de verdade
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 12h13m0 0-5-5m5 5-5 5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
          </a>
        </div>
      </section>

      <section class="lp-faixa">
        <div class="lp-wrap lp-faixa-in">
          <div v-for="i in incluso" :key="i.t" class="lp-faixa-item">
            <span class="lp-faixa-t">{{ i.t }}</span>
            <span class="lp-faixa-d">{{ i.d }}</span>
          </div>
        </div>
      </section>

      <section class="lp-section">
        <div class="lp-wrap">
          <header class="lp-head">
            <span class="lp-eyebrow">Por que um site próprio</span>
            <h2>O imóvel bom não pode depender do feed.</h2>
            <p>
              A diferença entre estar na internet e ser encontrado na internet
              está em três coisas — e nenhuma delas é o site ser bonito.
            </p>
          </header>

          <div class="lp-contraste">
            <div class="lp-col ruim">
              <div class="lp-col-head">
                <span class="lp-col-ico ruim" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M18 6 6 18M6 6l12 12"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
                <div>
                  <h3>Como costuma ser</h3>
                  <p>Perfil na rede social e um site que ninguém atualiza</p>
                </div>
              </div>
              <ul>
                <li v-for="c in contraste.comum" :key="c.t">
                  <span class="lp-li-ico ruim" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M18 6 6 18M6 6l12 12"
                        stroke="currentColor"
                        stroke-width="2.6"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>
                  <span>
                    <strong>{{ c.t }}</strong>
                    <span>{{ c.d }}</span>
                  </span>
                </li>
              </ul>
            </div>

            <div class="lp-col bom">
              <div class="lp-col-head">
                <span class="lp-col-ico bom" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20 6 9 17l-5-5"
                      stroke="currentColor"
                      stroke-width="2.4"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <h3>Como é com a Moradi</h3>
                  <p>Catálogo, painel e página própria por imóvel</p>
                </div>
              </div>
              <ul>
                <li v-for="c in contraste.moradi" :key="c.t">
                  <span class="lp-li-ico bom" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M20 6 9 17l-5-5"
                        stroke="currentColor"
                        stroke-width="2.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </span>
                  <span>
                    <strong>{{ c.t }}</strong>
                    <span>{{ c.d }}</span>
                  </span>
                </li>
              </ul>
              <a class="lp-btn dark" :href="demoUrl" target="_blank" rel="noopener">
                Ver isso funcionando
              </a>
            </div>
          </div>
        </div>
      </section>

      <MoradiVitrine />

      <section id="recursos" class="lp-section">
        <div class="lp-wrap">
          <header class="lp-head">
            <span class="lp-eyebrow">O que vem pronto</span>
            <h2>Tudo que um corretor precisa</h2>
            <p>
              Sem plugin para instalar, sem módulo para contratar depois: o site
              já nasce com isto tudo.
            </p>
          </header>

          <div class="lp-grid">
            <div v-for="f in features" :key="f.t" class="lp-card">
              <span class="lp-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M20 6 9 17l-5-5"
                    stroke="currentColor"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <h3>{{ f.t }}</h3>
              <p>{{ f.d }}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="como" class="lp-section alt">
        <div class="lp-wrap">
          <header class="lp-head">
            <span class="lp-eyebrow">Como funciona</span>
            <h2>Três passos até o site no ar</h2>
          </header>

          <div class="lp-steps">
            <div v-for="s in steps" :key="s.n" class="lp-step">
              <span class="lp-num">{{ s.n }}</span>
              <h3>{{ s.t }}</h3>
              <p>{{ s.d }}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="duvidas" class="lp-section">
        <div class="lp-wrap lp-faq-wrap">
          <header class="lp-head">
            <span class="lp-eyebrow">Dúvidas frequentes</span>
            <h2>O que perguntam antes de fechar</h2>
          </header>

          <!-- <details> nativo em vez do acordeão em JS do template: abre sem
               hidratação, o Ctrl+F do navegador encontra texto fechado e o
               leitor de tela já sabe ler o estado. -->
          <div class="lp-faq">
            <details v-for="f in faq" :key="f.q" class="lp-faq-item">
              <summary>
                <span>{{ f.q }}</span>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m6 9 6 6 6-6"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </summary>
              <p>{{ f.a }}</p>
            </details>
          </div>
        </div>
      </section>

      <section class="lp-band">
        <div class="lp-wrap">
          <h2>Quer um site assim para a sua imobiliária?</h2>
          <p>
            Abra a demonstração para ver o produto ou fale no WhatsApp e receba
            uma proposta.
          </p>
          <div class="lp-actions center">
            <a class="lp-btn wa" :href="waLink" target="_blank" rel="noopener">
              <AppIcon name="wa" />
              <span>Falar no WhatsApp</span>
            </a>
            <a
              class="lp-btn band-ghost"
              :href="demoUrl"
              target="_blank"
              rel="noopener"
            >
              Ver demonstração
            </a>
          </div>
        </div>
      </section>
    </main>

    <footer class="lp-foot">
      <div class="lp-wrap lp-foot-in">
        <span class="lp-logo sm">moradi<span>.</span></span>
        <span>
          © {{ year }} Moradi · Desenvolvido por
          <a :href="waLink" target="_blank" rel="noopener">{{ builtByName }}</a>
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ============================================================
   Tokens da landing.
   Escopo local (.lp) e não :root: a landing tem paleta própria, azul, e o
   resto do app pinta por tenant (--brand injetado no SSR). Misturar os dois
   faria a cor do último cliente cadastrado vazar para cá.

   O azul é o da marca (#2563eb / #1d4ed8), no lugar do navy+teal do template.
   ============================================================ */
.lp {
  --lp-blue: #2563eb;
  --lp-blue-strong: #1d4ed8;
  --lp-blue-ink: #14306e;
  --lp-tint: #dbeafe;

  --lp-ink: #0f172a;
  --lp-ink-2: #334155;
  --lp-soft: #475569;
  --lp-line: #e2e8f0;

  --lp-paper: #ffffff;
  --lp-canvas: #f8fafc;
  --lp-canvas-2: #eff4ff;

  /* Verde do WhatsApp em duas versões: o vivo (#25d366) só pinta brilho e
     ponto piscante; o escuro pinta botão com texto branco, porque o vivo
     reprova em AA. Mesma decisão do --wa global em main.css. */
  --lp-wa: #0d7539;
  --lp-wa-vivid: #25d366;

  --lp-shadow:
    0 4px 20px -2px rgba(37, 99, 235, 0.07), 0 2px 6px -1px rgba(15, 23, 42, 0.04);
  --lp-shadow-hi:
    0 12px 32px -4px rgba(37, 99, 235, 0.14), 0 4px 12px -2px rgba(15, 23, 42, 0.06);

  background: var(--lp-canvas);
  color: var(--lp-ink);
  font-family: "Inter", system-ui, sans-serif;
}

.lp :where(h1, h2, h3) {
  font-family: "Plus Jakarta Sans", sans-serif;
  letter-spacing: -0.02em;
  color: var(--lp-ink);
  margin: 0;
}

.lp-wrap {
  width: min(1200px, 100% - 40px);
  margin: 0 auto;
}

/* A barra é sticky: sem isto o link "Sites no ar" para com o título do alvo
   escondido atrás dela. Mede a barra inteira (topo de confiança + linha do
   logo) mais um respiro. */
.lp :where(section[id]) {
  scroll-margin-top: 104px;
}

@media (max-width: 640px) {
  .lp-wrap {
    width: min(1200px, 100% - 32px);
  }
}

/* ---------- barra ---------- */
.lp-bar {
  position: sticky;
  top: 0;
  z-index: 50;
  background: color-mix(in srgb, var(--lp-paper) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--lp-line);
}

.lp-bar-top {
  background: var(--lp-canvas-2);
  border-bottom: 1px solid var(--lp-line);
  font-size: 12.5px;
  color: var(--lp-soft);
}

.lp-bar-top-in {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
}

.lp-trust {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.lp-trust-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--lp-blue);
}

.lp-trust-sep {
  color: var(--lp-line);
}

.lp-trust-wa {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--lp-wa);
  text-decoration: none;
}

.lp-trust-wa:hover {
  text-decoration: underline;
}

.lp-trust-wa :deep(svg) {
  width: 15px;
  height: 15px;
}

.lp-bar-in {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 68px;
}

.lp-logo {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-weight: 800;
  font-size: 22px;
  letter-spacing: -0.03em;
  color: var(--lp-ink);
  text-decoration: none;
}

.lp-logo span {
  color: var(--lp-blue);
}

.lp-logo.sm {
  font-size: 18px;
  color: var(--lp-paper);
}

.lp-nav {
  display: none;
  margin-left: auto;
  gap: 4px;
}

.lp-nav a {
  padding: 8px 12px;
  border-radius: 10px;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: var(--lp-soft);
  text-decoration: none;
  transition:
    background 0.2s,
    color 0.2s;
}

.lp-nav a:hover {
  background: var(--lp-canvas-2);
  color: var(--lp-ink);
}

@media (min-width: 1000px) {
  .lp-nav {
    display: flex;
  }
}

/* ---------- botões ---------- */
.lp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 15px 26px;
  border-radius: 999px;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    background 0.2s,
    border-color 0.2s;
}

.lp-btn :deep(svg),
.lp-btn > svg {
  width: 19px;
  height: 19px;
  flex: none;
}

.lp-btn.wa {
  background: var(--lp-wa);
  color: #fff;
  box-shadow: 0 10px 24px -8px color-mix(in srgb, var(--lp-wa-vivid) 70%, transparent);
}

.lp-btn.wa:hover {
  background: color-mix(in srgb, var(--lp-wa) 88%, black);
  transform: translateY(-2px);
  box-shadow: 0 14px 30px -8px color-mix(in srgb, var(--lp-wa-vivid) 80%, transparent);
}

.lp-btn.sm {
  margin-left: auto;
  padding: 10px 18px;
  font-size: 14px;
}

@media (min-width: 1000px) {
  .lp-btn.sm {
    margin-left: 0;
  }
}

.lp-btn.ghost {
  background: var(--lp-paper);
  color: var(--lp-ink);
  border: 1px solid var(--lp-line);
  box-shadow: var(--lp-shadow);
}

.lp-btn.ghost:hover {
  border-color: color-mix(in srgb, var(--lp-blue) 45%, white);
  color: var(--lp-blue-strong);
  transform: translateY(-2px);
}

.lp-btn.dark {
  margin-top: 22px;
  align-self: flex-start;
  background: var(--lp-blue);
  color: #fff;
}

.lp-btn.dark:hover {
  background: var(--lp-blue-strong);
  transform: translateY(-2px);
}

.lp-btn.band-ghost {
  background: transparent;
  color: #fff;
  border: 1px solid color-mix(in srgb, #fff 35%, transparent);
}

.lp-btn.band-ghost:hover {
  background: color-mix(in srgb, #fff 12%, transparent);
}

/* ---------- hero ---------- */
.lp-hero {
  position: relative;
  overflow: hidden;
  padding: 56px 0 72px;
}

.lp-glow {
  position: absolute;
  top: -180px;
  left: 50%;
  transform: translateX(-50%);
  width: 760px;
  height: 360px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lp-blue) 22%, transparent);
  filter: blur(130px);
  pointer-events: none;
}

.lp-hero-in {
  position: relative;
  display: grid;
  gap: 44px;
  align-items: center;
}

@media (min-width: 980px) {
  .lp-hero-in {
    grid-template-columns: 7fr 5fr;
    gap: 56px;
  }
}

.lp-badge {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 15px;
  border-radius: 999px;
  background: var(--lp-tint);
  color: var(--lp-blue-ink);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lp-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--lp-blue);
}

.lp-hero h1 {
  margin: 20px 0 0;
  font-size: clamp(34px, 5.4vw, 56px);
  font-weight: 800;
  line-height: 1.06;
  letter-spacing: -0.035em;
}

.lp-hero h1 em {
  font-style: normal;
  color: var(--lp-blue);
}

.lp-sub {
  margin: 18px 0 0;
  max-width: 34rem;
  font-size: 18px;
  line-height: 1.6;
  color: var(--lp-soft);
}

.lp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 28px;
}

.lp-actions.center {
  justify-content: center;
}

.lp-microcopy {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 16px 0 0;
  font-size: 13px;
  color: var(--lp-soft);
}

.lp-microcopy svg {
  width: 16px;
  height: 16px;
  flex: none;
  margin-top: 2px;
  color: var(--lp-blue);
}

.lp-selos {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 26px;
}

.lp-selo {
  padding: 9px 14px;
  border-radius: 12px;
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  box-shadow: var(--lp-shadow);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--lp-ink-2);
}

/* ---------- mockup do navegador ---------- */
.lp-shot {
  display: block;
  border-radius: 20px;
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  box-shadow: var(--lp-shadow-hi);
  overflow: hidden;
  text-decoration: none;
  transition:
    transform 0.25s,
    box-shadow 0.25s;
}

.lp-shot:hover {
  transform: translateY(-4px);
}

.lp-shot-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  background: var(--lp-canvas-2);
  border-bottom: 1px solid var(--lp-line);
}

.lp-shot-bar i {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--lp-line);
}

.lp-shot-url {
  margin-left: 10px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  font-size: 11.5px;
  color: var(--lp-soft);
}

.lp-shot-body {
  display: block;
  padding: 16px;
}

.lp-shot-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.lp-shot-logo {
  width: 74px;
  height: 12px;
  border-radius: 4px;
  background: var(--lp-blue);
  opacity: 0.85;
}

.lp-shot-pills {
  display: flex;
  gap: 6px;
}

.lp-shot-pills i {
  width: 34px;
  height: 9px;
  border-radius: 999px;
  background: var(--lp-line);
}

.lp-shot-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.lp-shot-card {
  display: block;
  padding: 9px;
  border-radius: 12px;
  border: 1px solid var(--lp-line);
  background: var(--lp-canvas);
}

.lp-shot-img {
  display: block;
  height: 68px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--lp-tint), #c7d9f7);
  margin-bottom: 9px;
}

.lp-shot-line {
  display: block;
  height: 8px;
  border-radius: 999px;
  background: var(--lp-line);
  margin-bottom: 6px;
}

.lp-shot-line.w70 {
  width: 70%;
}

.lp-shot-line.w40 {
  width: 40%;
}

.lp-shot-cap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-top: 1px solid var(--lp-line);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 14px;
  font-weight: 700;
  color: var(--lp-blue-strong);
}

.lp-shot-cap svg {
  width: 17px;
  height: 17px;
  transition: transform 0.2s;
}

.lp-shot:hover .lp-shot-cap svg {
  transform: translateX(3px);
}

/* ---------- faixa de âncora ---------- */
.lp-faixa {
  background: var(--lp-blue-ink);
  color: #fff;
  padding: 34px 0;
}

.lp-faixa-in {
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .lp-faixa-in {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 1000px) {
  .lp-faixa-in {
    grid-template-columns: repeat(4, 1fr);
    gap: 32px;
  }
}

.lp-faixa-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

@media (min-width: 1000px) {
  .lp-faixa-item + .lp-faixa-item {
    padding-left: 32px;
    border-left: 1px solid color-mix(in srgb, #fff 18%, transparent);
  }
}

.lp-faixa-t {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.015em;
}

.lp-faixa-d {
  font-size: 14px;
  color: color-mix(in srgb, #fff 78%, transparent);
}

/* ---------- seções ---------- */
.lp-section {
  padding: 80px 0;
}

.lp-section.alt {
  background: var(--lp-canvas-2);
  border-top: 1px solid var(--lp-line);
  border-bottom: 1px solid var(--lp-line);
}

.lp-head {
  max-width: 44rem;
  margin: 0 auto 48px;
  text-align: center;
}

.lp-head h2 {
  margin: 8px 0 12px;
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  line-height: 1.15;
}

.lp-head p {
  margin: 0;
  font-size: 17px;
  color: var(--lp-soft);
}

.lp-eyebrow {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lp-blue);
}

/* ---------- contraste ---------- */
.lp-contraste {
  display: grid;
  gap: 24px;
}

@media (min-width: 900px) {
  .lp-contraste {
    grid-template-columns: 1fr 1fr;
  }
}

.lp-col {
  display: flex;
  flex-direction: column;
  padding: 28px;
  border-radius: 20px;
  border: 1px solid var(--lp-line);
}

.lp-col.ruim {
  background: var(--lp-canvas-2);
}

.lp-col.bom {
  background: var(--lp-paper);
  box-shadow: var(--lp-shadow);
}

.lp-col-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}

.lp-col-head h3 {
  font-size: 20px;
  font-weight: 700;
}

.lp-col-head p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--lp-soft);
}

.lp-col-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  flex: none;
}

.lp-col-ico svg {
  width: 21px;
  height: 21px;
}

.lp-col-ico.ruim {
  background: #fee2e2;
  color: #b91c1c;
}

.lp-col-ico.bom {
  background: var(--lp-tint);
  color: var(--lp-blue-strong);
}

.lp-col ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 20px;
}

.lp-col li {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.lp-col li > span:last-child {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.lp-col li strong {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: var(--lp-ink);
}

.lp-col li span span {
  font-size: 14px;
  color: var(--lp-soft);
}

.lp-li-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  flex: none;
  margin-top: 2px;
}

.lp-li-ico svg {
  width: 14px;
  height: 14px;
}

.lp-li-ico.ruim {
  background: color-mix(in srgb, #b91c1c 10%, white);
  color: #b91c1c;
}

.lp-li-ico.bom {
  background: var(--lp-tint);
  color: var(--lp-blue-strong);
}

/* ---------- recursos ---------- */
.lp-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .lp-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 1000px) {
  .lp-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.lp-card {
  padding: 26px;
  border-radius: 18px;
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  box-shadow: var(--lp-shadow);
  transition:
    transform 0.2s,
    box-shadow 0.2s,
    border-color 0.2s;
}

.lp-card:hover {
  transform: translateY(-4px);
  border-color: color-mix(in srgb, var(--lp-blue) 30%, white);
  box-shadow: var(--lp-shadow-hi);
}

.lp-card h3 {
  margin: 16px 0 8px;
  font-size: 18px;
  font-weight: 700;
}

.lp-card p {
  margin: 0;
  font-size: 15px;
  color: var(--lp-soft);
}

.lp-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--lp-tint);
  color: var(--lp-blue-strong);
}

.lp-check svg {
  width: 21px;
  height: 21px;
}

/* ---------- passos ---------- */
.lp-steps {
  display: grid;
  gap: 20px;
  grid-template-columns: 1fr;
}

@media (min-width: 880px) {
  .lp-steps {
    grid-template-columns: repeat(3, 1fr);
  }
}

.lp-step {
  padding: 26px;
  border-radius: 18px;
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  box-shadow: var(--lp-shadow);
}

.lp-step h3 {
  margin: 14px 0 8px;
  font-size: 18px;
  font-weight: 700;
}

.lp-step p {
  margin: 0;
  font-size: 15px;
  color: var(--lp-soft);
}

.lp-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: var(--lp-blue);
  color: #fff;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-weight: 800;
}

/* ---------- faq ---------- */
.lp-faq-wrap {
  width: min(840px, 100% - 40px);
}

.lp-faq {
  display: grid;
  gap: 12px;
}

.lp-faq-item {
  border-radius: 16px;
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  box-shadow: var(--lp-shadow);
  padding: 4px 22px;
}

.lp-faq-item summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 0;
  cursor: pointer;
  list-style: none;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 17px;
  font-weight: 600;
  color: var(--lp-ink);
}

.lp-faq-item summary::-webkit-details-marker {
  display: none;
}

.lp-faq-item summary svg {
  width: 20px;
  height: 20px;
  flex: none;
  color: var(--lp-blue);
  transition: transform 0.25s;
}

.lp-faq-item[open] summary svg {
  transform: rotate(180deg);
}

.lp-faq-item p {
  margin: 0;
  padding: 0 0 20px;
  font-size: 15.5px;
  line-height: 1.65;
  color: var(--lp-soft);
}

/* ---------- banda final ---------- */
.lp-band {
  background: linear-gradient(140deg, var(--lp-blue-ink), var(--lp-blue-strong));
  color: #fff;
  padding: 72px 0;
  text-align: center;
}

.lp-band h2 {
  font-size: clamp(26px, 3.6vw, 38px);
  font-weight: 700;
  color: #fff;
}

.lp-band p {
  margin: 14px auto 0;
  max-width: 34rem;
  color: color-mix(in srgb, #fff 82%, transparent);
}

/* ---------- rodapé ---------- */
.lp-foot {
  background: var(--lp-ink);
  color: color-mix(in srgb, #fff 70%, transparent);
  padding: 28px 0;
  font-size: 14px;
}

.lp-foot-in {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.lp-foot a {
  color: #fff;
  text-decoration: none;
}

.lp-foot a:hover {
  text-decoration: underline;
}

/* No celular o topo de confiança não cabe: as três frases quebravam em duas
   linhas cada e empurravam o "Falar agora" para uma terceira. A barra vira só
   o atalho de contato, que é o que alguém no celular vai usar mesmo. */
@media (max-width: 560px) {
  .lp-trust,
  .hide-sm,
  .lp-trust-sep {
    display: none;
  }

  .lp-trust-wa {
    margin: 0 auto;
    white-space: nowrap;
  }
}
</style>

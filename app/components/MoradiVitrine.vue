<script setup lang="ts">
/**
 * Vitrine de sites no ar.
 *
 * Separada da landing porque é a única seção que muda por evento externo: a
 * cada modelo novo que sobe, entra um item aqui. Deixar isto embutido na
 * landing significaria reabrir um arquivo de 700 linhas para editar três
 * strings, e é onde um merge conflita.
 *
 * Os modelos são DADO, não markup: acrescentar vertical é acrescentar um
 * objeto na lista abaixo — nenhum `<div>` novo.
 */
const config = useRuntimeConfig();
const demoUrl = config.public.demoUrl || "https://demo.usemoradi.com.br";

type Link = {
  /** O que a pessoa vê. Sem `https://` e sem `www`: endereço é conteúdo aqui. */
  host: string;
  href: string;
  /** Por que vale clicar. "Demonstração" e "cliente real" provam coisas diferentes. */
  papel: string;
};

type Modelo = {
  vertical: string;
  titulo: string;
  descricao: string;
  destaques: string[];
  links: Link[];
};

const modelos: Modelo[] = [
  {
    vertical: "Imobiliário",
    titulo: "Moradi",
    descricao:
      "Catálogo de imóveis com busca, painel próprio para o corretor cadastrar e editar, e contato direto no WhatsApp a partir de cada imóvel.",
    destaques: [
      "Busca por tipo, bairro, preço e quartos",
      "Painel do corretor com upload de fotos",
      "Página própria por imóvel, pronta para o Google",
    ],
    links: [
      {
        host: "demo.usemoradi.com.br",
        href: demoUrl,
        papel: "Demonstração — pode clicar em tudo",
      },
      {
        host: "olmiimoveis.com.br",
        href: "https://olmiimoveis.com.br",
        papel: "Cliente real, no ar",
      },
    ],
  },
];
</script>

<template>
  <section id="modelos" class="lp-vitrine">
    <div class="lp-wrap">
      <header class="lp-head">
        <span class="lp-eyebrow">Veja funcionando</span>
        <h2>Os endereços abaixo são sites no ar.</h2>
        <p>
          Não é imagem de catálogo nem protótipo: são sites em produção, um de
          demonstração e um de cliente. Abra, navegue, teste no celular.
        </p>
      </header>

      <div class="lp-modelos">
        <article v-for="m in modelos" :key="m.titulo" class="lp-modelo">
          <div class="lp-modelo-top">
            <span class="lp-chip">{{ m.vertical }}</span>
            <span class="lp-status">
              <span class="lp-dot" aria-hidden="true" />
              No ar
            </span>
          </div>

          <h3>{{ m.titulo }}</h3>
          <p class="lp-modelo-desc">{{ m.descricao }}</p>

          <ul class="lp-destaques">
            <li v-for="d in m.destaques" :key="d">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="currentColor"
                  stroke-width="2.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              {{ d }}
            </li>
          </ul>

          <div class="lp-links">
            <a
              v-for="l in m.links"
              :key="l.host"
              class="lp-link"
              :href="l.href"
              target="_blank"
              rel="noopener"
            >
              <span class="lp-link-ico" aria-hidden="true">
                <AppIcon name="world" />
              </span>
              <span class="lp-link-txt">
                <span class="lp-link-host">{{ l.host }}</span>
                <span class="lp-link-papel">{{ l.papel }}</span>
              </span>
              <svg
                class="lp-link-seta"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M5 12h13m0 0-5-5m5 5-5 5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </a>
          </div>
        </article>

        <!-- Card de espera. Existe em vez de uma lista de verticais inventada:
             prometer "saúde, advocacia, educação" antes de ter o site no ar é a
             mesma promessa vazia que a seção inteira tenta desmentir. -->
        <article class="lp-modelo breve">
          <div class="lp-modelo-top">
            <span class="lp-chip ghost">Em produção</span>
          </div>
          <h3>Novos modelos a caminho</h3>
          <p class="lp-modelo-desc">
            Outros segmentos estão em finalização. Quando cada um entra no ar, o
            endereço aparece aqui do lado — com site de verdade para visitar,
            não com uma imagem.
          </p>
          <p class="lp-breve-nota">
            Precisa de um site para a sua área e não vê o modelo aqui? Fale com
            a gente: o primeiro site de cada segmento é feito junto com o
            cliente.
          </p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lp-vitrine {
  background: var(--lp-canvas-2);
  padding: 80px 0;
  border-top: 1px solid var(--lp-line);
  border-bottom: 1px solid var(--lp-line);
}

.lp-head {
  max-width: 44rem;
  margin: 0 auto 48px;
  text-align: center;
}

.lp-head h2 {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: var(--lp-ink);
  margin: 8px 0 12px;
}

.lp-head p {
  color: var(--lp-soft);
  font-size: 17px;
  margin: 0;
}

.lp-eyebrow {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--lp-blue);
}

.lp-modelos {
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr;
}

@media (min-width: 900px) {
  .lp-modelos {
    /* O modelo no ar pesa mais que o card de espera — 3:2 em vez de 1:1 para
       a vitrine não parecer meio vazia. */
    grid-template-columns: 3fr 2fr;
  }
}

.lp-modelo {
  background: var(--lp-paper);
  border: 1px solid var(--lp-line);
  border-radius: 20px;
  padding: 28px;
  box-shadow: var(--lp-shadow);
  display: flex;
  flex-direction: column;
}

.lp-modelo h3 {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--lp-ink);
  margin: 0 0 8px;
}

.lp-modelo-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.lp-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: var(--lp-tint);
  color: var(--lp-blue-ink);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 6px 12px;
}

.lp-chip.ghost {
  background: color-mix(in srgb, var(--lp-soft) 10%, white);
  color: var(--lp-soft);
}

.lp-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  color: var(--lp-wa);
}

.lp-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--lp-wa-vivid);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--lp-wa-vivid) 22%, transparent);
}

.lp-modelo-desc {
  color: var(--lp-soft);
  margin: 0 0 20px;
}

.lp-destaques {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: grid;
  gap: 10px;
}

.lp-destaques li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 15px;
  color: var(--lp-ink-2);
}

.lp-destaques svg {
  width: 18px;
  height: 18px;
  flex: none;
  margin-top: 3px;
  color: var(--lp-blue);
}

.lp-links {
  display: grid;
  gap: 12px;
  margin-top: auto;
}

.lp-link {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--lp-line);
  background: var(--lp-canvas);
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.2s,
    background 0.2s,
    transform 0.2s;
}

.lp-link:hover {
  border-color: color-mix(in srgb, var(--lp-blue) 45%, white);
  background: var(--lp-paper);
  transform: translateY(-2px);
}

.lp-link-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--lp-tint);
  color: var(--lp-blue-strong);
  flex: none;
}

.lp-link-ico :deep(svg) {
  width: 20px;
  height: 20px;
}

.lp-link-txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.lp-link-host {
  font-family: "Plus Jakarta Sans", sans-serif;
  font-weight: 700;
  font-size: 15px;
  color: var(--lp-ink);
  overflow-wrap: anywhere;
}

.lp-link-papel {
  font-size: 13px;
  color: var(--lp-soft);
}

.lp-link-seta {
  width: 20px;
  height: 20px;
  margin-left: auto;
  flex: none;
  color: var(--lp-blue);
  transition: transform 0.2s;
}

.lp-link:hover .lp-link-seta {
  transform: translateX(3px);
}

.lp-modelo.breve {
  background: transparent;
  border-style: dashed;
  box-shadow: none;
}

.lp-breve-nota {
  margin: auto 0 0;
  padding-top: 18px;
  border-top: 1px solid var(--lp-line);
  font-size: 14px;
  color: var(--lp-soft);
}
</style>

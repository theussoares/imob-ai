<script setup lang="ts">
/**
 * Chat de roteiro da landing: botão fechado no canto, balão de convite e um
 * painel com respostas prontas que terminam no WhatsApp, na demo ou numa seção
 * da página.
 *
 * Não é IA, e não finge ser: o avatar é a marca, não a foto de uma pessoa, e
 * não há "online agora" — quem responde de verdade está do outro lado do
 * WhatsApp. Por que roteiro e não LLM, e o que ficou de fora:
 * docs/superpowers/specs/2026-09-27-chat-roteiro-landing-design.md.
 *
 * Herda os tokens de `.lp` (MoradiLanding): renderizado fora dela, perde a cor.
 */
import { COTA_MENSAL_DESCRICAO } from "~~/shared/models/ai-generation";
import {
  NO_INICIAL,
  montarRoteiro,
  type AcaoRoteiro,
} from "~~/app/utils/moradi-roteiro";

const props = defineProps<{
  wa: (mensagem: string) => string;
  demoUrl: string;
}>();

const roteiro = montarRoteiro({
  wa: props.wa,
  demoUrl: props.demoUrl,
  cotaIa: COTA_MENSAL_DESCRICAO,
});

type Fala = { id: number; autor: "moradi" | "visitante"; texto: string };

const aberto = ref(false);
const falas = ref<Fala[]>([]);
const noAtual = ref(NO_INICIAL);
const digitando = ref(false);
const convite = ref<string | null>(null);

const botao = ref<HTMLButtonElement | null>(null);
const painel = ref<HTMLElement | null>(null);
const rolagem = ref<HTMLElement | null>(null);

const acoes = computed(() => (digitando.value ? [] : roteiro[noAtual.value]!.acoes));

let seq = 0;
function falar(autor: Fala["autor"], texto: string) {
  falas.value.push({ id: ++seq, autor, texto });
}

function semMovimento() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function rolarParaFim() {
  await nextTick();
  const el = rolagem.value;
  if (el) el.scrollTop = el.scrollHeight;
}

/**
 * O "digitando…" é curto e só existe para marcar que a resposta é nova: sem
 * ele, três balões aparecendo de uma vez parecem a mesma mensagem. Com
 * movimento reduzido, a resposta entra direto.
 */
let espera: ReturnType<typeof setTimeout> | undefined;
async function responder(no: string) {
  clearTimeout(espera);
  noAtual.value = no;
  if (!semMovimento()) {
    digitando.value = true;
    await rolarParaFim();
    await new Promise<void>((ok) => (espera = setTimeout(ok, 450)));
    digitando.value = false;
  }
  for (const t of roteiro[no]!.falas) falar("moradi", t);
  await rolarParaFim();
  focarPrimeiraAcao();
}

async function focarPrimeiraAcao() {
  await nextTick();
  painel.value?.querySelector<HTMLElement>(".acoes > *")?.focus({ preventScroll: true });
}

function abrir() {
  convite.value = null;
  aberto.value = true;
  if (!falas.value.length) {
    for (const t of roteiro[NO_INICIAL]!.falas) falar("moradi", t);
  }
  rolarParaFim();
  focarPrimeiraAcao();
}

function fechar() {
  aberto.value = false;
  nextTick(() => botao.value?.focus());
}

function escolher(a: AcaoRoteiro) {
  if (a.tipo === "no") {
    falar("visitante", a.rotulo);
    responder(a.para);
  } else if (a.tipo === "secao") {
    // O link é um <a href="#id"> de verdade: rola como os links do menu, com o
    // mesmo scroll-margin. Aqui só fecha o painel, que cobriria a seção.
    aberto.value = false;
  }
}

function aoTeclar(e: KeyboardEvent) {
  if (e.key === "Escape" && aberto.value) {
    e.stopPropagation();
    fechar();
  }
}

/**
 * Convite uma vez por visita: depois de 8 s, ou antes, se o visitante chegar
 * aos planos — ali a dúvida muda, e o texto muda junto (a Universal faz o
 * mesmo por página). Fechar não é lembrado entre visitas: isso pediria
 * localStorage ou cookie, e a política afirma que o site não grava cookie.
 */
const CONVITE_GERAL = "Dúvida sobre a Moradi? As respostas mais comuns estão aqui.";
const CONVITE_PLANOS = "Na dúvida entre os planos? Eu te ajudo a escolher.";

let jaConvidou = false;
let relogio: ReturnType<typeof setTimeout> | undefined;
let observador: IntersectionObserver | undefined;

function convidar(texto: string) {
  if (jaConvidou || aberto.value || falas.value.length) return;
  jaConvidou = true;
  convite.value = texto;
  clearTimeout(relogio);
  observador?.disconnect();
  // Some sozinho: no celular o balão fica em cima do preço do primeiro plano,
  // justo quando o convite de planos aparece. Quem quiser, ainda tem o botão.
  relogio = setTimeout(() => (convite.value = null), 12000);
}

onMounted(() => {
  relogio = setTimeout(() => convidar(CONVITE_GERAL), 8000);
  const planos = document.getElementById("planos");
  if (planos && "IntersectionObserver" in window) {
    // Margem, não `threshold`: no celular os três planos empilhados passam da
    // altura da tela, e uma fração mínima visível da seção nunca é atingida.
    // Assim dispara quando o topo da seção cruza o meio da tela, em qualquer
    // tamanho.
    observador = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && convidar(CONVITE_PLANOS),
      { rootMargin: "0px 0px -50% 0px" },
    );
    observador.observe(planos);
  }
});

onBeforeUnmount(() => {
  clearTimeout(relogio);
  clearTimeout(espera);
  observador?.disconnect();
});
</script>

<template>
  <div class="mchat" @keydown="aoTeclar">
    <div v-if="convite && !aberto" class="convite">
      <button type="button" class="convite-txt" @click="abrir">{{ convite }}</button>
      <button type="button" class="convite-x" aria-label="Fechar convite" @click="convite = null">
        <svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg>
      </button>
    </div>

    <section
      v-show="aberto"
      id="mchat-painel"
      ref="painel"
      class="painel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="mchat-titulo"
    >
      <header class="topo">
        <span class="avatar" aria-hidden="true">
          <svg viewBox="0 0 26 26"><path d="M13 2 24 10.5V23a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10.5Z" fill="#f4b400" /><path d="M8 24v-8.5a5 5 0 0 1 10 0V24" fill="none" stroke="#16181b" stroke-width="2.6" /></svg>
        </span>
        <div>
          <h2 id="mchat-titulo">Dúvidas sobre a Moradi</h2>
          <p>Respostas na hora · equipe no WhatsApp</p>
        </div>
        <button type="button" class="fechar" aria-label="Fechar dúvidas" @click="fechar">
          <svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg>
        </button>
      </header>

      <div ref="rolagem" class="conversa">
        <ol aria-live="polite" aria-relevant="additions">
          <li v-for="f in falas" :key="f.id" :class="f.autor">
            <span class="sr-only">{{ f.autor === "moradi" ? "Moradi:" : "Você:" }}</span>{{ f.texto }}
          </li>
        </ol>
        <p v-if="digitando" class="digitando" aria-hidden="true"><i /><i /><i /></p>
      </div>

      <div v-if="acoes.length" class="acoes" role="group" aria-label="Escolha um assunto">
        <template v-for="a in acoes" :key="a.rotulo">
          <button v-if="a.tipo === 'no'" type="button" @click="escolher(a)">{{ a.rotulo }}</button>
          <a v-else-if="a.tipo === 'secao'" :href="`#${a.id}`" @click="escolher(a)">{{ a.rotulo }}</a>
          <a v-else :href="a.href" :class="{ wa: a.whatsapp }" target="_blank" rel="noopener">
            <AppIcon v-if="a.whatsapp" name="wa" />{{ a.rotulo }}<span class="sr-only"> (abre em nova aba)</span>
          </a>
        </template>
      </div>
    </section>

    <button
      ref="botao"
      type="button"
      class="lancador"
      :aria-expanded="aberto"
      aria-controls="mchat-painel"
      :aria-label="aberto ? 'Fechar dúvidas' : 'Abrir dúvidas sobre a Moradi'"
      @click="aberto ? fechar() : abrir()"
    >
      <svg v-if="aberto" class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg>
      <svg v-else class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z" /><path d="M8 10h8M8 13h5" /></svg>
    </button>
  </div>
</template>

<style scoped>
/* Acima do menu fixo (z-index 20), e só ele: a landing não tem outro elemento
   fixo embaixo com que disputar o canto. */
.mchat {
  position: fixed;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  z-index: 40;
  display: grid;
  justify-items: end;
  gap: 12px;
  font-family: var(--body);
}

.sr-only {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}

.ic path { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.lancador {
  width: 56px; height: 56px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--ink); color: var(--ipe);
  box-shadow: var(--shadow-hi);
  cursor: pointer;
}
.lancador svg { width: 26px; height: 26px; }
.lancador:focus-visible, .painel :focus-visible, .convite :focus-visible {
  outline: 3px solid var(--ipe); outline-offset: 2px;
}

.convite {
  position: relative;
  max-width: min(300px, calc(100vw - 32px));
  background: #fff; color: var(--ink);
  border-radius: var(--r-md) var(--r-md) 6px var(--r-md);
  box-shadow: var(--shadow);
  border: 1px solid var(--line);
}
.convite-txt {
  display: block; width: 100%; text-align: left;
  padding: 14px 44px 14px 16px;
  font: 500 15px/1.45 var(--body); color: inherit; cursor: pointer;
}
.convite-x {
  position: absolute; top: 2px; right: 2px;
  width: 40px; height: 40px; display: grid; place-items: center;
  color: var(--muted); cursor: pointer; border-radius: 50%;
}
.convite-x:hover { color: var(--ink); }
.convite-x svg { width: 16px; height: 16px; }

.painel {
  width: min(380px, calc(100vw - 32px));
  max-height: min(600px, calc(100dvh - 104px));
  display: grid; grid-template-rows: auto 1fr auto;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-hi);
  overflow: hidden;
}

.topo {
  display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center;
  padding: 14px 8px 14px 16px;
  background: var(--night); color: #fff;
}
.avatar {
  width: 40px; height: 40px; border-radius: 50%;
  display: grid; place-items: center; background: #fff;
}
.avatar svg { width: 24px; height: 24px; }
.topo h2 { font: 700 16px/1.2 var(--display); margin: 0; }
.topo p { margin: 2px 0 0; font-size: 13px; color: rgba(255, 255, 255, 0.72); }
.fechar {
  width: 44px; height: 44px; display: grid; place-items: center;
  color: rgba(255, 255, 255, 0.8); border-radius: 50%; cursor: pointer;
}
.fechar:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
.fechar svg { width: 20px; height: 20px; }

.conversa { overflow-y: auto; overscroll-behavior: contain; padding: 16px; }
.conversa ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.conversa li {
  max-width: 88%; padding: 10px 14px;
  font-size: 15px; line-height: 1.5;
  border-radius: 16px;
}
.conversa li.moradi { justify-self: start; background: #fff; border: 1px solid var(--line); border-bottom-left-radius: 6px; }
.conversa li.visitante { justify-self: end; background: var(--ink); color: #fff; border-bottom-right-radius: 6px; }

.digitando {
  display: inline-flex; gap: 4px; margin: 8px 0 0; padding: 12px 14px;
  background: #fff; border: 1px solid var(--line); border-radius: 16px 16px 16px 6px;
}
.digitando i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: pisca 1s infinite ease-in-out; }
.digitando i:nth-child(2) { animation-delay: 0.15s; }
.digitando i:nth-child(3) { animation-delay: 0.3s; }
@keyframes pisca { 0%, 80%, 100% { opacity: 0.3; } 40% { opacity: 1; } }

.acoes {
  display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--line);
  background: var(--stone);
}
.acoes > * {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 44px; padding: 0 16px;
  border-radius: 999px;
  font: 600 14.5px/1.2 var(--body); text-align: left;
  color: var(--ink); background: #fff;
  box-shadow: inset 0 0 0 1.5px var(--ink);
  text-decoration: none; cursor: pointer;
  transition: background-color 0.15s;
}
.acoes > *:hover { background: var(--ipe-soft); }
.acoes > .wa { background: var(--ipe); box-shadow: none; }
.acoes > .wa:hover { background: #ffc21a; }
.acoes :deep(svg) { width: 18px; height: 18px; flex: none; }

@media (prefers-reduced-motion: no-preference) {
  .convite, .painel { animation: sobe 0.22s cubic-bezier(0.2, 0.8, 0.2, 1); transform-origin: bottom right; }
  .lancador { transition: transform 0.15s; }
  .lancador:active { transform: scale(0.94); }
}
@keyframes sobe { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
@media (prefers-reduced-motion: reduce) {
  .digitando i { animation: none; }
}
</style>

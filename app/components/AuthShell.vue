<script setup lang="ts">
/**
 * Moldura das telas de acesso: entrar, recuperar e definir senha, do painel
 * (`PainelAuthShell`) e da Área do Cliente (`PortalAuthShell`).
 *
 * Tela dividida — o que o produto oferece à esquerda, o formulário à direita.
 * A tela de login é também a primeira vez que a pessoa chega ao produto,
 * quase sempre por um convite: ela precisa entender PARA QUE vai criar uma
 * senha antes de criá-la. O cartão solto no meio da página, que era o layout
 * anterior, não dizia isso.
 *
 * Uma moldura só para as duas portas, e as duas com o amarelo e preto da
 * Moradi: é o mesmo produto. O que as separa é o conteúdo do lado esquerdo
 * (foto e recursos do painel; lista do que o inquilino encontra) e o rótulo
 * acima do título — a confusão entre as duas já custou um bug (ver o
 * comentário em definir-senha.vue).
 *
 * Os estilos de formulário (`.pa-*`) ficam aqui, sem `scoped` e sob `.pa`, para
 * as seis páginas não repetirem o mesmo bloco — foi a cópia divergente entre
 * elas que já deu tela de senha indistinguível.
 */
export interface RecursoAcesso {
  icone: string
  t: string
  d: string
}

defineProps<{
  /** "Painel" ou "Área do Cliente": aparece no topo do lado escuro. */
  marca: string
  recursos: readonly RecursoAcesso[]
  /** Foto de fundo do lado escuro. Sem ela, o lado é o preto liso. */
  foto?: { src: string; alt: string }
}>()

const tenant = useTenant()
const { name: builtByName, link: builtByLink } = useBuiltBy()
const year = new Date().getFullYear()
</script>

<template>
  <div class="pa moradi-tema">
    <aside class="pa-side" :class="{ 'com-foto': foto }" :aria-label="`O que você encontra em ${marca}`">
      <img v-if="foto" :src="foto.src" :alt="foto.alt" class="pa-foto" width="1200" height="800" fetchpriority="high">

      <div class="pa-side-brand">
        <svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true"><path d="M13 2 24 10.5V23a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10.5Z" fill="#f4b400" /><path d="M8 24v-8.5a5 5 0 0 1 10 0V24" fill="none" stroke="#16181b" stroke-width="2.6" /></svg>
        <span>{{ marca }}</span>
      </div>

      <div class="pa-side-body">
        <h2 class="pa-side-tit"><slot name="titulo" /></h2>
        <p class="pa-side-txt"><slot name="texto" /></p>

        <ul class="pa-recursos">
          <li v-for="r in recursos" :key="r.t">
            <span class="pa-recurso-ic"><AppIcon :name="r.icone" /></span>
            <span>
              <b>{{ r.t }}</b>
              <small>{{ r.d }}</small>
            </span>
          </li>
        </ul>
      </div>

      <p class="pa-side-foot">
        © {{ year }} {{ tenant?.name || 'Moradi' }} · Conexão protegida (HTTPS)
      </p>
    </aside>

    <main class="pa-main">
      <div class="pa-col">
        <!-- A imobiliária no topo do formulário: é o nome dela que a pessoa
             reconhece, e o que diz de QUAL imobiliária é este acesso. -->
        <div class="pa-tenant">
          <img v-if="tenant?.logoUrl" :src="tenant.logoUrl" :alt="tenant?.name || ''" class="pa-tenant-logo" >
          <b v-else class="pa-tenant-nome">{{ tenant?.name || 'Moradi' }}</b>
        </div>

        <slot />

        <p class="pa-credito">
          Desenvolvido pela
          <a v-if="builtByLink" :href="builtByLink" target="_blank" rel="noopener noreferrer">{{ builtByName }}</a>
          <b v-else>{{ builtByName }}</b>.
        </p>
        <slot name="depois" />
      </div>
    </main>
  </div>
</template>

<style>
.pa {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1fr);
  background: var(--paper);
}

/* ---------- lado escuro ---------- */
.pa-side {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 40px;
  padding: 36px 48px 28px;
  background:
    radial-gradient(120% 70% at 0% 100%, rgba(244, 180, 0, 0.16), transparent 60%),
    var(--night);
  color: #e9e7e1;
  overflow: hidden;
}
.pa-side-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
.pa-side-body {
  max-width: 460px;
}
.pa-side-tit {
  margin: 0;
  font-size: clamp(26px, 2.6vw, 34px);
  font-weight: 700;
  line-height: 1.12;
  color: #fff;
}
.pa-side-tit em {
  font-style: normal;
  color: var(--ipe);
}
.pa-side-txt {
  margin: 14px 0 0;
  font-size: 16px;
  line-height: 1.6;
  color: #bdbab2;
  max-width: 44ch;
}
.pa-recursos {
  list-style: none;
  margin: 30px 0 0;
  padding: 0;
  display: grid;
  gap: 16px;
}
.pa-recursos li {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.pa-recurso-ic {
  display: grid;
  place-items: center;
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: #24272b;
  border: 1px solid #34383d;
  color: var(--ipe);
  font-size: 19px;
}
.pa-recursos b {
  display: block;
  font-size: 15px;
  color: #fff;
}
.pa-recursos small {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: #a19e96;
}
.pa-side-foot {
  margin: 0;
  font-size: 12px;
  color: #8a877f;
}

/* ---------- variante com foto (painel) ----------
   A foto ocupa o lado inteiro e o texto fica embaixo, sobre um véu que escurece
   de baixo para cima: o título precisa de contraste AA em qualquer parte da
   foto, e um véu uniforme apagaria a foto inteira para garantir isso. */
.pa-side.com-foto {
  background: var(--night);
  justify-content: space-between;
}
.pa-foto {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 30%;
}
.pa-side.com-foto::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, rgba(22, 24, 27, 0.96) 0%, rgba(22, 24, 27, 0.82) 38%, rgba(22, 24, 27, 0.25) 70%, rgba(22, 24, 27, 0.45) 100%);
}
.pa-side.com-foto > :not(.pa-foto) {
  position: relative;
  z-index: 1;
}
.pa-side.com-foto .pa-side-body {
  margin-top: auto;
}
.pa-side.com-foto .pa-side-txt {
  color: #d3d0c8;
}
.pa-side.com-foto .pa-recursos {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.pa-side.com-foto .pa-recursos li {
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: 12px;
  background: rgba(22, 24, 27, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(6px);
}
.pa-side.com-foto .pa-recurso-ic {
  width: 34px;
  height: 34px;
  background: var(--ipe);
  border: 0;
  color: var(--ink);
}
.pa-side.com-foto .pa-side-foot {
  margin-top: 28px;
}
.pa-rotulo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  margin-bottom: 10px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--ipe-soft);
  color: #6b4e00;
  font-size: 12px;
  font-weight: 700;
}

/* ---------- formulário ---------- */
.pa-main {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 24px 28px;
}
.pa-col {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
}
.pa-tenant {
  display: grid;
  place-items: center;
  min-height: 84px;
  padding: 14px;
  margin-bottom: 30px;
  border: 1px dashed var(--line-2);
  border-radius: 14px;
  background: #fff;
}
.pa-tenant-logo {
  max-height: 56px;
  max-width: 220px;
  object-fit: contain;
}
.pa-tenant-nome {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 700;
  text-align: center;
}
.pa h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
}
.pa-sub {
  margin: 6px 0 24px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--muted);
}
.pa-lbl {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 700;
}
.pa-campo {
  position: relative;
  margin-bottom: 16px;
}
.pa-campo > .pa-campo-ic {
  position: absolute;
  left: 13px;
  top: 50%;
  translate: 0 -50%;
  color: var(--muted);
  font-size: 18px;
  pointer-events: none;
}
.pa-inp {
  width: 100%;
  height: 48px;
  padding: 0 14px 0 40px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: #fff;
  color: var(--ink);
  /* 16px evita o zoom automático do iOS ao focar o campo — o portal é usado
     majoritariamente no celular. */
  font-size: 16px;
  font-family: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pa-inp::placeholder {
  color: #8b8f94;
}
.pa-inp:focus {
  outline: none;
  border-color: var(--ink);
  box-shadow: 0 0 0 3px rgba(244, 180, 0, 0.45);
}
.pa-inp.com-olho {
  padding-right: 48px;
}
.pa-olho {
  position: absolute;
  right: 4px;
  top: 50%;
  translate: 0 -50%;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 19px;
  cursor: pointer;
}
.pa-olho:hover {
  color: var(--ink);
}
.pa-olho:focus-visible {
  outline: 2px solid var(--ink);
}
.pa-linha-direita {
  display: flex;
  justify-content: flex-end;
  margin: -4px 0 18px;
}
.pa-link {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--ipe);
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}
.pa-link:hover {
  text-decoration-color: var(--ink);
}
.pa-erro {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fdecec;
  color: #9f1c1c;
  font-size: 14px;
  line-height: 1.45;
}
.pa-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 50px;
  border: 0;
  border-radius: 10px;
  background: var(--ipe);
  color: var(--ink);
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 20px -10px rgba(180, 130, 0, 0.7);
  transition: background 0.15s ease, transform 0.15s ease;
}
.pa-btn:hover:not(:disabled) {
  background: var(--ipe-hover);
}
.pa-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.pa-btn:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
}
.pa-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.pa-btn .icon,
.pa-btn svg {
  font-size: 18px;
}
.pa-divisor {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 26px 0 14px;
  font-size: 13px;
  color: var(--muted);
}
.pa-divisor::before,
.pa-divisor::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--line);
}
.pa-caixa {
  padding: 16px 18px;
  border-radius: 12px;
  background: #f3f2ed;
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
  color: var(--ink-2);
}
.pa-caixa p {
  margin: 0 0 8px;
}
.pa-caixa.destaque {
  background: var(--ipe-soft);
  text-align: left;
  color: var(--ink);
}
.pa-voltar {
  margin-top: 18px;
  text-align: center;
}
.pa-credito {
  margin: 32px 0 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}
.pa-credito b,
.pa-credito a {
  font-weight: 700;
  color: var(--ink);
}
.pa-credito a {
  text-decoration: underline;
  text-decoration-color: var(--ipe);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
}

/* No celular o formulário vem primeiro: quem abre o convite no WhatsApp veio
   entrar, e rolar por um painel de benefícios até achar o campo de e-mail é o
   atrito que a tela dividida não pode criar. O painel escuro vira uma faixa
   curta no topo, só com a marca. */
@media (max-width: 880px) {
  .pa {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .pa-side {
    padding: 14px 18px;
    gap: 0;
    box-shadow: inset 0 -3px 0 var(--ipe);
  }
  .pa-side-body,
  .pa-side-foot,
  .pa-foto,
  .pa-side.com-foto::after {
    display: none;
  }
  .pa-main {
    align-items: flex-start;
    padding: 24px 18px 24px;
  }
  .pa-tenant {
    min-height: 68px;
    margin-bottom: 22px;
  }
  .pa h1 {
    font-size: 24px;
  }
}
</style>

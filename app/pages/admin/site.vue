<script setup lang="ts">
import { STATIC_FOOTER_PAGES } from "~~/shared/utils/footer-pages";
import {
  FOOTER_LINKS_MAX,
  isSafeFooterHref,
} from "~~/shared/utils/footer-links";
import type { Tenant } from "~~/shared/models/tenant";
definePageMeta({ layout: "admin", middleware: "admin" });

// Tela do dia a dia: o que a cliente edita e aparece pro visitante.
// O que é setup técnico (identidade, cores, SEO, portais) mora em /admin/config —
// misturar os dois fazia ela rolar por seletor de cor e URL de feed XML só pra
// trocar o texto do hero.
const {
  tenant,
  form,
  saving,
  saved,
  error,
  save: persist,
} = useTenantSettings([
  "logoUrl",
  "faviconUrl",
  "heroTitle",
  "heroSubtitle",
  "heroImage",
  "heroImagePosition",
  "heroCtaLabel",
  "heroCtaHref",
  "whatsapp",
  "phone",
  "email",
  "city",
  "state",
  "footerText",
  "footerLinks",
  "footerPages",
  // Vieram de "Configurações": alimentam o sameAs do JSON-LD, mas o que a pessoa
  // vê é o ícone no rodapé — que se configura nesta tela. O campo mora onde a
  // consequência aparece.
  "instagram",
]);

// ---- Páginas do site no rodapé ----
// A lista vem do código; o cliente só ajusta rótulo e visibilidade. Assim ele
// descobre que a página existe — nunca a digitaria — e não há caminho quebrado.
const sitePages = STATIC_FOOTER_PAGES;
function pageOverride(path: string) {
  const atual = form.footerPages ?? {};
  if (!atual[path]) form.footerPages = { ...atual, [path]: {} };
  return form.footerPages![path]!;
}
function pageVisible(path: string) {
  return form.footerPages?.[path]?.visible !== false;
}
function setPageVisible(path: string, on: boolean) {
  pageOverride(path).visible = on;
  form.footerPages = { ...form.footerPages };
}
function setPageLabel(path: string, label: string) {
  pageOverride(path).label = label;
  form.footerPages = { ...form.footerPages };
}

// ---- Rodapé ----
const FOOTER_LINKS_MAX_UI = FOOTER_LINKS_MAX;
function addLink() {
  if ((form.footerLinks?.length ?? 0) >= FOOTER_LINKS_MAX_UI) return;
  form.footerLinks = [...(form.footerLinks ?? []), { label: "", href: "" }];
}
function removeLink(i: number) {
  form.footerLinks = (form.footerLinks ?? []).filter((_, n) => n !== i);
}
/** Setas em vez de arrastar: com até 8 itens resolve por uma fração do código. */
function moveLink(i: number, delta: number) {
  const arr = [...(form.footerLinks ?? [])];
  const j = i + delta;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  form.footerLinks = arr;
}
/** Avisa na tela o que o servidor descartaria em silêncio ao salvar. */
function linkProblem(l: { label: string; href: string }): string {
  if (!l.label.trim() && !l.href.trim()) return "";
  if (!l.label.trim()) return "Falta o texto do link.";
  if (!l.href.trim()) return "Falta o endereço.";
  if (!isSafeFooterHref(l.href))
    return "Endereço inválido. Use /pagina, https://..., mailto: ou tel:";
  return "";
}

// Campos exibem +55 (67) 99123-4567; o model guarda os dígitos com DDI.
const {
  display: whatsappDisplay,
  onInput: onWhatsappInput,
  isValid: whatsappValid,
} = usePhoneInput(toRef(form, "whatsapp"), "whatsapp");
const {
  display: phoneDisplay,
  onInput: onPhoneInput,
  isValid: phoneValid,
} = usePhoneInput(toRef(form, "phone"), "whatsapp");

const { uploading: uploadingLogo, onFile: onLogo } = useBrandUpload({
  bucket: "tenant-logos",
  prefix: "logo",
  maxEdge: 256, // logo aparece a ~36px; 256 sobra
  onDone: (url) => (form.logoUrl = url),
});
const { uploading: uploadingFavicon, onFile: onFavicon } = useBrandUpload({
  bucket: "tenant-logos",
  prefix: "favicon",
  maxEdge: 256, // favicon renderiza a 16-32px; 256 cobre telas retina e atalhos
  onDone: (url) => (form.faviconUrl = url),
});
const { uploading: uploadingHeroImage, onFile: onHeroImage } = useBrandUpload({
  bucket: "tenant-hero",
  prefix: "hero",
  maxEdge: IMAGE_SIZE_LG, // hero é full-bleed
  onDone: (url) => (form.heroImage = url),
});

// Preview ao vivo — reaproveita o componente público, alimentado pelo form em
// edição (não pelo tenant salvo).
const previewTenant = computed<Tenant | null>(() =>
  tenant.value
    ? {
        ...tenant.value,
        heroTitle: form.heroTitle || null,
        heroSubtitle: form.heroSubtitle || null,
        heroImage: form.heroImage || null,
        heroImagePosition: form.heroImagePosition || "right",
        heroCtaLabel: form.heroCtaLabel || null,
        heroCtaHref: form.heroCtaHref || null,
      }
    : null,
);

const save = () =>
  persist(() =>
    !whatsappValid.value || !phoneValid.value
      ? "Confira os números de contato (com DDD)."
      : null,
  );

useHead({ title: "Meu site · Painel" });
</script>

<template>
  <div>
    <h1>Meu site</h1>
    <p style="color: var(--ink-soft); margin-bottom: 18px">
      O que aparece para quem visita o site. As mudanças entram no ar assim que
      você salvar.
    </p>

    <form class="admin-card" @submit.prevent="save">
      <h3 class="section-t">Logo</h3>
      <div class="logo-row">
        <div class="logo-preview">
          <img v-if="form.logoUrl" :src="form.logoUrl" alt="Logo" />
          <AppIcon v-else name="home" />
        </div>
        <label class="admin-btn ghost file-btn">
          {{ uploadingLogo ? "Enviando..." : "Enviar logo" }}
          <input type="file" accept="image/*" hidden @change="onLogo" />
        </label>
        <button
          v-if="form.logoUrl"
          type="button"
          class="admin-btn ghost"
          @click="form.logoUrl = ''"
        >
          Remover
        </button>
      </div>

      <h3 class="section-t">
        Ícone do site <span class="section-hint">(favicon, quadrado)</span>
      </h3>
      <p class="fav-help">
        Aparece na aba do navegador, a 16px. Use uma marca quadrada — a logo
        horizontal fica ilegível nesse tamanho. Sem ícone, geramos um com a
        inicial do nome sobre a cor da marca.
      </p>
      <div class="logo-row">
        <div class="logo-preview fav-preview">
          <img v-if="form.faviconUrl" :src="form.faviconUrl" alt="Ícone do site" />
          <AppIcon v-else name="home" />
        </div>
        <label class="admin-btn ghost file-btn">
          {{ uploadingFavicon ? "Enviando..." : "Enviar ícone" }}
          <input type="file" accept="image/*" hidden @change="onFavicon" />
        </label>
        <button
          v-if="form.faviconUrl"
          type="button"
          class="admin-btn ghost"
          @click="form.faviconUrl = ''"
        >
          Remover
        </button>
      </div>

      <h3 class="section-t">Hero (topo da home)</h3>
      <div>
        <label class="admin-label">Título principal</label>
        <input v-model="form.heroTitle" class="admin-input" />
      </div>
      <div style="margin-top: 12px">
        <label class="admin-label">Subtítulo</label>
        <textarea v-model="form.heroSubtitle" class="admin-textarea" rows="2" />
      </div>

      <div class="form-grid" style="margin-top: 14px">
        <div>
          <label class="admin-label"
            >Foto (institucional, da equipe, de um imóvel...)</label
          >
          <div class="logo-row">
            <div class="hero-img-preview">
              <img
                v-if="form.heroImage"
                :src="form.heroImage"
                alt="Foto do hero"
              />
              <AppIcon v-else name="home" />
            </div>
            <label class="admin-btn ghost file-btn">
              {{ uploadingHeroImage ? "Enviando..." : "Enviar foto" }}
              <input
                type="file"
                accept="image/*"
                hidden
                @change="onHeroImage"
              />
            </label>
            <button
              v-if="form.heroImage"
              type="button"
              class="admin-btn ghost"
              @click="form.heroImage = ''"
            >
              Remover
            </button>
          </div>
          <p class="hint-text">
            Sem foto, o hero aparece só com texto (como hoje). Com foto, vira um
            layout dividido — recomendado: retrato ou quadrada, mínimo
            800×1000px.
          </p>
        </div>
        <div v-if="form.heroImage">
          <label class="admin-label">Posição da foto</label>
          <div
            class="pos-toggle"
            role="radiogroup"
            aria-label="Posição da foto no hero"
          >
            <button
              type="button"
              class="pos-btn"
              :class="{ on: form.heroImagePosition === 'right' }"
              @click="form.heroImagePosition = 'right'"
            >
              <span class="pos-mock"
                ><span class="pos-text" /><span class="pos-img"
              /></span>
              Foto à direita
            </button>
            <button
              type="button"
              class="pos-btn"
              :class="{ on: form.heroImagePosition === 'left' }"
              @click="form.heroImagePosition = 'left'"
            >
              <span class="pos-mock"
                ><span class="pos-img" /><span class="pos-text"
              /></span>
              Foto à esquerda
            </button>
            <button
              type="button"
              class="pos-btn"
              :class="{ on: form.heroImagePosition === 'background' }"
              @click="form.heroImagePosition = 'background'"
            >
              <span class="pos-mock pos-mock-bg"
                ><span class="pos-text"
              /></span>
              Foto de fundo
            </button>
          </div>
        </div>
      </div>

      <div class="form-grid" style="margin-top: 14px">
        <div>
          <label class="admin-label">Botão do hero — texto (opcional)</label>
          <input
            v-model="form.heroCtaLabel"
            class="admin-input"
            placeholder="Ex.: Conheça nossa história"
          />
        </div>
        <div>
          <label class="admin-label">Botão do hero — link (opcional)</label>
          <input
            v-model="form.heroCtaHref"
            class="admin-input"
            placeholder="/sobre ou https://..."
          />
        </div>
      </div>
      <p class="hint-text">
        O botão só aparece se texto e link estiverem preenchidos.
      </p>

      <div class="hero-preview-wrap">
        <span class="hero-preview-label">Pré-visualização</span>
        <div class="hero-preview-box">
          <Hero :tenant="previewTenant" />
        </div>
      </div>

      <h3 class="section-t">Contato</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">WhatsApp</label>
          <input
            :value="whatsappDisplay"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="+55 (67) 99123-4567"
            @input="onWhatsappInput"
          />
          <p v-if="!whatsappValid" class="field-err">
            Número inválido (com DDD).
          </p>
        </div>
        <div>
          <label class="admin-label">Telefone</label>
          <input
            :value="phoneDisplay"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="+55 (67) 3521-1234"
            @input="onPhoneInput"
          />
          <p v-if="!phoneValid" class="field-err">Número inválido (com DDD).</p>
        </div>
        <div>
          <label class="admin-label">E-mail</label>
          <input v-model="form.email" class="admin-input" type="email" />
        </div>
        <div>
          <label class="admin-label">Cidade</label>
          <input v-model="form.city" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">UF</label>
          <input v-model="form.state" class="admin-input" maxlength="2" />
        </div>
      </div>

      <h2 class="section-t">Rodapé</h2>
      <div>
        <label class="admin-label">Texto do rodapé</label>
        <textarea
          v-model="form.footerText"
          class="admin-textarea"
          rows="2"
          :placeholder="`Atendimento personalizado para compra, venda e locação de imóveis em ${form.city || 'sua cidade'} e região.`"
        />
        <p class="hint">
          Deixe em branco para usar o texto acima. Vale escrever o seu: o padrão
          é igual em todos os sites que fazemos.
        </p>
      </div>

      <div class="form-grid">
        <div>
          <label class="admin-label">Instagram</label>
          <input
            v-model="form.instagram"
            class="admin-input"
            placeholder="https://instagram.com/seuperfil"
          />
        </div>
      </div>
      <p class="hint">
        Preenchidos, aparecem como ícone no rodapé. Vazios, não aparecem.
      </p>

      <label class="admin-label fp-sep">Páginas do seu site</label>
      <p class="hint">
        Escolha quais aparecem no rodapé e com que nome. A lista cresce sozinha
        quando novas páginas ficam disponíveis.
      </p>
      <div v-for="p in sitePages" :key="p.path" class="fp-row">
        <input
          class="admin-input"
          :value="form.footerPages?.[p.path]?.label ?? ''"
          :placeholder="p.label"
          @input="
            setPageLabel(p.path, ($event.target as HTMLInputElement).value)
          "
        />
        <code class="fp-path">{{ p.path }}</code>
        <label class="fp-toggle">
          <input
            type="checkbox"
            :checked="pageVisible(p.path)"
            @change="
              setPageVisible(
                p.path,
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          <span>Mostrar</span>
        </label>
      </div>

      <div class="fl-head">
        <label class="admin-label">Outros links</label>
        <button
          type="button"
          class="admin-btn ghost sm"
          :disabled="(form.footerLinks?.length ?? 0) >= FOOTER_LINKS_MAX_UI"
          @click="addLink"
        >
          + Adicionar link
        </button>
      </div>
      <p class="hint">
        Endereços que não são páginas do seu site. Seu Instagram e seu site já
        aparecem sozinhos — não precisa repetir aqui.
      </p>

      <div v-for="(l, i) in form.footerLinks ?? []" :key="i" class="fl-row">
        <input
          v-model="l.label"
          class="admin-input"
          placeholder="Texto (ex.: Política de privacidade)"
        />
        <input
          v-model="l.href"
          class="admin-input"
          placeholder="/privacidade ou https://..."
        />
        <div class="fl-actions">
          <button
            type="button"
            class="admin-btn ghost sm"
            :disabled="i === 0"
            @click="moveLink(i, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="admin-btn ghost sm"
            :disabled="i === (form.footerLinks?.length ?? 0) - 1"
            @click="moveLink(i, 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="admin-btn danger sm"
            @click="removeLink(i)"
          >
            Remover
          </button>
        </div>
        <p v-if="linkProblem(l)" class="fl-err">{{ linkProblem(l) }}</p>
      </div>

      <p v-if="error" style="color: #b91c1c; margin-top: 14px">{{ error }}</p>
      <p
        v-if="saved"
        style="color: var(--wa-dark); margin-top: 14px; font-weight: 600"
      >
        Salvo! ✅
      </p>

      <div style="margin-top: 18px">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : "Salvar" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.fp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  margin-top: 8px;
}
.fp-sep {
  display: block;
  margin-top: 20px;
}
.fp-path {
  font-size: 12.5px;
  color: var(--ink-soft);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 4px 8px;
}
.fp-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  white-space: nowrap;
}
@media (max-width: 700px) {
  .fp-row {
    grid-template-columns: 1fr;
    align-items: start;
  }
}

.fl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
}
.fl-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) auto;
  gap: 8px;
  align-items: start;
  margin-top: 8px;
}
.fl-actions {
  display: flex;
  gap: 4px;
}
.fl-err {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 12.5px;
  color: #b91c1c;
}
@media (max-width: 700px) {
  .fl-row {
    grid-template-columns: 1fr;
  }
}

.field-err {
  color: #b91c1c;
  font-size: 12.5px;
  margin: 4px 0 0;
}
.section-t {
  font-family: "Space Grotesk", sans-serif;
  font-size: 15px;
  margin: 22px 0 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
/* Complemento do título, em peso e cor menores — "(favicon, quadrado)". */
.section-hint {
  font-family: "Inter", sans-serif;
  font-weight: 500;
  font-size: 12.5px;
  color: var(--ink-soft);
}
/* A explicação de por que a logo horizontal não serve aqui. */
.fav-help {
  font-size: 13px;
  color: var(--ink-soft);
  margin: -4px 0 12px;
  max-width: 52ch;
}
/* Quadrado, ao contrário do preview da logo: é o formato que o ícone precisa ter. */
.fav-preview {
  aspect-ratio: 1;
  width: 56px;
}
.section-t:first-of-type {
  border-top: none;
  padding-top: 0;
  margin-top: 4px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 520px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.color-swatch {
  width: 46px;
  height: 44px;
  border: 1.5px solid var(--line-2);
  border-radius: 10px;
  padding: 2px;
  background: none;
  cursor: pointer;
}
.preview-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 22px;
}
.logo-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.logo-preview {
  width: 80px;
  height: 80px;
  border-radius: 4px;
  color: #fff;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.logo-preview :deep(svg) {
  width: 30px;
  height: 30px;
}
.file-btn {
  cursor: pointer;
}
.hero-img-preview {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: var(--surface);
  border: 1.5px solid var(--line-2);
  color: var(--ink-soft);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.hero-img-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-img-preview :deep(svg) {
  width: 26px;
  height: 26px;
}
.hint-text {
  font-size: 12.5px;
  color: var(--ink-soft);
  margin: 6px 0 0;
}
.feed-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.feed-url {
  flex: 1;
  min-width: 220px;
  padding: 11px 14px;
  border: 1.5px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface);
  color: var(--brand);
  font-size: 13.5px;
  word-break: break-all;
  text-decoration: none;
}
.pos-toggle {
  display: flex;
  gap: 8px;
}
.pos-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1.5px solid var(--line-2);
  border-radius: 10px;
  background: var(--paper);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}
.pos-btn.on {
  border-color: var(--brand);
  color: var(--ink);
  background: var(--brand-ghost);
}
.pos-mock {
  display: flex;
  gap: 3px;
  width: 100%;
  height: 26px;
}
.pos-mock .pos-text,
.pos-mock .pos-img {
  flex: 1;
  border-radius: 4px;
  background: var(--line-2);
}
.pos-btn.on .pos-img {
  background: var(--brand);
}
.pos-mock-bg {
  position: relative;
  background: var(--ink);
}
.pos-mock-bg .pos-text {
  position: absolute;
  inset: 6px 40% 6px 6px;
  background: rgba(255, 255, 255, 0.55);
}
.pos-btn.on .pos-mock-bg {
  background: var(--brand);
}
.hero-preview-wrap {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px dashed var(--line-2);
}
.hero-preview-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.hero-preview-box {
  border: 1.5px solid var(--line-2);
  border-radius: 14px;
  overflow: hidden;
  background: var(--surface);
}
@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>

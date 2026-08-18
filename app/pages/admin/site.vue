<script setup lang="ts">
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
]);

// Campos exibem +55 (67) 99217-1768; o model guarda os dígitos com DDI.
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
            placeholder="+55 (67) 99217-1768"
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


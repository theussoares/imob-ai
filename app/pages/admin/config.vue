<script setup lang="ts">
definePageMeta({ layout: "admin", middleware: "admin" });

// Setup e ajustes técnicos: mexe-se uma vez, no onboarding. O que a cliente
// edita no dia a dia (hero, contato, logo) fica em /admin/site.
const { form, alternateNamesText, saving, saved, error, save } =
  useTenantSettings([
    "name",
    "tagline",
    "creci",
    "brandPrimary",
    "brandAccent",
    "alternateNames",
  ]);

// Preview ao vivo das cores
watch(
  () => [form.brandPrimary, form.brandAccent],
  ([b, a]) => {
    if (import.meta.client) {
      document.documentElement.style.setProperty("--brand", b || "#0f3d38");
      document.documentElement.style.setProperty("--accent", a || "#c2410c");
    }
  },
);

// URL do feed para os portais. Deriva do domínio público: no host de painel
// (painel.<dominio>) remove o prefixo para apontar ao site, não ao admin.
const feedUrl = ref("");
const feedCopied = ref(false);
onMounted(() => {
  const host = window.location.host.replace(/^(painel|admin)\./, "");
  feedUrl.value = `${window.location.protocol}//${host}/feed/imoveis.xml`;
});
async function copyFeed() {
  try {
    await navigator.clipboard.writeText(feedUrl.value);
    feedCopied.value = true;
    setTimeout(() => (feedCopied.value = false), 2000);
  } catch {
    /* clipboard indisponível: o usuário copia manualmente do link */
  }
}

useHead({ title: "Configurações · Painel" });
</script>

<template>
  <div>
    <h1>Configurações</h1>
    <p style="color: var(--ink-soft); margin-bottom: 18px">
      Identidade, marca e integrações. Normalmente se ajusta uma vez — o que
      você edita com frequência está em
      <NuxtLink to="/admin/site" style="color: var(--brand); font-weight: 600"
        >Meu site</NuxtLink
      >.
    </p>

    <form class="admin-card" @submit.prevent="save()">
      <h3 class="section-t">Identidade</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Nome da imobiliária / corretor</label>
          <input v-model="form.name" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Tagline (subtítulo do topo)</label>
          <input v-model="form.tagline" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">CRECI</label>
          <input v-model="form.creci" class="admin-input" />
        </div>
      </div>

      <h3 class="section-t">Cores da marca</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Cor principal</label>
          <div class="color-row">
            <input
              v-model="form.brandPrimary"
              type="color"
              class="color-swatch"
            />
            <input v-model="form.brandPrimary" class="admin-input" />
          </div>
        </div>
        <div>
          <label class="admin-label">Cor de destaque (locação)</label>
          <div class="color-row">
            <input
              v-model="form.brandAccent"
              type="color"
              class="color-swatch"
            />
            <input v-model="form.brandAccent" class="admin-input" />
          </div>
        </div>
        <div class="preview-box">
          <span class="badge">Venda</span>
          <span class="badge rent">Aluguel</span>
          <span class="admin-btn" style="pointer-events: none">Botão</span>
        </div>
      </div>

      <!-- Instagram e site saíram daqui para "Meu site", junto do rodapé onde
           aparecem. Estavam nesta tela por raciocínio de implementação (alimentam
           o sameAs do JSON-LD), não pelo que a pessoa vê. -->
      <h3 class="section-t">Como te encontram no Google</h3>
      <p style="color: var(--ink-soft); font-size: 13px; margin: -4px 0 12px">
        Ajuda o Google a ligar buscas pelo seu nome ao seu site.
      </p>
      <div>
        <label class="admin-label"
          >Nomes alternativos / como te buscam (um por linha)</label
        >
        <textarea
          v-model="alternateNamesText"
          class="admin-textarea"
          rows="3"
          placeholder="TP Imobiliária&#10;Imóveis Pacheco&#10;Tatiane Imóveis"
        />
      </div>

      <h3 class="section-t">Integrações · Portais (ZAP, VivaReal, OLX)</h3>
      <p style="color: var(--ink-soft); font-size: 13px; margin: -4px 0 12px">
        Cole o link abaixo no seu painel do Canal Pro (Grupo OLX / ZAP). Os
        imóveis publicados aqui aparecem e se atualizam sozinhos nos portais.
      </p>
      <div class="feed-row">
        <a class="feed-url" :href="feedUrl" target="_blank" rel="noopener">{{
          feedUrl
        }}</a>
        <button type="button" class="admin-btn ghost" @click="copyFeed">
          {{ feedCopied ? "Copiado! ✅" : "Copiar link" }}
        </button>
      </div>
      <p class="hint-text">
        Só entram no feed os imóveis com status <strong>Publicado</strong>. O
        portal cobra o plano de anúncios à parte — a integração em si não tem
        custo.
      </p>

      <p v-if="error" style="color: #b91c1c; margin-top: 14px">{{ error }}</p>
      <p
        v-if="saved"
        style="color: var(--wa-dark); margin-top: 14px; font-weight: 600"
      >
        Configurações salvas! ✅
      </p>

      <div style="margin-top: 18px">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : "Salvar configurações" }}
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

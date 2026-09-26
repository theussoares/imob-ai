<script setup lang="ts">
import { avisoDeContraste } from "~~/shared/utils/contrast";
import { AI_TONES, AI_TONE_LABELS, type AiTone } from "~~/shared/models/ai-tone";

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
    "whatsappButtonColor",
    "alternateNames",
    "portalEnabled",
  ]);

const { areaCliente, descricaoIa, carregar } = useAdminFeatures();
onMounted(carregar);

/*
 * Widget do tom de IA, independente de `useTenantSettings`.
 *
 * `useTenantSettings` inicializa o formulário a partir de `useTenant()` — o
 * payload PÚBLICO de `/api/tenant` — e o tom foi deliberadamente mantido fora
 * dele (ver shared/models/tenant.ts e server/repositories/tenant.repository.ts).
 * Declarar `aiTone` naquele formulário faria ele nascer sempre `'sobrio'`, e
 * salvar QUALQUER seção desta tela sobrescreveria o tom escolhido pela
 * imobiliária com o default, em silêncio. Por isso este widget lê e grava por
 * um caminho próprio (`/api/admin/ai-tone` e um PUT parcial com só `aiTone`),
 * sem passar pelo `form` nem pelo `save()` de cima.
 */
// `null`, não `'sobrio'`: um default aqui seria indistinguível de um tom
// carregado com sucesso — ver o `catch` de `carregarAiTone` abaixo, que é onde
// isso realmente importa.
const aiTone = ref<AiTone | null>(null);
const aiToneLoading = ref(true);
const aiToneLoadError = ref(false);
const aiToneSaving = ref(false);
const aiToneSaved = ref(false);
const aiToneError = ref("");

async function carregarAiTone() {
  aiToneLoading.value = true;
  aiToneLoadError.value = false;
  try {
    const resposta = await adminFetch<{ aiTone: AiTone }>("/api/admin/ai-tone");
    aiTone.value = resposta.aiTone;
  } catch {
    // NÃO cair num default. A alternativa óbvia — deixar `aiTone` em 'sobrio'
    // e seguir — foi o Critical do round 1: o select mostraria "Sóbrio" como
    // se fosse o valor carregado, indistinguível do caso de sucesso, e
    // "Salvar tom" gravaria esse default por cima do tom real da imobiliária
    // na primeira falha de rede (timeout, cold start, 500 transitório) — o
    // mesmo incidente que motivou tirar `aiTone` de `useTenantSettings`,
    // reaberto por este widget em vez do formulário genérico.
    //
    // `aiTone` fica `null` (o template só desenha o <select> quando não é
    // `null`, então o navegador nunca escolhe a primeira <option> sozinho) e
    // `aiToneLoadError` liga a mensagem com "tentar de novo" no template.
    aiToneLoadError.value = true;
  } finally {
    aiToneLoading.value = false;
  }
}
onMounted(carregarAiTone);

async function saveAiTone() {
  // Defesa extra: o botão já fica desabilitado enquanto `aiTone` é `null`
  // (carregando ou falha), mas um valor não confirmado nunca pode virar PUT,
  // não importa por onde o submit chegasse.
  if (aiTone.value === null) return;

  aiToneSaving.value = true;
  aiToneSaved.value = false;
  aiToneError.value = "";
  try {
    // Só { aiTone }: o update do painel é parcial (toTenantUpdateRow só toca
    // no que vem definido), então isto não mexe em nenhum outro campo do tenant.
    await adminFetch("/api/admin/tenant", {
      method: "PUT",
      body: { aiTone: aiTone.value },
    });
    aiToneSaved.value = true;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    aiToneError.value = err?.data?.statusMessage || "Não foi possível salvar o tom.";
  } finally {
    aiToneSaving.value = false;
  }
}

// Preview ao vivo das cores
watch(
  () => [form.brandPrimary, form.brandAccent, form.whatsappButtonColor],
  ([b, a, w]) => {
    if (import.meta.client) {
      document.documentElement.style.setProperty("--brand", b || "#0f3d38");
      document.documentElement.style.setProperty("--accent", a || "#c2410c");
      // Campo vazio = usa o verde padrão do WhatsApp: remove o override em vez
      // de setar string vazia, senão var(--wa) resolveria pra inválido.
      if (w) document.documentElement.style.setProperty("--wa", w);
      else document.documentElement.style.removeProperty("--wa");
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

      <!--
        Só aparece para quem tem o recurso. Sem esta condição, uma imobiliária
        sem a Área do Cliente podia ligar o link no site dela — e o visitante
        que clicasse chegaria num login que recusa todo mundo, porque a RLS
        fecha o portal quando o recurso está desligado. O interruptor prometia
        algo que o sistema não entrega.
      -->
      <template v-if="areaCliente">
      <h3 class="section-t">Área do Cliente</h3>
      <label class="check-row">
        <input v-model="form.portalEnabled" type="checkbox" />
        <span>
          <b>Mostrar o link "Área do Cliente" no site</b>
          <small>
            Liga a entrada no topo e no rodapé do site público. Não altera quem
            tem acesso: quem entra são os clientes cadastrados em
            <NuxtLink to="/admin/clientes">Clientes</NuxtLink>. Deixe desligado
            enquanto ainda não houver ninguém cadastrado — o visitante cairia
            numa tela de login sem conta.
          </small>
        </span>
      </label>
      </template>

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
          <p v-if="avisoDeContraste(form.brandPrimary)" class="field-warn" role="status">
            {{ avisoDeContraste(form.brandPrimary) }}
          </p>
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
          <p v-if="avisoDeContraste(form.brandAccent)" class="field-warn" role="status">
            {{ avisoDeContraste(form.brandAccent) }}
          </p>
        </div>
        <div>
          <label class="admin-label">Cor do botão do WhatsApp</label>
          <div class="color-row">
            <input
              v-model="form.whatsappButtonColor"
              type="color"
              class="color-swatch"
            />
            <input
              v-model="form.whatsappButtonColor"
              class="admin-input"
              placeholder="Padrão (verde do WhatsApp)"
            />
          </div>
          <p class="field-hint">Vazio usa o verde padrão do WhatsApp.</p>
          <p v-if="avisoDeContraste(form.whatsappButtonColor)" class="field-warn" role="status">
            {{ avisoDeContraste(form.whatsappButtonColor) }}
          </p>
        </div>
        <div class="preview-box">
          <span class="badge">Venda</span>
          <span class="badge rent">Aluguel</span>
          <span class="admin-btn" style="pointer-events: none">Botão</span>
          <span class="btn-wa" style="pointer-events: none">WhatsApp</span>
        </div>
      </div>

      <!-- Instagram e site saíram daqui para "Meu site", junto do rodapé onde
           aparecem. Estavam nesta tela por raciocínio de implementação (alimentam
           o sameAs do JSON-LD), não pelo que a pessoa vê. -->
      <!-- O rótulo anterior ("como te buscam") convidava ao erro: as pessoas
           preenchiam com frases de busca ("casas para alugar"), que o Google
           ignora, porque a propriedade `alternateName` do JSON-LD serve para
           OUTRO NOME da empresa, não para o que se digita na busca. -->
      <h3 class="section-t">Outros nomes da imobiliária</h3>
      <p style="color: var(--ink-soft); font-size: 13px; margin: -4px 0 12px">
        Como sua imobiliária também é chamada: apelido, sigla ou nome antigo.
        Serve para o Google entender que é tudo a mesma empresa.
      </p>
      <div>
        <label class="admin-label">Um nome por linha</label>
        <textarea
          v-model="alternateNamesText"
          class="admin-textarea"
          rows="3"
          placeholder="TP Imobiliária&#10;Imóveis Pacheco&#10;Tatiane Imóveis"
        />
        <p class="field-hint">
          Só nomes. Não coloque o que as pessoas digitam no Google — "casas para
          alugar" não é um nome, e o Google descarta.
        </p>
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
          {{ feedCopied ? "Copiado!" : "Copiar link" }}
        </button>
      </div>
      <p class="hint-text">
        Só entram no feed os imóveis com status <strong>Publicado</strong>. O
        portal cobra o plano de anúncios à parte — a integração em si não tem
        custo.
      </p>

      <p v-if="error" role="alert" style="color: #b91c1c; margin-top: 14px">{{ error }}</p>
      <p
        v-if="saved"
        role="status"
        style="color: var(--ok); margin-top: 14px; font-weight: 600"
      >
        Configurações salvas! <AppIcon name="check" />
      </p>

      <div style="margin-top: 18px">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : "Salvar configurações" }}
        </button>
      </div>
    </form>

    <!--
      Cobrança é parte da locação: só aparece para quem tem contratos (a Área
      do Cliente), pelo mesmo motivo do menu lateral.
    -->
    <AdminCobrancaConta v-if="areaCliente" />

    <!--
      Fora do formulário de cima e com salvamento próprio, de propósito: ver o
      comentário no script. Só aparece para quem contratou o recurso — o painel
      não oferece tela de recurso que a imobiliária não tem (mesmo raciocínio
      do `v-if="areaCliente"` acima).
    -->
    <form
      v-if="descricaoIa"
      class="admin-card"
      style="margin-top: 18px"
      @submit.prevent="saveAiTone()"
    >
      <h3 class="section-t">Descrição por IA</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Tom da descrição</label>
          <!--
            O <select> só existe no DOM quando `aiTone` já é um valor
            confirmado. Um v-model apontando para `null` sobre estas <option>
            faria o PRÓPRIO NAVEGADOR escolher a primeira ('Sóbrio') sozinho —
            visualmente idêntico a ter carregado 'sobrio' de verdade. Por isso
            os estados de carregando/erro são parágrafos à parte, nunca o
            select "meio carregado".
          -->
          <select v-if="aiTone !== null" v-model="aiTone" class="admin-input">
            <option v-for="t in AI_TONES" :key="t" :value="t">
              {{ AI_TONE_LABELS[t] }}
            </option>
          </select>
          <p v-else-if="aiToneLoading" class="field-hint">Carregando tom atual…</p>
          <p v-else style="color: #b91c1c; margin: 0; font-size: 13px">
            Não foi possível carregar o tom atual.
            <button type="button" class="admin-btn ghost" @click="carregarAiTone">
              Tentar de novo
            </button>
          </p>
          <p class="field-hint">
            Aplica-se a toda descrição gerada por IA para esta imobiliária, a
            partir da próxima geração.
          </p>
        </div>
      </div>

      <p v-if="aiToneError" role="alert" style="color: #b91c1c; margin-top: 14px">{{ aiToneError }}</p>
      <p
        v-if="aiToneSaved"
        role="status"
        style="color: var(--ok); margin-top: 14px; font-weight: 600"
      >
        Tom salvo! <AppIcon name="check" />
      </p>

      <div style="margin-top: 18px">
        <!--
          `aiTone === null` cobre carregando E falha de carregamento ao mesmo
          tempo: não existe estado em que o botão fica habilitado sem um valor
          confirmado por trás. Ver o comentário de `carregarAiTone` no script.
        -->
        <button class="admin-btn" type="submit" :disabled="aiToneSaving || aiTone === null">
          {{ aiToneSaving ? "Salvando..." : "Salvar tom" }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.check-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid #e5e7eb;
  border-radius: var(--r-md);
  padding: 13px 14px;
}
.check-row input {
  margin-top: 3px;
  width: 17px;
  height: 17px;
  flex: none;
}
.check-row span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.check-row small {
  font-size: var(--fs-caption);
  color: #6b7280;
  line-height: 1.45;
}

.field-err {
  color: #b91c1c;
  font-size: var(--fs-caption);
  margin: 4px 0 0;
}
.section-t {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  margin: 22px 0 12px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
/* Aviso abaixo do campo, para o erro que a instrução antiga induzia. Fica
   depois do textarea de propósito: quem já começou a digitar frase de busca lê
   isto sem precisar voltar ao topo. */
.field-hint {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  margin: 6px 0 0;
  max-width: 56ch;
}
.field-warn {
  font-size: var(--fs-caption);
  color: #92400e;
  background: #fef3c7;
  border-radius: var(--r-sm);
  padding: 8px 10px;
  margin: 8px 0 0;
  max-width: 56ch;
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
  border-radius: var(--r-md);
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
  border-radius: var(--r-sm);
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
  border-radius: var(--r-md);
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
  font-size: var(--fs-caption);
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
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--brand);
  font-size: var(--fs-label);
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
  border-radius: var(--r-md);
  background: var(--paper);
  font-size: var(--fs-caption);
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
  border-radius: var(--r-sm);
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
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--ink-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.hero-preview-box {
  border: 1.5px solid var(--line-2);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface);
}
@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>

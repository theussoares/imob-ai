<script setup lang="ts">
import type { WhatsappMessage } from "~~/shared/models/whatsapp";

/**
 * Foto, áudio, vídeo ou documento de uma mensagem do WhatsApp.
 *
 * A URL é pedida só quando a bolha entra na tela: uma conversa com trinta
 * fotos pediria trinta URLs (e, se estiverem pendentes, trinta downloads na
 * Meta) só para abrir. A URL assinada vale dez minutos; se expirar com a tela
 * aberta, o erro de carregamento pede outra.
 */
const props = defineProps<{ m: WhatsappMessage }>();

const alvo = ref<HTMLElement | null>(null);
const url = ref<string | null>(null);
const estado = ref<"espera" | "carregando" | "ok" | "erro" | "grande">(props.m.mediaStatus === "grande_demais" ? "grande" : "espera");
const erro = ref("");

async function carregar() {
  if (estado.value === "carregando" || estado.value === "grande") return;
  estado.value = "carregando";
  try {
    const r = await adminFetch<{ url: string }>(`/api/admin/whatsapp/media/${props.m.id}`, { method: "POST" });
    url.value = r.url;
    estado.value = "ok";
  } catch (e) {
    const status = (e as { statusCode?: number })?.statusCode;
    estado.value = status === 410 ? "grande" : "erro";
    erro.value = friendlyErrorMessage(e, "Não foi possível abrir o arquivo.");
  }
}

const { stop } = useIntersectionObserver(alvo, ([entrada]) => {
  if (entrada?.isIntersecting && estado.value === "espera") {
    stop();
    carregar();
  }
}, { rootMargin: "200px" });

/** URL vencida com a tela aberta: pede outra, uma vez. */
let renovou = false;
function aoFalharCarga() {
  if (renovou) {
    estado.value = "erro";
    erro.value = "O arquivo não abriu.";
    return;
  }
  renovou = true;
  url.value = null;
  estado.value = "espera";
  carregar();
}

const rotulo = computed(() =>
  ({ image: "Foto", sticker: "Figurinha", audio: "Áudio", video: "Vídeo", document: "Documento" } as Record<string, string>)[props.m.type] ?? "Arquivo",
);
</script>

<template>
  <div ref="alvo" class="midia" :class="`t-${m.type}`">
    <template v-if="estado === 'ok' && url">
      <a v-if="m.type === 'image' || m.type === 'sticker'" :href="url" target="_blank" rel="noopener" class="img-link">
        <img :src="url" :alt="m.body || rotulo" loading="lazy" @error="aoFalharCarga" />
      </a>
      <audio v-else-if="m.type === 'audio'" :src="url" controls preload="metadata" @error="aoFalharCarga" />
      <video v-else-if="m.type === 'video'" :src="url" controls preload="metadata" playsinline @error="aoFalharCarga" />
      <a v-else :href="url" target="_blank" rel="noopener" class="doc">
        <AppIcon name="contract" />
        <span>{{ m.mediaFilename || rotulo }}</span>
        <AppIcon name="download" />
      </a>
    </template>
    <p v-else-if="estado === 'grande'" class="aviso">
      {{ rotulo }} grande demais para guardar no painel. Abra no celular.
    </p>
    <p v-else-if="estado === 'erro'" class="aviso" role="alert">
      {{ erro }}
      <button type="button" class="admin-btn ghost sm" @click="carregar">Tentar de novo</button>
    </p>
    <span v-else class="carregando" :class="`t-${m.type}`" aria-busy="true">{{ rotulo }}…</span>
  </div>
</template>

<style scoped>
.midia {
  margin: -2px -4px 4px;
}
.img-link {
  display: block;
}
.midia img {
  display: block;
  max-width: 100%;
  max-height: 320px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--surface);
}
.t-sticker img {
  max-width: 140px;
  background: transparent;
}
.midia audio {
  width: min(280px, 100%);
  display: block;
}
.midia video {
  display: block;
  max-width: 100%;
  max-height: 320px;
  border-radius: 8px;
}
.doc {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--paper);
  color: inherit;
  text-decoration: none;
  min-height: 44px;
}
.doc span {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--fs-label);
}
.doc :deep(svg) {
  width: 18px;
  height: 18px;
  flex: none;
}
.carregando {
  display: grid;
  place-items: center;
  min-height: 44px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  font-style: italic;
}
/* Espaço reservado do tamanho aproximado: a lista não pula quando a foto chega. */
.carregando.t-image,
.carregando.t-video {
  min-height: 160px;
  width: 220px;
  max-width: 100%;
  border-radius: 8px;
  background: var(--surface);
}
.aviso {
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  display: grid;
  gap: 6px;
  justify-items: start;
}
</style>

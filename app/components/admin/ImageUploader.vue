<script setup lang="ts">
import type { PropertyImageInput } from "~~/shared/models/property";

const model = defineModel<PropertyImageInput[]>({ default: () => [] });

const tenant = useTenant();
const toast = useToast();
const uploading = ref(false);
const urlInput = ref("");
/**
 * "Enviando 2 de 5…" em vez de só "Enviando...". Com cinco fotos de celular
 * o envio passa de um minuto, e sem progresso a pessoa não sabe se travou —
 * sai da tela ou manda tudo de novo.
 */
const progresso = ref<{ atual: number; total: number } | null>(null);

/**
 * Última foto removida, para o "Desfazer".
 *
 * O ✕ remove na hora, sem confirmação — confirmar cada foto seria cansativo
 * numa ficha de 20 fotos, e é por isso que o desfazer é o caminho certo
 * (Apple HIG: prefira desfazer a perguntar). Só a última: é o engano comum,
 * o toque errado no botão vizinho.
 */
const removida = ref<{ img: PropertyImageInput; index: number } | null>(null);

function reindex() {
  model.value.forEach((m, i) => (m.position = i));
  const first = model.value[0];
  if (first && !model.value.some((m) => m.isCover)) first.isCover = true;
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const slug = tenant.value?.slug;
  if (!slug) {
    toast.error(
      "Não foi possível identificar a imobiliária. Recarregue a página.",
    );
    input.value = "";
    return;
  }
  uploading.value = true;
  try {
    const client = await getAdminSupabase();
    const bucket = client.storage.from("property-images");

    progresso.value = { atual: 0, total: files.length };
    for (const file of files) {
      progresso.value = { atual: progresso.value.atual + 1, total: files.length };
      const base = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Formato que o canvas não abre (SVG, HEIC): sobe como veio, sem derivada.
      if (!isResizableImage(file)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${base}.${ext}`;
        const { error } = await bucket.upload(path, file, {
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) throw error;
        model.value.push({
          url: bucket.getPublicUrl(path).data.publicUrl,
          urlSm: null,
          alt: "",
          isCover: model.value.length === 0,
          position: model.value.length,
        });
        continue;
      }

      // Duas derivadas: 1600px (galeria) e 640px (card/thumb, via srcset).
      // Extensão e tipo vêm do que o navegador produziu — ver encodeWithFallback.
      const [lg, sm] = await Promise.all([
        resizeForUpload(file, IMAGE_SIZE_LG, "image/jpeg"),
        resizeForUpload(file, IMAGE_SIZE_SM, "image/jpeg"),
      ]);
      const pathLg = `${base}.${lg.ext}`;
      const pathSm = `${base}@sm.${sm.ext}`;

      const [resLg, resSm] = await Promise.all([
        bucket.upload(pathLg, lg.blob, {
          cacheControl: "31536000",
          upsert: false,
          contentType: lg.contentType,
        }),
        bucket.upload(pathSm, sm.blob, {
          cacheControl: "31536000",
          upsert: false,
          contentType: sm.contentType,
        }),
      ]);
      if (resLg.error) throw resLg.error;
      if (resSm.error) throw resSm.error;

      model.value.push({
        url: bucket.getPublicUrl(pathLg).data.publicUrl,
        urlSm: bucket.getPublicUrl(pathSm).data.publicUrl,
        alt: "",
        isCover: model.value.length === 0,
        position: model.value.length,
      });
    }
  } catch (err: unknown) {
    toast.error(friendlyErrorMessage(err, "Não foi possível enviar a imagem. Tente novamente."));
  } finally {
    uploading.value = false;
    progresso.value = null;
    input.value = "";
  }
}

function addByUrl() {
  const u = urlInput.value.trim();
  if (!u) return;
  // URL externa não tem derivada nossa — urlSm null, o front cai na url original.
  model.value.push({
    url: u,
    urlSm: null,
    alt: "",
    isCover: model.value.length === 0,
    position: model.value.length,
  });
  urlInput.value = "";
}

function remove(i: number) {
  const [img] = model.value.splice(i, 1);
  if (img) removida.value = { img: { ...img }, index: i };
  reindex();
}
function desfazerRemocao() {
  const r = removida.value;
  if (!r) return;
  // Se ela era a capa, volta capa: `reindex` teria promovido outra no lugar.
  if (r.img.isCover) model.value.forEach((m) => (m.isCover = false));
  model.value.splice(Math.min(r.index, model.value.length), 0, r.img);
  removida.value = null;
  reindex();
}
function setCover(i: number) {
  model.value.forEach((m, idx) => (m.isCover = idx === i));
}
function move(i: number, dir: number) {
  const j = i + dir;
  if (j < 0 || j >= model.value.length) return;
  const arr = model.value;
  const a = arr[i];
  const b = arr[j];
  if (!a || !b) return;
  arr[i] = b;
  arr[j] = a;
  reindex();
}
</script>

<template>
  <div>
    <div class="uploader-actions">
      <label class="admin-btn ghost file-btn">
        {{
          progresso
            ? `Enviando ${progresso.atual} de ${progresso.total}…`
            : "+ Enviar imagens"
        }}
        <input
          type="file"
          accept="image/*"
          multiple
          hidden
          :disabled="uploading"
          @change="onFiles"
        />
      </label>
      <div class="url-add">
        <label class="sr-only" for="img-url">URL de imagem</label>
        <input
          id="img-url"
          v-model="urlInput"
          class="admin-input"
          type="url"
          inputmode="url"
          placeholder="ou cole uma URL de imagem"
          @keydown.enter.prevent="addByUrl"
        />
        <button type="button" class="admin-btn ghost" @click="addByUrl">
          Adicionar
        </button>
      </div>
    </div>
    <p class="muted-note">
      Pode enviar várias de uma vez. As fotos são reduzidas automaticamente — não
      precisa diminuir antes. A capa é a que aparece no card do site.
    </p>
    <!-- Anúncio para leitor de tela: o texto do botão muda, mas mudança dentro
         de um <label> não é lida sozinha. -->
    <p class="sr-only" aria-live="polite">
      {{ progresso ? `Enviando foto ${progresso.atual} de ${progresso.total}` : "" }}
    </p>

    <div v-if="removida" class="undo" role="status">
      Foto removida.
      <button type="button" class="admin-btn ghost sm" @click="desfazerRemocao">
        Desfazer
      </button>
    </div>

    <p v-if="!model.length" class="muted-note">
      Nenhuma imagem ainda. A primeira será a capa.
    </p>

    <div v-else class="thumbs-grid">
      <div
        v-for="(img, i) in model"
        :key="i"
        class="thumb-item"
        :class="{ cover: img.isCover }"
      >
        <div class="thumb-img">
          <img
            :src="img.urlSm || img.url"
            :alt="img.alt || `Foto ${i + 1}`"
          />
          <span v-if="img.isCover" class="cover-tag">Capa</span>
          <!--
            Ícones com nome acessível: antes eram "←", "★", "→" e "✕" com só
            `title` — o leitor de tela anunciava "seta para a esquerda", e os
            botões tinham 26px, pequenos demais para o polegar.
          -->
          <div class="thumb-controls">
            <button
              type="button"
              :aria-label="`Mover foto ${i + 1} para trás`"
              :disabled="i === 0"
              @click="move(i, -1)"
            >
              <AppIcon name="arrow-left" />
            </button>
            <button
              type="button"
              :aria-label="img.isCover ? `Foto ${i + 1} é a capa` : `Definir foto ${i + 1} como capa`"
              :aria-pressed="!!img.isCover"
              @click="setCover(i)"
            >
              <AppIcon name="star" />
            </button>
            <button
              type="button"
              :aria-label="`Mover foto ${i + 1} para frente`"
              :disabled="i === model.length - 1"
              @click="move(i, 1)"
            >
              <AppIcon name="arrow-right" />
            </button>
            <button
              type="button"
              class="del"
              :aria-label="`Remover foto ${i + 1}`"
              @click="remove(i)"
            >
              <AppIcon name="trash" />
            </button>
          </div>
        </div>
        <!--
          Descrição da foto: vira o texto alternativo no site (a galeria do
          imóvel usa o `alt` cadastrado quando existe). Sem ela, quem ouve a
          página só sabia "foto 3 de 12" — "Cozinha planejada com ilha" é o que
          decide a visita.
        -->
        <label class="sr-only" :for="`img-alt-${i}`">Descrição da foto {{ i + 1 }}</label>
        <input
          :id="`img-alt-${i}`"
          v-model="img.alt"
          class="admin-input alt-input"
          maxlength="150"
          placeholder="Descrição (ex.: cozinha)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.uploader-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}
.file-btn {
  cursor: pointer;
}
.url-add {
  display: flex;
  gap: 8px;
  flex: 1;
  min-width: 220px;
}
.url-add .admin-input {
  flex: 1;
}
.muted-note {
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.thumbs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
}
.thumb-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.thumb-img {
  position: relative;
  border-radius: var(--r-md);
  overflow: hidden;
  border: 2px solid var(--line-2);
  aspect-ratio: 4/3;
}
.thumb-item.cover .thumb-img {
  border-color: var(--brand);
}
.alt-input {
  padding: 8px 10px;
  font-size: var(--fs-label);
}
.undo {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: var(--fs-ui);
  color: var(--ink-soft);
}
.thumb-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-tag {
  position: absolute;
  top: 6px;
  left: 6px;
  background: var(--brand);
  color: #fff;
  font-size: var(--fs-caption);
  font-weight: 700;
  padding: 3px 8px;
  border-radius: var(--r-sm);
}
.thumb-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 4px;
  padding: 5px;
  background: rgba(20, 22, 26, 0.55);
}
.thumb-controls button {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  border: none;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  cursor: pointer;
}
.thumb-controls button :deep(svg) {
  width: 18px;
  height: 18px;
}
.thumb-controls button[aria-pressed="true"] {
  background: var(--brand);
  color: #fff;
}
.thumb-controls button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.thumb-controls button.del {
  background: #fecaca;
  color: #7f1d1d;
}
</style>

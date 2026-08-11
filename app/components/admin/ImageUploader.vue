<script setup lang="ts">
import type { PropertyImageInput } from '~~/shared/models/property'

const model = defineModel<PropertyImageInput[]>({ default: () => [] })

const client = useSupabaseClient()
const tenant = useTenant()
const uploading = ref(false)
const urlInput = ref('')

function reindex() {
  model.value.forEach((m, i) => (m.position = i))
  const first = model.value[0]
  if (first && !model.value.some((m) => m.isCover)) first.isCover = true
}

async function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return
  uploading.value = true
  try {
    for (const file of files) {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${tenant.value?.slug || 'tenant'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await client.storage.from('property-images').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (error) throw error
      const { data } = client.storage.from('property-images').getPublicUrl(path)
      model.value.push({
        url: data.publicUrl,
        alt: '',
        isCover: model.value.length === 0,
        position: model.value.length,
      })
    }
  } catch (err: unknown) {
    const m = err as { message?: string }
    alert('Falha no upload: ' + (m?.message || 'erro desconhecido'))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function addByUrl() {
  const u = urlInput.value.trim()
  if (!u) return
  model.value.push({ url: u, alt: '', isCover: model.value.length === 0, position: model.value.length })
  urlInput.value = ''
}

function remove(i: number) {
  model.value.splice(i, 1)
  reindex()
}
function setCover(i: number) {
  model.value.forEach((m, idx) => (m.isCover = idx === i))
}
function move(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= model.value.length) return
  const arr = model.value
  const a = arr[i]
  const b = arr[j]
  if (!a || !b) return
  arr[i] = b
  arr[j] = a
  reindex()
}
</script>

<template>
  <div>
    <div class="uploader-actions">
      <label class="admin-btn ghost file-btn">
        {{ uploading ? 'Enviando...' : '+ Enviar imagens' }}
        <input type="file" accept="image/*" multiple hidden :disabled="uploading" @change="onFiles" />
      </label>
      <div class="url-add">
        <input v-model="urlInput" class="admin-input" placeholder="ou cole uma URL de imagem" @keydown.enter.prevent="addByUrl" />
        <button type="button" class="admin-btn ghost" @click="addByUrl">Adicionar</button>
      </div>
    </div>

    <p v-if="!model.length" class="muted-note">Nenhuma imagem ainda. A primeira será a capa.</p>

    <div v-else class="thumbs-grid">
      <div v-for="(img, i) in model" :key="i" class="thumb-item" :class="{ cover: img.isCover }">
        <img :src="img.url" :alt="img.alt || 'Imagem do imóvel'" />
        <span v-if="img.isCover" class="cover-tag">Capa</span>
        <div class="thumb-controls">
          <button type="button" title="Mover para trás" @click="move(i, -1)">←</button>
          <button type="button" title="Definir como capa" @click="setCover(i)">★</button>
          <button type="button" title="Mover para frente" @click="move(i, 1)">→</button>
          <button type="button" class="del" title="Remover" @click="remove(i)">✕</button>
        </div>
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
  font-size: 13px;
}
.thumbs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}
.thumb-item {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 2px solid var(--line-2);
  aspect-ratio: 4/3;
}
.thumb-item.cover {
  border-color: var(--brand);
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
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
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
  width: 26px;
  height: 26px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  font-size: 13px;
}
.thumb-controls button.del {
  background: #fecaca;
}
</style>

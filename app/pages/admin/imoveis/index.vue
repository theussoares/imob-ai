<script setup lang="ts">
import type { Property } from "~~/shared/models/property";
import {
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
} from "~~/shared/models/property";
import type { Broker } from "~~/shared/models/broker";

definePageMeta({ layout: "admin", middleware: "admin" });

const {
  data: properties,
  refresh,
  pending,
} = await useAsyncData(
  "admin:properties:list",
  () => adminFetch<Property[]>("/api/admin/properties"),
  { server: false, default: () => [] as Property[] },
);

const { data: brokers } = await useAsyncData(
  "admin:brokers:list",
  () => adminFetch<Broker[]>("/api/admin/brokers"),
  { server: false, default: () => [] as Broker[] },
);

const filters = reactive({
  q: "",
  type: "",
  purpose: "",
  status: "",
  brokerId: "",
});

function resetFilters() {
  filters.q = "";
  filters.type = "";
  filters.purpose = "";
  filters.status = "";
  filters.brokerId = "";
}

const filtersOpen = ref(false);

const activeFilterCount = computed(
  () =>
    [
      filters.q,
      filters.type,
      filters.purpose,
      filters.status,
      filters.brokerId,
    ].filter(Boolean).length,
);

const hasFilters = computed(
  () =>
    !!filters.q ||
    !!filters.type ||
    !!filters.purpose ||
    !!filters.status ||
    !!filters.brokerId,
);

const filtered = computed(() => {
  let list = properties.value ?? [];

  const term = filters.q.trim().toLowerCase();
  if (term) {
    list = list.filter((p) =>
      `${p.code} ${p.title} ${p.neighborhood ?? ""} ${p.city ?? ""} ${p.location ?? ""} ${p.ownerName ?? ""} ${p.broker?.name ?? ""}`
        .toLowerCase()
        .includes(term),
    );
  }
  if (filters.type) list = list.filter((p) => p.type === filters.type);
  if (filters.purpose)
    list = list.filter((p) => p.purpose === filters.purpose);
  if (filters.status) list = list.filter((p) => p.status === filters.status);
  if (filters.brokerId)
    list = list.filter((p) => p.brokerId === filters.brokerId);

  return list;
});

const deleting = ref<string | null>(null);

function waHref(phone?: string | null) {
  const d = (phone || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}

async function remove(p: Property) {
  if (!confirm(`Excluir o imóvel ${p.code}? Esta ação não pode ser desfeita.`))
    return;
  deleting.value = p.id;
  try {
    await adminFetch(`/api/admin/properties/${p.id}`, { method: "DELETE" });
    await refresh();
  } catch {
    alert("Não foi possível excluir.");
  } finally {
    deleting.value = null;
  }
}

useHead({ title: "Imóveis · Painel" });
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Imóveis</h1>
      <NuxtLink class="admin-btn" to="/admin/imoveis/novo"
        >+ Novo imóvel</NuxtLink
      >
    </div>

    <div v-if="properties?.length" class="admin-card filters-card">
      <button
        class="filters-toggle"
        :aria-expanded="filtersOpen"
        @click="filtersOpen = !filtersOpen"
      >
        <span class="filters-toggle-label">
          <AppIcon name="search" />
          Buscar e filtrar
          <span v-if="activeFilterCount" class="filters-badge">{{
            activeFilterCount
          }}</span>
        </span>
        <span class="muted-block filters-summary">
          {{ filtered.length }} de {{ properties.length }} imóveis
          <span class="chevron" :class="{ open: filtersOpen }">▾</span>
        </span>
      </button>

      <div v-show="filtersOpen" class="filters-body">
        <div class="filters-grid">
          <div>
            <label class="admin-label" for="fq">Buscar</label>
            <input
              id="fq"
              v-model="filters.q"
              class="admin-input"
              type="search"
              placeholder="Código, título, bairro, corretor, proprietário..."
              autocomplete="off"
            />
          </div>
          <div>
            <label class="admin-label" for="ftype">Tipo</label>
            <select id="ftype" v-model="filters.type" class="admin-select">
              <option value="">Todos</option>
              <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">
                {{ PROPERTY_TYPE_LABELS[t] }}
              </option>
            </select>
          </div>
          <div>
            <label class="admin-label" for="fpurpose">Pretensão</label>
            <select
              id="fpurpose"
              v-model="filters.purpose"
              class="admin-select"
            >
              <option value="">Todas</option>
              <option value="venda">Venda</option>
              <option value="aluguel">Aluguel</option>
            </select>
          </div>
          <div>
            <label class="admin-label" for="fstatus">Status</label>
            <select id="fstatus" v-model="filters.status" class="admin-select">
              <option value="">Todos</option>
              <option v-for="s in PROPERTY_STATUSES" :key="s" :value="s">
                {{ PROPERTY_STATUS_LABELS[s] }}
              </option>
            </select>
          </div>
          <div>
            <label class="admin-label" for="fbroker">Corretor</label>
            <select
              id="fbroker"
              v-model="filters.brokerId"
              class="admin-select"
            >
              <option value="">Todos</option>
              <option v-for="b in brokers" :key="b.id" :value="b.id">
                {{ b.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="filters-foot">
          <button
            v-if="hasFilters"
            class="admin-btn ghost sm"
            @click="resetFilters"
          >
            Limpar filtros
          </button>
        </div>
      </div>
    </div>

    <p v-if="pending" class="admin-card muted-block">Carregando...</p>
    <p v-else-if="!properties?.length" class="admin-card muted-block">
      Nenhum imóvel cadastrado ainda. Clique em “Novo imóvel”.
    </p>
    <p v-else-if="!filtered.length" class="admin-card muted-block">
      Nenhum imóvel encontrado com esses filtros.
    </p>

    <template v-else>
      <!-- Mobile: cards -->
      <div class="cards">
        <article
          v-for="p in filtered"
          :key="p.id"
          class="admin-card row-card"
        >
          <div class="row-info">
            <div class="flex gap-2">
              <div class="row-thumb">
                <img
                  v-if="p.images[0]"
                  :src="p.images[0].url"
                  :alt="p.title"
                  loading="lazy"
                />
                <AppIcon v-else name="home" />
              </div>
              <div class="flex flex-col gap-1">
                <div class="flex justify-between">
                  <span class="mono">{{ p.code }}</span>
                  <span class="pill" :class="{ muted: p.status !== 'active' }">
                    {{ PROPERTY_STATUS_LABELS[p.status] }}
                  </span>
                </div>
                <strong class="row-title">{{ p.title }}</strong>
                <div class="row-meta">
                  {{ PROPERTY_TYPE_LABELS[p.type] }} ·
                  {{ p.purpose === "aluguel" ? "Aluguel" : "Venda" }} ·
                  <b>{{ formatBRL(p.price) }}</b>
                </div>
              </div>
            </div>

            <div
              v-if="p.location || p.broker || p.ownerName"
              class="row-internal"
            >
              <div v-if="p.location" class="int-loc">📍 {{ p.location }}</div>
              <div v-if="p.broker" class="int-line">
                <a
                  v-if="p.broker.name && waHref(p.broker.phone)"
                  class="wa-mini gap-1"
                  :href="waHref(p.broker.phone)"
                  target="_blank"
                  rel="noopener"
                  aria-label="WhatsApp do captador"
                >
                  <span>👤 Corretor: {{ p.broker.name }}</span>
                  <AppIcon name="wa"
                /></a>
              </div>
              <div v-if="p.ownerName" class="int-line">
                <a
                  v-if="p.ownerName && waHref(p.ownerPhone)"
                  class="wa-mini gap-1"
                  :href="waHref(p.ownerPhone)"
                  target="_blank"
                  rel="noopener"
                  aria-label="WhatsApp do proprietário"
                >
                  <span>🔑 Proprietário: {{ p.ownerName }}</span>
                  <AppIcon name="wa" />
                </a>
              </div>
            </div>

            <div class="row-actions">
              <NuxtLink
                class="admin-btn ghost sm"
                :to="`/admin/imoveis/${p.id}`"
                >Editar</NuxtLink
              >
              <button
                class="admin-btn danger sm"
                :disabled="deleting === p.id"
                @click="remove(p)"
              >
                {{ deleting === p.id ? "..." : "Excluir" }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <!-- Desktop: tabela -->
      <div class="admin-card table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Título</th>
              <th>Tipo</th>
              <th>Pretensão</th>
              <th>Preço</th>
              <th>Status</th>
              <th>Interno</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in filtered" :key="p.id">
              <td class="mono">{{ p.code }}</td>
              <td>{{ p.title }}</td>
              <td>{{ PROPERTY_TYPE_LABELS[p.type] }}</td>
              <td>{{ p.purpose === "aluguel" ? "Aluguel" : "Venda" }}</td>
              <td>{{ formatBRL(p.price) }}</td>
              <td>
                <span class="pill" :class="{ muted: p.status !== 'active' }">
                  {{ PROPERTY_STATUS_LABELS[p.status] }}
                </span>
              </td>
              <td class="td-internal">
                <div v-if="p.broker" class="int-line">
                  <span>👤 {{ p.broker.name }}</span>
                  <a
                    v-if="waHref(p.broker.phone)"
                    class="wa-mini"
                    :href="waHref(p.broker.phone)"
                    target="_blank"
                    rel="noopener"
                    aria-label="WhatsApp do captador"
                    ><AppIcon name="wa"
                  /></a>
                </div>
                <div v-if="p.ownerName" class="int-line">
                  <span>🔑 {{ p.ownerName }}</span>
                  <a
                    v-if="waHref(p.ownerPhone)"
                    class="wa-mini"
                    :href="waHref(p.ownerPhone)"
                    target="_blank"
                    rel="noopener"
                    aria-label="WhatsApp do proprietário"
                    ><AppIcon name="wa"
                  /></a>
                </div>
                <div v-if="p.location" class="int-loc">📍 {{ p.location }}</div>
                <span
                  v-if="!p.broker && !p.ownerName && !p.location"
                  style="color: var(--line-2)"
                  >—</span
                >
              </td>
              <td class="td-actions">
                <NuxtLink
                  class="admin-btn ghost sm"
                  :to="`/admin/imoveis/${p.id}`"
                  >Editar</NuxtLink
                >
                <button
                  class="admin-btn danger sm"
                  :disabled="deleting === p.id"
                  @click="remove(p)"
                >
                  {{ deleting === p.id ? "..." : "Excluir" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.filters-card {
  margin-bottom: 16px;
}
.filters-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: inherit;
  text-align: left;
}
.filters-toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.filters-toggle-label :deep(svg) {
  width: 16px;
  height: 16px;
}
.filters-badge {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.filters-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  white-space: nowrap;
}
.chevron {
  display: inline-block;
  transition: transform 0.15s ease;
}
.chevron.open {
  transform: rotate(180deg);
}
.filters-body {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}
.filters-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
  font-size: 13px;
}
.muted-block {
  color: var(--ink-soft);
}
.mono {
  font-family: "Space Grotesk", sans-serif;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.admin-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
}

/* ---- Cards (mobile) ---- */
.cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row-card {
  display: flex;
  gap: 13px;
  padding: 12px;
  align-items: stretch;
}
.row-thumb {
  width: 140px;
  min-width: 84px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--brand);
  color: #fff;
  display: grid;
  place-items: center;
}
.row-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.row-thumb :deep(svg) {
  width: 26px;
  height: 26px;
}
.row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.row-title {
  font-size: 15px;
  line-height: 1.25;
}
.row-meta {
  font-size: 13px;
  color: var(--ink-soft);
}
.row-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.row-actions .admin-btn {
  flex: 1;
  text-align: center;
}

/* ---- Tabela (desktop) ---- */
.table-wrap {
  display: none;
  overflow-x: auto;
}
.table-wrap .admin-table {
  /* Sem min-width, `.admin-table { width: 100% }` faz a tabela SEMPRE caber no
     container: ela nunca transborda, o overflow-x não tem o que rolar, e as 8
     colunas apenas espremem. Entre o breakpoint de 760px e ~1000px era esse o
     sintoma — não cabia e também não rolava. */
  min-width: 980px;
}
.td-actions {
  white-space: nowrap;
  text-align: right;
}
.row-internal {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--line);
  font-size: 12.5px;
  color: var(--ink-soft);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.wa-mini {
  display: flex;
  align-items: center;
}
.int-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.td-internal {
  font-size: 12.5px;
  color: var(--ink-soft);
  max-width: 220px;
}

.td-actions .admin-btn + .admin-btn {
  margin-left: 6px;
}

@media (min-width: 760px) {
  .cards {
    display: none;
  }
  .table-wrap {
    display: block;
  }
}
</style>

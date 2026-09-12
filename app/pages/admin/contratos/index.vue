<script setup lang="ts">
import type { Contract } from "~~/shared/models/portal";
import { CONTRACT_STATUS_LABELS } from "~~/shared/models/portal";
import type { Property } from "~~/shared/models/property";
import { formatBRL, contractPeriodLabel } from "~~/shared/utils/portal-format";

definePageMeta({ layout: "admin", middleware: "admin" });

// useLazyAsyncData (sem `await`): a tela abre na hora e mostra "Carregando" em
// vez de segurar a navegação até a requisição terminar.
const {
  data: contracts,
  pending,
  error: loadError,
} = useLazyAsyncData(
  "admin:contracts:list",
  () => adminFetch<Contract[]>("/api/admin/contracts"),
  { server: false, default: () => [] as Contract[] },
);

// Usada só para escrever o endereço do imóvel na linha da lista. Contrato pode
// apontar para um imóvel do catálogo OU trazer o endereço escrito à mão.
const { data: properties } = useLazyAsyncData(
  "admin:properties:list",
  () => adminFetch<Property[]>("/api/admin/properties"),
  { server: false, default: () => [] as Property[] },
);

const statusFilter = ref<"ativo" | "encerrado" | "">("ativo");

const visible = computed(() =>
  (contracts.value || []).filter(
    (c) => !statusFilter.value || c.status === statusFilter.value,
  ),
);

const encerrados = computed(
  () => (contracts.value || []).filter((c) => c.status === "encerrado").length,
);

/**
 * O que a linha mostra como imóvel.
 *
 * `address_label` tem precedência quando o contrato não aponta para o catálogo
 * (locação administrada de imóvel que nunca foi anunciado). Quando aponta mas o
 * imóvel foi excluído, `propertyId` já virou nulo no banco — então cair no
 * "Imóvel não informado" aqui significa cadastro incompleto, não imóvel sumido.
 */
function imovelLabel(c: Contract): string {
  if (c.addressLabel) return c.addressLabel;
  const p = (properties.value || []).find((i) => i.id === c.propertyId);
  if (p) return [p.title, p.neighborhood].filter(Boolean).join(" · ");
  return "Imóvel não informado";
}

useHead({ title: "Contratos · Painel" });
</script>

<template>
  <div>
    <div class="page-head">
      <h1>Contratos</h1>
      <NuxtLink class="admin-btn" to="/admin/contratos/novo"
        >Novo contrato</NuxtLink
      >
    </div>

    <div class="tabs">
      <button
        v-for="opt in [
          { v: 'ativo', label: 'Ativos' },
          { v: 'encerrado', label: `Encerrados (${encerrados})` },
          { v: '', label: 'Todos' },
        ]"
        :key="opt.v"
        class="tab"
        :class="{ active: statusFilter === opt.v }"
        type="button"
        @click="statusFilter = opt.v as 'ativo' | 'encerrado' | ''"
      >
        {{ opt.label }}
      </button>
    </div>

    <div class="admin-card">
      <p v-if="pending" style="color: var(--ink-soft)">Carregando...</p>
      <p v-else-if="loadError" class="err">
        Não foi possível carregar os contratos.
      </p>
      <p v-else-if="!contracts?.length" style="color: var(--ink-soft)">
        Nenhum contrato cadastrado ainda. Cadastre o primeiro para que inquilino
        e proprietário passem a ter o que ver na Área do Cliente.
      </p>
      <p v-else-if="!visible.length" style="color: var(--ink-soft)">
        Nenhum contrato nesta situação.
      </p>
      <ul v-else class="contract-list">
        <li v-for="c in visible" :key="c.id" class="contract">
          <NuxtLink class="contract-main" :to="`/admin/contratos/${c.id}`">
            <div class="contract-top">
              <strong>{{ c.code }}</strong>
              <span v-if="c.status === 'encerrado'" class="pill muted">
                {{ CONTRACT_STATUS_LABELS.encerrado }}
              </span>
            </div>
            <div class="contract-meta">{{ imovelLabel(c) }}</div>
            <div class="contract-meta">
              {{ contractPeriodLabel(c.startedOn, c.endsOn) }}
              <template v-if="c.rentAmount">
                · {{ formatBRL(c.rentAmount) }}/mês
              </template>
              <template v-if="c.dueDay"> · vence dia {{ c.dueDay }}</template>
            </div>
          </NuxtLink>
          <NuxtLink class="admin-btn ghost sm" :to="`/admin/contratos/${c.id}`">
            Abrir
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.tab {
  border: 1px solid var(--line);
  background: transparent;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: var(--ink-soft);
}
.tab.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.contract-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.contract {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 13px 2px;
  border-bottom: 1px solid var(--line);
}
.contract:last-child {
  border-bottom: none;
}
.contract-main {
  flex: 1;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}
.contract-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.contract-top strong {
  font-size: 15px;
}
.contract-meta {
  color: var(--ink-soft);
  font-size: 13px;
  margin-top: 2px;
}
.err {
  color: #b91c1c;
  font-size: 13px;
  margin: 0;
}
.admin-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
}
</style>

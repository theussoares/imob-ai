<script setup lang="ts">
import type { Property } from "~~/shared/models/property";
import {
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
} from "~~/shared/models/property";

definePageMeta({ layout: "admin", middleware: "admin" });

const tenant = useTenant();

const { data: properties, pending } = await useAsyncData(
  "admin:dashboard:properties",
  () => adminFetch<Property[]>("/api/admin/properties"),
  { server: false, default: () => [] as Property[] },
);

const list = computed(() => properties.value ?? []);

const stats = computed(() => {
  const l = list.value;
  return {
    total: l.length,
    published: l.filter((p) => p.status === "active").length,
    venda: l.filter((p) => p.purpose === "venda").length,
    aluguel: l.filter((p) => p.purpose === "aluguel").length,
    drafts: l.filter((p) => p.status === "draft").length,
    semFotos: l.filter((p) => !p.images?.length).length,
  };
});

// Qualidade — avaliada sobre os imóveis PUBLICADOS (o que o cliente final vê).
const issues = computed(() => {
  const pub = list.value.filter((p) => p.status === "active");
  const semFotos = pub.filter((p) => !p.images?.length);
  const semDesc = pub.filter((p) => !(p.description || "").trim());
  const semPreco = pub.filter((p) => !p.price || p.price <= 0);
  const semBairro = pub.filter((p) => !(p.neighborhood || "").trim());
  const attention = new Set(
    [...semFotos, ...semDesc, ...semPreco, ...semBairro].map((p) => p.id),
  );
  return {
    semFotos: semFotos.length,
    semDesc: semDesc.length,
    semPreco: semPreco.length,
    semBairro: semBairro.length,
    attention: attention.size,
  };
});

const recent = computed(() =>
  [...list.value]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 5),
);

const lastUpdated = computed(() => {
  const times = list.value
    .map((p) => new Date(p.updatedAt).getTime())
    .filter((t) => !Number.isNaN(t));
  return times.length ? Math.max(...times) : 0;
});

const pctPublished = computed(() =>
  stats.value.total
    ? Math.round((stats.value.published / stats.value.total) * 100)
    : 0,
);

function relTime(ms: number) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

useHead({ title: "Dashboard · Painel" });
</script>

<template>
  <div>
    <h1>Dashboard</h1>
    <p style="color: var(--ink-soft); margin-bottom: 20px">
      Visão geral do seu catálogo.
    </p>

    <div v-if="pending" style="color: var(--ink-soft)">Carregando...</div>

    <template v-else>
      <!-- Métricas -->
      <div class="stat-grid">
        <div class="admin-card stat">
          <span>{{ stats.total }}</span
          ><small>Cadastrados</small>
        </div>
        <div class="admin-card stat">
          <span>{{ stats.published }}</span
          ><small>Publicados</small>
        </div>
        <div class="admin-card stat">
          <span>{{ stats.venda }}</span
          ><small>À venda</small>
        </div>
        <div class="admin-card stat">
          <span>{{ stats.aluguel }}</span
          ><small>Para alugar</small>
        </div>
        <div class="admin-card stat">
          <span>{{ stats.drafts }}</span
          ><small>Rascunhos</small>
        </div>
        <div class="admin-card stat" :class="{ warn: stats.semFotos }">
          <span>{{ stats.semFotos }}</span
          ><small>Sem fotos</small>
        </div>
      </div>

      <!-- Ações rápidas -->
      <div class="admin-card quick">
        <span class="quick-label">Ações rápidas</span>
        <div class="quick-actions">
          <NuxtLink class="admin-btn" to="/admin/imoveis/novo"
            >+ Novo imóvel</NuxtLink
          >
          <NuxtLink class="admin-btn ghost" to="/admin/imoveis"
            >Gerenciar imóveis</NuxtLink
          >
          <NuxtLink class="admin-btn ghost" to="/admin/corretores"
            >Corretores</NuxtLink
          >
          <a class="admin-btn ghost" href="/" target="_blank" rel="noopener"
            >Ver site ↗</a
          >
          <NuxtLink class="admin-btn ghost" to="/admin/config"
            >Configurações</NuxtLink
          >
        </div>
      </div>

      <!-- Recentes + Saúde -->
      <div class="two-col">
        <div class="admin-card">
          <div class="card-head">
            <h3>Imóveis recentes</h3>
            <NuxtLink to="/admin/imoveis" class="see-all">Ver todos →</NuxtLink>
          </div>
          <p v-if="!recent.length" style="color: var(--ink-soft)">
            Nenhum imóvel cadastrado ainda.
          </p>
          <div v-else class="table-wrap">
            <table class="admin-table recent-table">
              <thead>
                <tr>
                  <th>Imóvel</th>
                  <th>Tipo</th>
                  <th>Finalidade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in recent" :key="p.id">
                  <td>
                    <NuxtLink
                      :to="`/admin/imoveis/${p.id}`"
                      class="rec-link"
                      >{{ p.title }}</NuxtLink
                    >
                  </td>
                  <td>{{ PROPERTY_TYPE_LABELS[p.type] }}</td>
                  <td>{{ p.purpose === "aluguel" ? "Aluguel" : "Venda" }}</td>
                  <td>
                    <span
                      class="pill"
                      :class="{ muted: p.status !== 'active' }"
                      >{{ PROPERTY_STATUS_LABELS[p.status] }}</span
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="admin-card health">
          <h3>Saúde do catálogo</h3>

          <p v-if="issues.attention === 0" class="health-ok">
            🟢 Tudo certo — seu catálogo está completo.
          </p>
          <template v-else>
            <p class="health-warn">
              🟡 {{ issues.attention }}
              {{
                issues.attention === 1 ? "imóvel precisa" : "imóveis precisam"
              }}
              de atenção
            </p>
            <ul class="health-list">
              <li v-if="issues.semFotos">⚠️ {{ issues.semFotos }} sem fotos</li>
              <li v-if="issues.semDesc">
                ⚠️ {{ issues.semDesc }} sem descrição
              </li>
              <li v-if="issues.semPreco">⚠️ {{ issues.semPreco }} sem preço</li>
              <li v-if="issues.semBairro">
                ⚠️ {{ issues.semBairro }} sem bairro
              </li>
            </ul>
          </template>

          <div class="bar"><span :style="{ width: pctPublished + '%' }" /></div>
          <div class="health-meta">
            {{ stats.published }} de {{ stats.total }} imóveis publicados
            <template v-if="lastUpdated">
              · atualizado {{ relTime(lastUpdated) }}</template
            >
          </div>
          <NuxtLink to="/admin/imoveis" class="see-all"
            >Ver catálogo →</NuxtLink
          >
        </div>
      </div>

      <!-- Dica -->
      <div class="tip">
        💡 Imóveis com boas fotos recebem mais atenção.
        <NuxtLink to="/admin/imoveis">Ver imóveis →</NuxtLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat span {
  font-family: "Space Grotesk", sans-serif;
  font-size: 32px;
  font-weight: 700;
  color: var(--brand);
}
.stat small {
  color: var(--ink-soft);
  font-size: 13px;
}
.stat.warn span {
  color: #b45309;
}

.quick {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.quick-label {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-soft);
}
.quick-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.two-col {
  margin-top: 16px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
/* Item de grid tem `min-width: auto` por padrão: sem isto ele não encolhe
   abaixo da largura da tabela e o card (e a PÁGINA) passa da tela no mobile
   em vez de ficar centralizado — mesmo problema já resolvido em .admin-main. */
.two-col > .admin-card {
  min-width: 0;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.card-head h3,
.health h3 {
  font-family: "Space Grotesk", sans-serif;
  font-size: 16px;
}
.health h3 {
  margin-bottom: 12px;
}
.see-all {
  font-size: 13px;
  font-weight: 600;
  color: var(--brand);
  text-decoration: none;
  white-space: nowrap;
}
.recent-table th,
.recent-table td {
  padding: 9px 8px;
}
.table-wrap {
  overflow-x: auto;
}
.table-wrap .recent-table {
  min-width: 480px;
}
.rec-link {
  color: var(--ink);
  text-decoration: none;
  font-weight: 600;
}
.rec-link:hover {
  color: var(--brand);
}

.health-ok {
  color: var(--wa-dark);
  font-weight: 600;
  margin: 0 0 12px;
}
.health-warn {
  color: #b45309;
  font-weight: 700;
  margin: 0 0 8px;
}
.health-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13.5px;
  color: var(--ink-soft);
}
.bar {
  height: 8px;
  border-radius: 100px;
  background: var(--surface);
  overflow: hidden;
  margin: 6px 0 8px;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: 100px;
  transition: width 0.4s;
}
.health-meta {
  font-size: 13px;
  color: var(--ink-soft);
  margin-bottom: 12px;
}

.tip {
  margin-top: 16px;
  background: var(--brand-ghost);
  border-radius: 12px;
  padding: 13px 16px;
  font-size: 14px;
  color: var(--ink);
}
.tip a {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
  margin-left: 4px;
}

@media (min-width: 900px) {
  .two-col {
    grid-template-columns: 1.5fr 1fr;
    align-items: start;
  }
}
</style>

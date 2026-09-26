<script setup lang="ts">
import type { Property } from "~~/shared/models/property";
import type { Lead } from "~~/shared/models/lead";
import { LEAD_TYPE_LABELS } from "~~/shared/models/lead";
import { leadsParaAtender } from "~~/shared/utils/lead-agenda";
import {
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
} from "~~/shared/models/property";

definePageMeta({ layout: "admin", middleware: "admin" });

const tenant = useTenant();
const siteUrl = usePublicSiteUrl();

const { data: properties, pending, error: loadError, refresh } = useLazyAsyncData(
  // Mesma chave da listagem de imóveis: compartilha a entrada em vez de manter
  // duas cópias do mesmo GET. Não é cache entre navegações — sem `getCachedData`
  // o Nuxt refaz a requisição a cada visita, que é o que se quer aqui (contagem
  // velha no dashboard seria pior que uma requisição a mais).
  "admin:properties:list",
  () => adminFetch<Property[]>("/api/admin/properties"),
  { server: false, default: () => [] as Property[] },
);

const list = computed(() => properties.value ?? []);

/**
 * Contatos esperando resposta — o primeiro bloco da tela. Ver
 * shared/utils/lead-agenda.ts para a ordem e o porquê.
 *
 * Mesma chave da tela de Contatos, pelo mesmo motivo da de imóveis acima.
 * Carrega à parte: se falhar, o resto do dashboard continua de pé.
 */
const { data: leads, pending: leadsPending, error: leadsError } = useLazyAsyncData(
  "admin:leads",
  () => adminFetch<Lead[]>("/api/admin/leads"),
  { server: false, default: () => [] as Lead[] },
);
const agenda = computed(() => leadsParaAtender(leads.value ?? []));

function waHref(phone?: string | null) {
  const d = (phone || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}

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

    <!--
      Antes das métricas: é o que tem prazo. Ver `agenda` no script.
    -->
    <section class="admin-card agenda" aria-labelledby="agenda-t">
      <div class="card-head">
        <h2 id="agenda-t">Para atender agora</h2>
        <NuxtLink to="/admin/leads" class="see-all">Todos os contatos →</NuxtLink>
      </div>
      <p v-if="leadsPending && !leads?.length" class="muted">Carregando contatos…</p>
      <p v-else-if="leadsError" class="muted" role="alert">
        Não foi possível carregar os contatos agora.
      </p>
      <p v-else-if="!agenda.total" class="agenda-ok">
        <AppIcon name="check" /> Ninguém esperando resposta.
      </p>
      <ul v-else class="agenda-list">
        <li v-for="i in agenda.itens" :key="i.lead.id">
          <div class="ag-info">
            <strong>{{ i.lead.name || "Sem nome" }}</strong>
            <span class="ag-meta">
              <template v-if="i.motivo === 'retorno_atrasado'">
                <AppIcon name="clock" /> Retorno atrasado
              </template>
              <template v-else>
                Novo · {{ relTime(new Date(i.lead.createdAt).getTime()) }}
              </template>
              · {{ LEAD_TYPE_LABELS[i.lead.leadType] }}
            </span>
          </div>
          <a
            v-if="waHref(i.lead.phone)"
            class="admin-btn sm ag-wa"
            :href="waHref(i.lead.phone)"
            target="_blank"
            rel="noopener"
            :aria-label="`WhatsApp de ${i.lead.name || 'contato sem nome'}`"
          >
            <AppIcon name="wa" /> WhatsApp
          </a>
        </li>
      </ul>
      <p v-if="agenda.total > agenda.itens.length" class="ag-more">
        + {{ agenda.total - agenda.itens.length }} esperando.
        <NuxtLink to="/admin/leads">Ver todos</NuxtLink>
      </p>
    </section>

    <div v-if="pending && !properties?.length" class="muted" role="status">Carregando...</div>

    <!-- Sem isto, uma falha de rede mostrava "0 cadastrados" e "Tudo certo —
         seu catálogo está completo": a pior mensagem possível para um erro. -->
    <div v-else-if="loadError" class="admin-card state-card" role="alert">
      <p>Não foi possível carregar o catálogo. Verifique a conexão.</p>
      <button type="button" class="admin-btn" @click="refresh()">Tentar de novo</button>
    </div>

    <!-- Conta nova: sem imóvel, os números zerados não dizem o que fazer. -->
    <div v-else-if="!list.length" class="admin-card state-card">
      <h2 class="start-t">Comece pelo primeiro imóvel</h2>
      <p>
        Com um imóvel publicado o site já aparece completo. Depois vale conferir
        as cores e o logo em Configurações.
      </p>
      <NuxtLink class="admin-btn" to="/admin/imoveis/novo">Cadastrar imóvel</NuxtLink>
    </div>

    <template v-else>
      <!--
        Métricas enxutas. Eram seis cartões do mesmo tamanho: "62 Cadastrados"
        e "62 Publicados" diziam quase sempre a mesma coisa, e "0 Rascunhos",
        "0 Sem fotos" ocupavam espaço para dizer "nada". Agora são três números
        fixos e os de alerta só aparecem quando há o que fazer.
      -->
      <div class="stat-grid">
        <div class="admin-card stat">
          <span>{{ stats.published }}</span
          ><small>Publicados<template v-if="stats.published !== stats.total">
              de {{ stats.total }}</template
            ></small>
        </div>
        <div class="admin-card stat">
          <span>{{ stats.venda }}</span
          ><small>À venda</small>
        </div>
        <div class="admin-card stat">
          <span>{{ stats.aluguel }}</span
          ><small>Para alugar</small>
        </div>
        <NuxtLink
          v-if="stats.drafts"
          to="/admin/imoveis?status=draft"
          class="admin-card stat stat-link"
        >
          <span>{{ stats.drafts }}</span
          ><small>{{ stats.drafts === 1 ? "Rascunho" : "Rascunhos" }} →</small>
        </NuxtLink>
        <div v-if="stats.semFotos" class="admin-card stat warn">
          <span>{{ stats.semFotos }}</span
          ><small>Sem fotos</small>
        </div>
      </div>

      <!--
        Só atalhos que o menu NÃO tem. "Gerenciar imóveis", "Corretores" e
        "Configurações" repetiam a barra lateral ao lado; o que sobra são as
        duas ações que se fazem de passagem.
      -->
      <div class="quick-actions dash-actions">
        <NuxtLink class="admin-btn" to="/admin/imoveis/novo">+ Novo imóvel</NuxtLink>
        <NuxtLink class="admin-btn ghost" to="/admin/leads?novo=1">+ Novo contato</NuxtLink>
        <a class="admin-btn ghost" :href="siteUrl" target="_blank" rel="noopener"
          >Ver site <AppIcon name="external" /><span class="sr-only"> (abre em nova aba)</span></a
        >
      </div>

      <!-- Recentes + Saúde -->
      <div class="two-col">
        <div class="admin-card">
          <div class="card-head">
            <h2>Imóveis recentes</h2>
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
                    <NuxtLink :to="`/admin/imoveis/${p.id}`" class="rec-link">{{
                      p.title
                    }}</NuxtLink>
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
          <h2>Saúde do catálogo</h2>

          <p v-if="issues.attention === 0" class="health-ok">
            <AppIcon name="check" />
            <template v-if="stats.published === stats.total">Tudo certo — seu catálogo está completo.</template>
            <!-- A checagem olha só os publicados. Com rascunho na conta, "catálogo
                 completo" ao lado de "12 de 13 publicados" se contradizia. -->
            <template v-else>Os imóveis publicados estão completos.</template>
          </p>
          <template v-else>
            <p class="health-warn">
              <AppIcon name="alert" /> {{ issues.attention }}
              {{
                issues.attention === 1 ? "imóvel precisa" : "imóveis precisam"
              }}
              de atenção
            </p>
            <ul class="health-list">
              <li v-if="issues.semFotos">{{ issues.semFotos }} sem fotos</li>
              <li v-if="issues.semDesc">{{ issues.semDesc }} sem descrição</li>
              <li v-if="issues.semPreco">{{ issues.semPreco }} sem preço</li>
              <li v-if="issues.semBairro">{{ issues.semBairro }} sem bairro</li>
            </ul>
          </template>

          <div class="bar"><span :style="{ transform: `scaleX(${pctPublished / 100})` }" /></div>
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
        <AppIcon name="bulb" /> Imóveis com boas fotos recebem mais atenção.
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
/* No celular cabem dois por linha; com número ímpar de indicadores o último
   ficava sozinho, meio vazio, parecendo que faltava um card ao lado. */
@media (max-width: 640px) {
  .stat-grid {
    grid-template-columns: 1fr 1fr;
  }
  .stat-grid > :last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat span {
  font-family: var(--font-display);
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--brand);
}
.stat small {
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.stat.warn span {
  color: #b45309;
}

.dash-actions {
  margin-top: 16px;
}
.stat-link {
  color: inherit;
  text-decoration: none;
}
.stat-link:hover {
  border-color: var(--brand);
}
.quick-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
/* inline-flex + nowrap: com o ícone de "abre fora" o "Ver site" quebrava em
   duas linhas e ficava mais alto que os vizinhos. */
.quick-actions .admin-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  min-height: 44px;
  text-decoration: none;
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
.card-head h2,
.health h2 {
  font-family: var(--font-display);
  font-size: var(--fs-body);
}
.health h2 {
  margin-bottom: 12px;
}
.see-all {
  font-size: var(--fs-label);
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
/* No celular, tipo e finalidade saem da tabela em vez de ela rolar na
   horizontal: rolagem lateral escondida dentro de um card é gesto que quase
   ninguém descobre, e a coluna Status ficava fora da tela. */
@media (max-width: 519px) {
  .recent-table th:nth-child(2),
  .recent-table td:nth-child(2),
  .recent-table th:nth-child(3),
  .recent-table td:nth-child(3) {
    display: none;
  }
}
.rec-link {
  color: var(--ink);
  text-decoration: none;
  font-weight: 600;
}
.rec-link:hover {
  color: var(--brand);
}

.muted {
  color: var(--ink-soft);
  margin: 0;
}
.agenda {
  margin-bottom: 18px;
}
.agenda-ok {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--ok);
  font-weight: 600;
}
.agenda-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.agenda-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.agenda-list li:first-child {
  border-top: none;
  padding-top: 0;
}
.ag-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ag-meta {
  /* Bloco com o ícone em linha, e não flex com quebra: no celular o flex
     jogava o relógio sozinho numa linha e o texto na de baixo. */
  display: block;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.ag-meta :deep(svg) {
  width: 14px;
  height: 14px;
  vertical-align: -2px;
}
.ag-wa {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  flex: none;
  text-decoration: none;
}
.ag-more {
  margin: 10px 0 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.state-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.state-card p {
  margin: 0;
  color: var(--ink-soft);
}
.start-t {
  font-size: var(--fs-title-sm);
}
:deep(svg) {
  width: 16px;
  height: 16px;
  vertical-align: -3px;
}
.health-ok,
.health-warn {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.health-ok {
  color: var(--ok);
  font-weight: 600;
  margin: 0 0 12px;
}
.health-warn {
  color: #b45309;
  font-weight: 700;
  margin: 0 0 8px;
}
.health-ok :deep(svg),
.health-warn :deep(svg) {
  flex: none;
  margin-top: 2px;
}
.health-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.bar {
  height: 8px;
  border-radius: var(--r-pill);
  background: var(--surface);
  overflow: hidden;
  margin: 6px 0 8px;
}
.bar span {
  display: block;
  height: 100%;
  background: var(--brand);
  border-radius: var(--r-pill);
  /* Escala, não largura: animar `width` recalcula o layout a cada quadro. */
  transform-origin: left;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
@media (prefers-reduced-motion: reduce) {
  .bar span {
    transition: none;
  }
}
.health-meta {
  font-size: var(--fs-label);
  color: var(--ink-soft);
  margin-bottom: 12px;
}

.tip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 16px;
  background: var(--brand-ghost);
  border-radius: var(--r-md);
  padding: 13px 16px;
  font-size: var(--fs-ui);
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

<script setup lang="ts">
import type { Lead } from "~~/shared/models/lead";
import type { Broker } from "~~/shared/models/broker";
import type { LeadTask, LeadTaskKind } from "~~/shared/models/lead-activity";
import { LEAD_TASK_KINDS, LEAD_TASK_LABELS, agendaBucket } from "~~/shared/models/lead-activity";

/**
 * Agenda: o que cada corretor tem para fazer, de atrasado a daqui a 7 dias.
 *
 * É a tela de abrir de manhã. Atrasadas vêm primeiro e em vermelho porque são
 * o lead esfriando; "Hoje" vem em seguida; o resto da semana agrupado por dia.
 * Tarefa além de 7 dias não aparece aqui — está no histórico do contato, e
 * mostrá-la agora só empurraria o que importa hoje para baixo.
 */
definePageMeta({ layout: "admin", middleware: ["admin", "crm"] });
useHead({ title: "Agenda · Painel" });

const toast = useToast();
const route = useRoute();
const router = useRouter();

const { data: brokers } = useLazyAsyncData("admin:agenda:brokers", () => adminFetch<Broker[]>("/api/admin/brokers"), {
  server: false,
  default: () => [] as Broker[],
});
const brokerName = (id: string | null) => (id ? (brokers.value?.find((b) => b.id === id)?.name ?? "") : "");

// Filtro de corretor na URL: "a agenda da Ana" é um link que se manda.
const corretor = ref(String(route.query.corretor || ""));
watch(corretor, (v) => router.replace({ query: { ...route.query, corretor: v || undefined } }));

const {
  data: tasks,
  pending,
  error: loadError,
  refresh,
} = useLazyAsyncData(
  () => `admin:agenda:${corretor.value}`,
  () =>
    adminFetch<LeadTask[]>("/api/admin/tasks", {
      query: {
        open: "1",
        brokerId: corretor.value || undefined,
        until: new Date(Date.now() + 8 * 86400000).toISOString(),
      },
    }),
  { server: false, default: () => [] as LeadTask[], watch: [corretor] },
);

// "Agora" anda enquanto a tela está aberta: a visita das 14h vira atrasada às
// 14h01 sem precisar recarregar.
const agora = ref(new Date());
let tick: ReturnType<typeof setInterval> | null = null;
onMounted(() => (tick = setInterval(() => (agora.value = new Date()), 60000)));
onBeforeUnmount(() => tick && clearInterval(tick));

const grupos = computed(() => {
  const g = { atrasadas: [] as LeadTask[], hoje: [] as LeadTask[], proximas: [] as LeadTask[] };
  for (const t of tasks.value ?? []) {
    const b = agendaBucket(t.dueAt, agora.value);
    if (b !== "depois") g[b].push(t);
  }
  return g;
});

const fmtDiaLongo = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDiaCurto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const diaChave = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

/** Próximos dias agrupados por data, na ordem. */
const porDia = computed(() => {
  const m = new Map<string, { titulo: string; itens: LeadTask[] }>();
  for (const t of grupos.value.proximas) {
    const k = diaChave(t.dueAt);
    if (!m.has(k)) {
      const titulo = fmtDiaLongo.format(new Date(t.dueAt));
      m.set(k, { titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), itens: [] });
    }
    m.get(k)!.itens.push(t);
  }
  return [...m.values()];
});

const ICONE: Record<LeadTaskKind, string> = { visita: "pin", retorno: "call", outro: "calendar" };
const waHref = (p?: string | null) => {
  const d = (p || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
};

// ---- Ações ----
const mexendo = ref<string | null>(null);
async function atualizar(t: LeadTask, body: Record<string, unknown>, ok: string) {
  mexendo.value = t.id;
  try {
    const nova = await adminFetch<LeadTask>(`/api/admin/tasks/${t.id}`, { method: "PUT", body });
    const aberta = !nova.doneAt && !nova.canceledAt;
    tasks.value = (tasks.value ?? [])
      .map((x) => (x.id === t.id ? nova : x))
      .filter((x) => x.id !== t.id || aberta)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    toast.success(ok);
  } catch {
    toast.error("Não foi possível atualizar a tarefa.");
  } finally {
    mexendo.value = null;
  }
}
const concluir = (t: LeadTask) => atualizar(t, { done: true }, `${LEAD_TASK_LABELS[t.kind]} concluída.`);
const cancelar = (t: LeadTask) => atualizar(t, { canceled: true }, "Tarefa cancelada.");
/** Adiar um dia, mesma hora: o gesto mais comum de quem não conseguiu falar hoje. */
function adiar(t: LeadTask) {
  const base = Math.max(new Date(t.dueAt).getTime(), Date.now());
  const d = new Date(t.dueAt);
  const alvo = new Date(base + 86400000);
  alvo.setHours(d.getHours(), d.getMinutes(), 0, 0);
  atualizar(t, { dueAt: alvo.toISOString() }, `Adiada para ${fmtDiaCurto.format(alvo)}.`);
}

// ---- Nova tarefa ----
const criando = ref(false);
const salvando = ref(false);
const { data: leads } = useLazyAsyncData("admin:agenda:leads", () => adminFetch<Lead[]>("/api/admin/leads"), {
  server: false,
  default: () => [] as Lead[],
});
const leadsAtivos = computed(() =>
  (leads.value ?? []).filter((l) => l.stage !== "perdido" && l.stage !== "fechado").sort((a, b) => (a.name || "").localeCompare(b.name || "")),
);
const nova = reactive({ kind: "visita" as LeadTaskKind, title: "", leadId: "", dia: "", hora: "09:00", brokerId: "" });
function abrirNova() {
  criando.value = true;
  const amanha = new Date(Date.now() + 86400000);
  const off = amanha.getTimezoneOffset() * 60000;
  Object.assign(nova, {
    kind: "visita",
    title: "",
    leadId: "",
    dia: new Date(amanha.getTime() - off).toISOString().slice(0, 10),
    hora: "09:00",
    brokerId: corretor.value,
  });
  nextTick(() => document.getElementById("nt-titulo")?.focus());
}
async function criar() {
  if (!nova.title.trim() || !nova.dia) return;
  salvando.value = true;
  try {
    const lead = leadsAtivos.value.find((l) => l.id === nova.leadId);
    const t = await adminFetch<LeadTask>("/api/admin/tasks", {
      method: "POST",
      body: {
        kind: nova.kind,
        title: nova.title.trim(),
        leadId: nova.leadId || null,
        propertyId: nova.kind === "visita" ? (lead?.propertyId ?? null) : null,
        brokerId: nova.brokerId || null,
        dueAt: new Date(`${nova.dia}T${nova.hora || "09:00"}`).toISOString(),
      },
    });
    if (!corretor.value || t.brokerId === corretor.value) {
      tasks.value = [...(tasks.value ?? []), t].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    }
    criando.value = false;
    toast.success("Tarefa agendada.");
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    toast.error(err?.data?.statusMessage || "Não foi possível agendar.");
  } finally {
    salvando.value = false;
  }
}

const [DefineLinha, Linha] = createReusableTemplate<{ t: LeadTask; mostrarDia?: boolean }>();

const total = computed(() => grupos.value.atrasadas.length + grupos.value.hoje.length + grupos.value.proximas.length);
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Agenda</h1>
        <p class="sub">
          Visitas e retornos da semana. O que você concluir aqui fica registrado no histórico do contato.
        </p>
      </div>
      <button v-if="!criando" class="admin-btn" @click="abrirNova"><AppIcon name="plus" /> Nova tarefa</button>
    </div>

    <form v-if="criando" class="admin-card nova" @submit.prevent="criar">
      <div class="ag-seg" role="radiogroup" aria-label="Tipo de tarefa">
        <button
          v-for="k in LEAD_TASK_KINDS"
          :key="k"
          type="button"
          role="radio"
          :aria-checked="nova.kind === k"
          :class="{ on: nova.kind === k }"
          @click="nova.kind = k"
        >
          <AppIcon :name="ICONE[k]" /> {{ LEAD_TASK_LABELS[k] }}
        </button>
      </div>
      <div class="nova-grid">
        <label class="span-2">
          <span class="admin-label">O quê</span>
          <input id="nt-titulo" v-model="nova.title" class="admin-input" maxlength="200" required placeholder="Ex.: Visita ao apartamento do Centro" />
        </label>
        <label>
          <span class="admin-label">Contato</span>
          <select v-model="nova.leadId" class="admin-input">
            <option value="">Nenhum (tarefa avulsa)</option>
            <option v-for="l in leadsAtivos" :key="l.id" :value="l.id">{{ l.name || "Sem nome" }}</option>
          </select>
        </label>
        <label v-if="brokers?.length">
          <span class="admin-label">Corretor</span>
          <select v-model="nova.brokerId" class="admin-input">
            <option value="">Sem corretor definido</option>
            <option v-for="b in brokers" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </label>
        <label>
          <span class="admin-label">Dia</span>
          <input v-model="nova.dia" class="admin-input" type="date" required />
        </label>
        <label>
          <span class="admin-label">Hora</span>
          <input v-model="nova.hora" class="admin-input" type="time" step="900" />
        </label>
      </div>
      <div class="nova-actions">
        <button class="admin-btn" :disabled="salvando || !nova.title.trim() || !nova.dia">
          {{ salvando ? "Agendando..." : "Agendar" }}
        </button>
        <button type="button" class="admin-btn ghost" @click="criando = false">Cancelar</button>
      </div>
    </form>

    <div class="toolbar">
      <label class="filtro">
        <span class="sr-only">Corretor</span>
        <select v-model="corretor" class="admin-input" aria-label="Filtrar por corretor">
          <option value="">Todos os corretores</option>
          <option v-for="b in brokers" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </label>
      <p v-if="!pending && !loadError && total" class="resumo" aria-live="polite">
        <strong v-if="grupos.atrasadas.length" class="r-late">{{ grupos.atrasadas.length }} atrasada{{ grupos.atrasadas.length > 1 ? "s" : "" }}</strong>
        <span v-if="grupos.atrasadas.length"> · </span>
        <span>{{ grupos.hoje.length }} para hoje</span>
        <span> · {{ grupos.proximas.length }} nos próximos dias</span>
      </p>
    </div>

    <div v-if="pending && !tasks?.length" class="skel" aria-busy="true" aria-label="Carregando agenda">
      <span v-for="i in 4" :key="i" class="skel-row" />
    </div>
    <div v-else-if="loadError" class="admin-card estado" role="alert">
      <p>Não foi possível carregar a agenda. Verifique a conexão.</p>
      <button type="button" class="admin-btn" @click="refresh()">Tentar de novo</button>
    </div>
    <div v-else-if="!total" class="admin-card estado">
      <AppIcon name="calendar" class="estado-ico" />
      <p class="estado-t">Semana livre{{ corretor ? ` para ${brokerName(corretor)}` : "" }}.</p>
      <p class="estado-d">
        Visitas e retornos entram aqui quando você agenda um próximo passo no contato, ou pelo botão
        <strong>Nova tarefa</strong>.
      </p>
      <NuxtLink to="/admin/leads" class="admin-btn ghost">Ir para Contatos</NuxtLink>
    </div>

    <template v-else>
      <section v-if="grupos.atrasadas.length" class="grupo late" aria-labelledby="g-late">
        <h2 id="g-late">Atrasadas</h2>
        <ul class="linhas">
          <li v-for="t in grupos.atrasadas" :key="t.id"><Linha :t="t" mostrar-dia /></li>
        </ul>
      </section>

      <section class="grupo" aria-labelledby="g-hoje">
        <h2 id="g-hoje">Hoje</h2>
        <ul v-if="grupos.hoje.length" class="linhas">
          <li v-for="t in grupos.hoje" :key="t.id"><Linha :t="t" /></li>
        </ul>
        <p v-else class="vazio">Nada marcado para hoje.</p>
      </section>

      <section v-for="d in porDia" :key="d.titulo" class="grupo" :aria-label="d.titulo">
        <h2>{{ d.titulo }}</h2>
        <ul class="linhas">
          <li v-for="t in d.itens" :key="t.id"><Linha :t="t" /></li>
        </ul>
      </section>
    </template>

    <DefineLinha v-slot="{ t, mostrarDia }">
      <div class="linha" :class="{ busy: mexendo === t.id }">
        <input
          :id="`ag-${t.id}`"
          type="checkbox"
          class="check"
          :disabled="mexendo === t.id"
          :aria-label="`Concluir: ${t.title}`"
          @change="concluir(t)"
        />
        <time class="hora" :datetime="t.dueAt">
          <small v-if="mostrarDia">{{ fmtDiaCurto.format(new Date(t.dueAt)) }}</small>
          {{ fmtHora.format(new Date(t.dueAt)) }}
        </time>
        <span class="tipo" :class="`k-${t.kind}`" :title="LEAD_TASK_LABELS[t.kind]">
          <AppIcon :name="ICONE[t.kind]" />
          <span class="sr-only">{{ LEAD_TASK_LABELS[t.kind] }}</span>
        </span>
        <div class="corpo">
          <label :for="`ag-${t.id}`" class="titulo">{{ t.title }}</label>
          <p v-if="t.leadId || t.property || brokerName(t.brokerId)" class="meta">
            <NuxtLink v-if="t.leadId" :to="`/admin/leads?lead=${t.leadId}`" class="quem">{{ t.lead?.name || "Contato" }}</NuxtLink>
            <span v-for="(parte, i) in [t.property?.code, brokerName(t.brokerId)].filter(Boolean)" :key="i"
              ><template v-if="t.leadId || i > 0"> · </template>{{ parte }}</span
            >
          </p>
        </div>
        <div class="acoes">
          <a
            v-if="waHref(t.lead?.phone)"
            class="acao wa"
            :href="waHref(t.lead?.phone)"
            target="_blank"
            rel="noopener"
            :aria-label="`WhatsApp de ${t.lead?.name || 'contato'}`"
            title="WhatsApp"
          ><AppIcon name="wa" /></a>
          <button type="button" class="acao txt" :disabled="mexendo === t.id" @click="adiar(t)">Adiar 1 dia</button>
          <button
            type="button"
            class="acao"
            :disabled="mexendo === t.id"
            :aria-label="`Cancelar: ${t.title}`"
            title="Cancelar tarefa"
            @click="cancelar(t)"
          ><AppIcon name="close" /></button>
        </div>
      </div>
    </DefineLinha>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.page-head .admin-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.page-head .admin-btn :deep(svg) {
  width: 16px;
  height: 16px;
}
.sub {
  color: var(--ink-soft);
  margin: 4px 0 0;
  font-size: var(--fs-ui);
  max-width: 60ch;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Nova tarefa */
.nova {
  margin-bottom: 18px;
}
.ag-seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}
.ag-seg button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1.5px solid var(--line-2);
  background: var(--paper);
  color: var(--ink-soft);
  border-radius: var(--r-pill);
  padding: 6px 12px;
  font-size: var(--fs-label);
  font-weight: 600;
  cursor: pointer;
}
.ag-seg button.on {
  background: var(--brand-ghost);
  border-color: color-mix(in srgb, var(--brand) 45%, transparent);
  color: var(--brand);
}
.ag-seg button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.ag-seg :deep(svg) {
  width: 14px;
  height: 14px;
}
.nova-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 640px) {
  .nova-grid {
    grid-template-columns: 1fr 1fr;
  }
  .span-2 {
    grid-column: 1 / -1;
  }
}
.nova-grid label {
  display: block;
  min-width: 0;
}
.nova-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

/* Barra */
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 16px;
  margin-bottom: 18px;
}
.filtro .admin-input {
  width: auto;
  min-width: 220px;
  font-size: var(--fs-ui);
  padding: 8px 12px;
}
.resumo {
  margin: 0;
  font-size: var(--fs-ui);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.r-late {
  color: #9f2d2d;
}

/* Grupos */
.grupo {
  margin-bottom: 22px;
}
.grupo h2 {
  margin: 0 0 8px;
  font-family: var(--font-display);
  font-size: var(--fs-ui);
  font-weight: 700;
  color: var(--ink);
}
.grupo.late h2 {
  color: #9f2d2d;
}
.vazio {
  margin: 0;
  padding: 12px 14px;
  font-size: var(--fs-ui);
  color: var(--ink-soft);
  background: var(--paper);
  border: 1px dashed var(--line-2);
  border-radius: var(--r-md);
}
.linhas {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--paper);
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  overflow: hidden;
}
.linhas > li + li {
  border-top: 1px solid var(--line);
}
.late .linhas {
  border-color: #e5b8b8;
  background: #fffafa;
}

.linha {
  display: grid;
  grid-template-columns: auto 58px auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 14px;
  transition: opacity 0.15s ease-out;
}
.linha.busy {
  opacity: 0.5;
}
.check {
  width: 20px;
  height: 20px;
  accent-color: var(--brand);
  cursor: pointer;
}
.check:focus-visible,
.acao:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.hora {
  display: flex;
  flex-direction: column;
  font-weight: 700;
  font-size: var(--fs-ui);
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  line-height: 1.2;
}
.hora small {
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #9f2d2d;
}
.tipo {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surface);
  color: var(--ink-soft);
}
.tipo.k-visita {
  background: var(--brand-ghost);
  color: var(--brand);
}
.tipo :deep(svg) {
  width: 15px;
  height: 15px;
}
.corpo {
  min-width: 0;
}
.titulo {
  display: block;
  font-weight: 600;
  font-size: var(--fs-ui);
  cursor: pointer;
  overflow-wrap: anywhere;
}
.meta {
  margin: 1px 0 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.quem {
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.quem:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.acoes {
  display: flex;
  align-items: center;
  gap: 2px;
}
.acao {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  color: var(--ink-soft);
  font: inherit;
  font-size: var(--fs-label);
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.acao:hover {
  background: var(--surface);
  color: var(--ink);
}
.acao.wa {
  color: var(--brand);
}
.acao :deep(svg) {
  width: 17px;
  height: 17px;
}

/* Toque: 44px de alvo, mesmo com o desenho menor (a caixa de seleção). */
@media (pointer: coarse) {
  .acao {
    min-width: 44px;
    height: 44px;
  }
  .check {
    width: 24px;
    height: 24px;
  }
}

/* No celular a linha quebra: ações descem para baixo do texto. */
@media (max-width: 640px) {
  .linha {
    grid-template-columns: auto 50px 1fr;
    grid-template-areas: "check hora corpo" ". . acoes";
    row-gap: 4px;
  }
  .check {
    grid-area: check;
  }
  .hora {
    grid-area: hora;
  }
  .tipo {
    display: none;
  }
  .corpo {
    grid-area: corpo;
  }
  .acoes {
    grid-area: acoes;
    justify-content: flex-start;
    margin-left: -8px;
  }
  .filtro,
  .filtro .admin-input {
    width: 100%;
    min-width: 0;
  }
}

/* Estados */
.estado {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.estado p {
  margin: 0;
}
.estado-ico {
  width: 28px;
  height: 28px;
  color: var(--brand);
}
.estado-t {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--fs-body);
}
.estado-d {
  color: var(--ink-soft);
  font-size: var(--fs-ui);
  max-width: 56ch;
}
.estado .admin-btn {
  margin-top: 4px;
  text-decoration: none;
}
.skel {
  display: grid;
  gap: 8px;
}
.skel-row {
  display: block;
  height: 56px;
  border-radius: var(--r-md);
  background: linear-gradient(90deg, var(--paper), var(--line), var(--paper));
  background-size: 200% 100%;
  animation: skel 1.2s ease-in-out infinite;
}
@keyframes skel {
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skel-row {
    animation: none;
  }
}
</style>

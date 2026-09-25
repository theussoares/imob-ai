<script setup lang="ts">
import type { Lead } from "~~/shared/models/lead";
import type { Broker } from "~~/shared/models/broker";
import type {
  LeadEvent,
  LeadEventKind,
  LeadManualEventKind,
  LeadTask,
  LeadTaskKind,
} from "~~/shared/models/lead-activity";
import {
  LEAD_EVENT_LABELS,
  LEAD_MANUAL_EVENT_KINDS,
  LEAD_TASK_KINDS,
  LEAD_TASK_LABELS,
} from "~~/shared/models/lead-activity";
import { LEAD_SOURCE_LABELS } from "~~/shared/models/lead";

/**
 * Próximos passos e histórico de UM contato, dentro do painel de detalhes.
 *
 * Substitui o campo "Anotações" e a data única de "Próximo retorno" (0049):
 * o texto livre era sobrescrito a cada edição, e uma data só não comportava a
 * visita de quinta com a Ana e o retorno de sexta com o Pedro.
 *
 * O histórico aqui não se edita nem se apaga — o banco nem aceita (0049).
 * Anotação errada se corrige com outra, e a tela diz isso em vez de oferecer
 * um lápis que não funcionaria.
 */
const props = defineProps<{ lead: Lead; brokers: Broker[] }>();
const emit = defineEmits<{ changed: [] }>();

const toast = useToast();
const { nameFor } = useMemberNames();

const ICONE: Record<LeadEventKind, string> = {
  nota: "notes",
  ligacao: "call",
  whatsapp: "wa",
  email: "mail",
  visita: "pin",
  etapa: "etapa",
  atribuicao: "atribuicao",
  tarefa: "check",
};
const ICONE_TAREFA: Record<LeadTaskKind, string> = { visita: "pin", retorno: "call", outro: "calendar" };

// ---- Carga ----
const events = ref<LeadEvent[]>([]);
const tasks = ref<LeadTask[]>([]);
const loading = ref(true);
const loadError = ref(false);

async function load() {
  loadError.value = false;
  try {
    const [ev, tk] = await Promise.all([
      adminFetch<LeadEvent[]>(`/api/admin/leads/${props.lead.id}/events`),
      adminFetch<LeadTask[]>(`/api/admin/tasks`, { query: { leadId: props.lead.id, open: "1" } }),
    ]);
    events.value = ev;
    tasks.value = tk;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// O painel pai recebe o lead atualizado (etapa, responsável) pelo PUT ou pelo
// tempo real; a mudança já gerou evento no servidor, então relê o histórico.
watch(
  () => [props.lead.stage, props.lead.brokerId],
  () => load(),
);

// ---- Registrar atendimento ----
const kind = ref<LeadManualEventKind>("nota");
const texto = ref("");
const posting = ref(false);
const PLACEHOLDER: Record<LeadManualEventKind, string> = {
  nota: "O que você sabe agora sobre este contato",
  ligacao: "Como foi a ligação? Atendeu, o que pediu?",
  whatsapp: "O que foi conversado no WhatsApp",
  email: "O que foi enviado ou respondido",
  visita: "Como foi a visita? O que gostou, o que pesou contra",
};

async function registrar() {
  const body = texto.value.trim();
  if (!body || posting.value) return;
  posting.value = true;
  try {
    const criado = await adminFetch<LeadEvent>(`/api/admin/leads/${props.lead.id}/events`, {
      method: "POST",
      body: { kind: kind.value, body },
    });
    events.value = [criado, ...events.value];
    texto.value = "";
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    toast.error(err?.data?.statusMessage || "Não foi possível registrar. Tente de novo.");
  } finally {
    posting.value = false;
  }
}
useUnsavedGuard(() => !!texto.value.trim());

// ---- Agendar ----
const agendando = ref(false);
const nova = reactive({ kind: "retorno" as LeadTaskKind, title: "", dia: "", hora: "09:00", brokerId: "" });
const salvandoTarefa = ref(false);

function tituloPadrao(k: LeadTaskKind) {
  if (k === "visita") return props.lead.property ? `Visita ao ${props.lead.property.code}` : "Visita ao imóvel";
  if (k === "retorno") return "Retornar contato";
  return "";
}
function abrirAgenda() {
  agendando.value = true;
  const amanha = new Date(Date.now() + 86400000);
  nova.kind = "retorno";
  nova.title = tituloPadrao("retorno");
  nova.dia = dataLocal(amanha);
  nova.hora = "09:00";
  nova.brokerId = props.lead.brokerId || "";
}
watch(
  () => nova.kind,
  (k, antes) => {
    // Só troca o título se ele ainda é o sugerido — não apaga o que a pessoa escreveu.
    if (!nova.title || nova.title === tituloPadrao(antes)) nova.title = tituloPadrao(k);
  },
);

async function agendar() {
  if (!nova.title.trim() || !nova.dia) return;
  salvandoTarefa.value = true;
  try {
    // Dia e hora do fuso de quem está no painel: `new Date('AAAA-MM-DDTHH:mm')`
    // sem "Z" é hora local, que é o que a pessoa digitou.
    const dueAt = new Date(`${nova.dia}T${nova.hora || "09:00"}`).toISOString();
    const t = await adminFetch<LeadTask>("/api/admin/tasks", {
      method: "POST",
      body: {
        leadId: props.lead.id,
        propertyId: nova.kind === "visita" ? props.lead.propertyId : null,
        brokerId: nova.brokerId || null,
        kind: nova.kind,
        title: nova.title.trim(),
        dueAt,
      },
    });
    tasks.value = [...tasks.value, t].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    agendando.value = false;
    emit("changed");
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    toast.error(err?.data?.statusMessage || "Não foi possível agendar.");
  } finally {
    salvandoTarefa.value = false;
  }
}

const mexendo = ref<string | null>(null);
async function concluir(t: LeadTask, done: boolean) {
  mexendo.value = t.id;
  try {
    await adminFetch<LeadTask>(`/api/admin/tasks/${t.id}`, { method: "PUT", body: done ? { done: true } : { canceled: true } });
    tasks.value = tasks.value.filter((x) => x.id !== t.id);
    if (done) {
      toast.success(`${LEAD_TASK_LABELS[t.kind]} concluída.`);
      await load(); // o servidor gravou o evento "tarefa concluída"
    }
    emit("changed");
  } catch {
    toast.error("Não foi possível atualizar a tarefa.");
  } finally {
    mexendo.value = null;
  }
}

// ---- Formatação ----
function dataLocal(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}
const fmtDia = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
function quandoTarefa(iso: string) {
  const d = new Date(iso);
  return `${fmtDia.format(d).replace(".", "")}, ${fmtHora.format(d)}`;
}
const atrasada = (t: LeadTask) => new Date(t.dueAt).getTime() < Date.now();
function quandoEvento(iso: string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + ` às ${fmtHora.format(d)}`;
}
const brokerName = (id: string | null) => (id ? props.brokers.find((b) => b.id === id)?.name ?? "" : "");
function autor(e: LeadEvent) {
  if (e.meta?.via === "roleta") return "Roleta";
  return nameFor(e.createdBy) || (e.createdBy ? "" : "Sistema");
}
</script>

<template>
  <div class="tl">
    <!-- Próximos passos -->
    <section class="tl-block" :aria-labelledby="`tl-passos-${lead.id}`">
      <header class="tl-head">
        <h4 :id="`tl-passos-${lead.id}`">Próximos passos</h4>
        <button v-if="!agendando" type="button" class="admin-btn ghost sm tl-add" @click="abrirAgenda">
          <AppIcon name="plus" /> Agendar
        </button>
      </header>

      <form v-if="agendando" class="tl-form" @submit.prevent="agendar">
        <div class="tl-seg" role="radiogroup" aria-label="Tipo de tarefa">
          <button
            v-for="k in LEAD_TASK_KINDS"
            :key="k"
            type="button"
            role="radio"
            :aria-checked="nova.kind === k"
            :class="{ on: nova.kind === k }"
            @click="nova.kind = k"
          >
            <AppIcon :name="ICONE_TAREFA[k]" /> {{ LEAD_TASK_LABELS[k] }}
          </button>
        </div>
        <div class="tl-grid">
          <label class="span-2">
            <span class="admin-label">O quê</span>
            <input v-model="nova.title" class="admin-input" maxlength="200" required />
          </label>
          <label>
            <span class="admin-label">Dia</span>
            <input v-model="nova.dia" class="admin-input" type="date" required />
          </label>
          <label>
            <span class="admin-label">Hora</span>
            <input v-model="nova.hora" class="admin-input" type="time" step="900" />
          </label>
          <label v-if="brokers.length" class="span-2">
            <span class="admin-label">Com quem</span>
            <select v-model="nova.brokerId" class="admin-input">
              <option value="">Sem corretor definido</option>
              <option v-for="b in brokers" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </label>
        </div>
        <div class="tl-actions">
          <button class="admin-btn sm" :disabled="salvandoTarefa || !nova.title.trim() || !nova.dia">
            {{ salvandoTarefa ? "Agendando..." : "Agendar" }}
          </button>
          <button type="button" class="admin-btn ghost sm" @click="agendando = false">Cancelar</button>
        </div>
      </form>

      <ul v-if="tasks.length" class="tasks">
        <li v-for="t in tasks" :key="t.id" class="task" :class="{ late: atrasada(t) }">
          <input
            :id="`tk-${t.id}`"
            type="checkbox"
            class="task-check"
            :disabled="mexendo === t.id"
            :aria-label="`Concluir: ${t.title}`"
            @change="concluir(t, true)"
          />
          <label :for="`tk-${t.id}`" class="task-body">
            <span class="task-title">{{ t.title }}</span>
            <span class="task-meta">
              <time :datetime="t.dueAt">{{ quandoTarefa(t.dueAt) }}</time><template v-if="atrasada(t)">, atrasada</template>
              <template v-if="brokerName(t.brokerId)"> · {{ brokerName(t.brokerId) }}</template>
            </span>
          </label>
          <button
            type="button"
            class="icon-btn"
            :disabled="mexendo === t.id"
            :aria-label="`Cancelar: ${t.title}`"
            title="Cancelar tarefa"
            @click="concluir(t, false)"
          >
            <AppIcon name="close" />
          </button>
        </li>
      </ul>
      <p v-else-if="!loading && !agendando" class="tl-empty">
        Nada agendado. Todo contato em andamento deveria ter um próximo passo com data.
      </p>
    </section>

    <!-- Histórico -->
    <section class="tl-block" :aria-labelledby="`tl-hist-${lead.id}`">
      <header class="tl-head">
        <h4 :id="`tl-hist-${lead.id}`">Histórico</h4>
      </header>

      <div class="composer">
        <div class="tl-seg" role="radiogroup" aria-label="Tipo de registro">
          <button
            v-for="k in LEAD_MANUAL_EVENT_KINDS"
            :key="k"
            type="button"
            role="radio"
            :aria-checked="kind === k"
            :class="{ on: kind === k }"
            @click="kind = k"
          >
            <AppIcon :name="ICONE[k]" /> {{ LEAD_EVENT_LABELS[k] }}
          </button>
        </div>
        <textarea
          v-model="texto"
          class="admin-textarea"
          rows="2"
          maxlength="4000"
          :placeholder="PLACEHOLDER[kind]"
          :aria-label="`${LEAD_EVENT_LABELS[kind]}: o que aconteceu`"
          @keydown.enter.meta.prevent="registrar"
          @keydown.enter.ctrl.prevent="registrar"
        />
        <div class="tl-actions">
          <button type="button" class="admin-btn sm" :disabled="posting || !texto.trim()" @click="registrar">
            {{ posting ? "Registrando..." : "Registrar" }}
          </button>
          <small class="tl-hint">O histórico não se edita: para corrigir, registre de novo.</small>
        </div>
      </div>

      <div v-if="loading" class="skel" aria-busy="true" aria-label="Carregando histórico">
        <span v-for="i in 3" :key="i" class="skel-row" />
      </div>
      <div v-else-if="loadError" class="tl-err" role="alert">
        Não foi possível carregar o histórico.
        <button type="button" class="link-btn" @click="load">Tentar de novo</button>
      </div>
      <ol v-else class="events">
        <li v-for="e in events" :key="e.id" class="ev" :class="`k-${e.kind}`">
          <span class="ev-dot" aria-hidden="true"><AppIcon :name="ICONE[e.kind]" /></span>
          <div class="ev-main">
            <p class="ev-line">
              <strong>{{ LEAD_EVENT_LABELS[e.kind] }}</strong>
              <span class="ev-when">
                <time :datetime="e.occurredAt" :title="new Date(e.occurredAt).toLocaleString('pt-BR')">{{ quandoEvento(e.occurredAt) }}</time>
                <template v-if="autor(e)"> · {{ autor(e) }}</template>
              </span>
            </p>
            <p v-if="e.body" class="ev-body">{{ e.body }}</p>
          </div>
        </li>

        <!-- Anotação do campo antigo (antes da 0049): só leitura, no lugar dela na história. -->
        <li v-if="lead.notes" class="ev k-legado">
          <span class="ev-dot" aria-hidden="true"><AppIcon name="notes" /></span>
          <div class="ev-main">
            <p class="ev-line"><strong>Anotação anterior</strong></p>
            <p class="ev-body">{{ lead.notes }}</p>
          </div>
        </li>

        <li class="ev k-origem">
          <span class="ev-dot" aria-hidden="true"><AppIcon name="inbox" /></span>
          <div class="ev-main">
            <p class="ev-line">
              <strong>Contato recebido</strong>
              <span class="ev-when">
                <time :datetime="lead.createdAt">{{ quandoEvento(lead.createdAt) }}</time>
                · {{ LEAD_SOURCE_LABELS[lead.source] }}
              </span>
            </p>
            <p v-if="lead.message" class="ev-body">“{{ lead.message }}”</p>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.tl {
  display: grid;
  gap: 18px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
.tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.tl-head h4 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-ui);
  font-weight: 700;
  color: var(--ink);
}
.tl-add :deep(svg) {
  width: 14px;
  height: 14px;
  vertical-align: -2px;
}
.tl-empty,
.tl-hint {
  color: var(--ink-soft);
  font-size: var(--fs-label);
  margin: 0;
}
.tl-err {
  font-size: var(--fs-label);
  color: #b91c1c;
}

/* Segmentado: os tipos são poucos e fixos, e ver todos de uma vez ensina o
   que dá para registrar — um <select> esconderia isso atrás de um clique. */
.tl-seg {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.tl-seg button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1.5px solid var(--line-2);
  background: var(--paper);
  color: var(--ink-soft);
  border-radius: var(--r-pill);
  padding: 5px 11px;
  font-size: var(--fs-label);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease-out, color 0.15s ease-out, border-color 0.15s ease-out;
}
.tl-seg button:hover {
  color: var(--ink);
  border-color: var(--line);
}
.tl-seg button.on {
  background: var(--brand-ghost);
  border-color: color-mix(in srgb, var(--brand) 45%, transparent);
  color: var(--brand);
}
.tl-seg button:focus-visible,
.icon-btn:focus-visible,
.task-check:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.tl-seg :deep(svg) {
  width: 14px;
  height: 14px;
}

.tl-form {
  padding: 12px;
  margin-bottom: 10px;
  border-radius: var(--r-md);
  background: var(--surface);
}
.tl-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.tl-grid label {
  display: block;
  min-width: 0;
}
.span-2 {
  grid-column: 1 / -1;
}
.tl-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

/* Tarefas */
.tasks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.task {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r-md);
  background: var(--surface);
}
.task.late {
  background: #fbf0ef;
}
.task-check {
  width: 18px;
  height: 18px;
  flex: none;
  accent-color: var(--brand);
  cursor: pointer;
}
.task-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}
.task-title {
  font-weight: 600;
  font-size: var(--fs-ui);
  overflow-wrap: anywhere;
}
.task-meta {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.task.late .task-meta {
  color: #9f2d2d;
  font-weight: 600;
}
.icon-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  color: var(--ink-soft);
  cursor: pointer;
}
.icon-btn:hover {
  background: var(--paper);
  color: #b91c1c;
}
.icon-btn :deep(svg) {
  width: 16px;
  height: 16px;
}

/* Composer */
.composer {
  margin-bottom: 14px;
}

/* Linha do tempo: o fio vertical liga os pontos — é a leitura "um depois do
   outro" que uma pilha de caixas não dá. */
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  position: relative;
}
.events::before {
  content: "";
  position: absolute;
  left: 13px;
  top: 6px;
  bottom: 6px;
  width: 1px;
  background: var(--line);
}
.ev {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 14px;
}
.ev:last-child {
  padding-bottom: 0;
}
.ev-dot {
  flex: none;
  position: relative;
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: var(--paper);
  border: 1px solid var(--line-2);
  color: var(--ink-soft);
}
.ev-dot :deep(svg) {
  width: 14px;
  height: 14px;
}
.k-etapa .ev-dot,
.k-atribuicao .ev-dot {
  background: var(--brand-ghost);
  border-color: transparent;
  color: var(--brand);
}
.k-tarefa .ev-dot {
  background: #e8f4ec;
  border-color: transparent;
  color: #17683a;
}
.k-whatsapp .ev-dot {
  color: var(--brand);
}
@media (pointer: coarse) {
  .icon-btn {
    width: 44px;
    height: 44px;
  }
  .task-check {
    width: 24px;
    height: 24px;
  }
}
.ev-main {
  min-width: 0;
  flex: 1;
  padding-top: 3px;
}
.ev-line {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  font-size: var(--fs-label);
}
.ev-when {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
  font-variant-numeric: tabular-nums;
}
.ev-body {
  margin: 3px 0 0;
  font-size: var(--fs-ui);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 70ch;
}
.k-legado .ev-body,
.k-origem .ev-body {
  color: var(--ink-soft);
}

.skel {
  display: grid;
  gap: 10px;
}
.skel-row {
  display: block;
  height: 34px;
  border-radius: var(--r-sm);
  background: linear-gradient(90deg, var(--surface), var(--line), var(--surface));
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
  .tl-seg button {
    transition: none;
  }
}
</style>

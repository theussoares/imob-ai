<script setup lang="ts">
import type {
  Lead,
  LeadStage,
  LeadType,
  LeadCreateInput,
} from "~~/shared/models/lead";
import type { Broker } from "~~/shared/models/broker";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_TYPES,
  LEAD_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
} from "~~/shared/models/lead";

definePageMeta({ layout: "admin", middleware: "admin" });

const {
  data: leads,
  pending,
  refresh,
} = await useAsyncData(
  "admin:leads",
  () => adminFetch<Lead[]>("/api/admin/leads"),
  { server: false, default: () => [] as Lead[] },
);

// Corretores para atribuir o responsável (opcional, carregado sob demanda).
const { data: brokers } = useLazyAsyncData(
  "admin:leads:brokers",
  () => adminFetch<Broker[]>("/api/admin/brokers"),
  { server: false, default: () => [] as Broker[] },
);
const brokerName = (id: string | null) =>
  id ? (brokers.value?.find((b) => b.id === id)?.name ?? "") : "";

const view = ref<"funil" | "lista">("funil");
const showLost = ref(false);

// Filtro por tipo. Vale para o quadro E para os contadores: um resumo que
// ignora o filtro faria os números contradizerem as colunas na tela.
const typeFilter = ref<LeadType | "todos">("todos");
const allLeads = computed(() => leads.value ?? []);
const typeCounts = computed(() => {
  const c = Object.fromEntries(LEAD_TYPES.map((t) => [t, 0])) as Record<
    LeadType,
    number
  >;
  for (const l of allLeads.value) c[l.leadType] = (c[l.leadType] ?? 0) + 1;
  return c;
});
const list = computed(() =>
  typeFilter.value === "todos"
    ? allLeads.value
    : allLeads.value.filter((l) => l.leadType === typeFilter.value),
);

function isActive(l: Lead) {
  return l.stage !== "perdido" && l.stage !== "fechado";
}
function isOverdue(l: Lead) {
  return (
    !!l.nextContactAt &&
    isActive(l) &&
    new Date(l.nextContactAt).getTime() <= Date.now()
  );
}

// Dentro de cada coluna: retornos vencidos primeiro (mais atrasado no topo),
// depois com retorno agendado, e por fim os mais recentes.
function sortColumn(a: Lead, b: Lead) {
  const ao = isOverdue(a),
    bo = isOverdue(b);
  if (ao !== bo) return ao ? -1 : 1;
  if (a.nextContactAt && b.nextContactAt) {
    return (
      new Date(a.nextContactAt).getTime() - new Date(b.nextContactAt).getTime()
    );
  }
  if (a.nextContactAt !== b.nextContactAt) return a.nextContactAt ? -1 : 1;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

const byStage = computed<Record<LeadStage, Lead[]>>(() => {
  const map = {
    novo: [],
    contato: [],
    visita: [],
    proposta: [],
    fechado: [],
    perdido: [],
  } as Record<LeadStage, Lead[]>;
  for (const l of list.value) (map[l.stage] ?? map.novo).push(l);
  for (const s of LEAD_STAGES) map[s].sort(sortColumn);
  return map;
});
const lostLeads = computed(() =>
  byStage.value.perdido.slice().sort(sortColumn),
);

const summary = computed(() => {
  const l = list.value;
  return {
    novos: l.filter((x) => x.stage === "novo").length,
    atrasados: l.filter(isOverdue).length,
    andamento: l.filter((x) =>
      ["contato", "visita", "proposta"].includes(x.stage),
    ).length,
    fechados: l.filter((x) => x.stage === "fechado").length,
  };
});

// ---- Mutations (otimistas: mexe local e confirma no servidor) ----
const busy = ref<string | null>(null);

// Reatribui a lista (não muta índice/propriedade): a ref do useAsyncData não é
// reativa em profundidade, então só a reatribuição atualiza funil e contadores.
async function patchLead(
  id: string,
  body: Partial<Lead> & { nextContactAt?: string | null },
) {
  busy.value = id;
  try {
    const updated = await adminFetch<Lead>(`/api/admin/leads/${id}`, {
      method: "PUT",
      body,
    });
    if (leads.value)
      leads.value = leads.value.map((x) => (x.id === id ? updated : x));
  } catch {
    await refresh(); // desfaz o otimista voltando ao estado do servidor
    alert("Não foi possível salvar. Tente de novo.");
  } finally {
    busy.value = null;
  }
}

function move(l: Lead, stage: LeadStage) {
  if (l.stage === stage) return;
  if (leads.value)
    leads.value = leads.value.map((x) => (x.id === l.id ? { ...x, stage } : x)); // otimista
  patchLead(l.id, { stage });
}

async function remove(l: Lead) {
  if (
    !confirm(`Excluir o contato ${l.name || "sem nome"}? Esta ação não volta.`)
  )
    return;
  try {
    await adminFetch(`/api/admin/leads/${l.id}`, { method: "DELETE" });
    if (leads.value) leads.value = leads.value.filter((x) => x.id !== l.id);
    if (editingId.value === l.id) editingId.value = null;
  } catch {
    alert("Não foi possível excluir.");
  }
}

// ---- Drag & drop (desktop) ----
const dragId = ref<string | null>(null);
function onDrop(stage: LeadStage) {
  const id = dragId.value;
  dragId.value = null;
  const l = list.value.find((x) => x.id === id);
  if (l) move(l, stage);
}

// ---- Editor inline ----
const editingId = ref<string | null>(null);
const edit = reactive({
  name: "",
  phone: "",
  notes: "",
  nextContactAt: "",
  brokerId: "",
  leadType: "indefinido" as LeadType,
});
function openEditor(l: Lead) {
  editingId.value = editingId.value === l.id ? null : l.id;
  if (editingId.value) {
    edit.name = l.name || "";
    edit.phone = l.phone || "";
    edit.notes = l.notes || "";
    edit.nextContactAt = dateToInput(l.nextContactAt);
    edit.brokerId = l.brokerId || "";
    edit.leadType = l.leadType;
  }
}
async function saveEditor(l: Lead) {
  await patchLead(l.id, {
    name: edit.name.trim() || null,
    phone: edit.phone.trim() || null,
    notes: edit.notes.trim() || null,
    nextContactAt: inputToIso(edit.nextContactAt),
    brokerId: edit.brokerId || null,
    leadType: edit.leadType,
  });
  editingId.value = null;
}

// ---- Novo contato manual ----
const showNew = ref(false);
const saving = ref(false);
const newErr = ref("");
const newForm = reactive<LeadCreateInput>({
  name: "",
  phone: "",
  message: "",
  stage: "novo",
  leadType: "indefinido",
  nextContactAt: "",
  brokerId: "",
});
function resetNew() {
  Object.assign(newForm, {
    name: "",
    phone: "",
    message: "",
    stage: "novo",
    leadType: "indefinido",
    nextContactAt: "",
    brokerId: "",
  });
  newErr.value = "";
}
async function createNew() {
  if (!newForm.name.trim()) {
    newErr.value = "Informe ao menos o nome.";
    return;
  }
  saving.value = true;
  newErr.value = "";
  try {
    const created = await adminFetch<Lead>("/api/admin/leads", {
      method: "POST",
      body: {
        name: newForm.name.trim(),
        phone: (newForm.phone || "").trim() || null,
        message: (newForm.message || "").trim() || null,
        stage: newForm.stage,
        leadType: newForm.leadType,
        nextContactAt: inputToIso(newForm.nextContactAt || ""),
        brokerId: newForm.brokerId || null,
        source: "manual",
      },
    });
    if (leads.value) leads.value = [created, ...leads.value];
    resetNew();
    showNew.value = false;
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    newErr.value = err?.data?.statusMessage || "Não foi possível salvar.";
  } finally {
    saving.value = false;
  }
}

// ---- Helpers ----
function waHref(phone?: string | null) {
  const d = (phone || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : "";
}
function whenLabel(iso: string) {
  const then = new Date(iso);
  const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "ontem";
  if (diffD < 7) return `há ${diffD} dias`;
  return then.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
function returnLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 86400000);
  const date = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  if (days < 0) return `retorno atrasado (${date})`;
  if (days === 0) return `retornar hoje`;
  if (days === 1) return `retornar amanhã (${date})`;
  return `retornar ${date}`;
}
// timestamptz <-> <input type="date">. Ancora ao meio-dia local pra não pular
// de dia por causa de fuso ao converter para ISO.
function dateToInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}
function inputToIso(day: string): string | null {
  if (!day) return null;
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

useHead({ title: "Contatos · Painel" });
</script>

<template>
  <div>
    <div class="page-head">
      <div>
        <h1>Contatos</h1>
        <p class="sub">
          Seu funil de atendimento. Mova o contato conforme ele avança e agende
          o próximo retorno.
        </p>
      </div>
      <button class="admin-btn" @click="showNew = !showNew">
        {{ showNew ? "Fechar" : "+ Novo contato" }}
      </button>
    </div>

    <!-- Novo contato manual -->
    <div v-if="showNew" class="admin-card new-card">
      <h3 class="section-t">Novo contato</h3>
      <p class="hint">
        Registre aqui o lead que chegou por WhatsApp, indicação ou ligação —
        assim ele não se perde.
      </p>
      <div class="new-grid">
        <div>
          <label class="admin-label">Nome *</label>
          <input
            v-model="newForm.name"
            class="admin-input"
            placeholder="Nome do interessado"
          />
        </div>
        <div>
          <label class="admin-label">WhatsApp / telefone</label>
          <input
            v-model="newForm.phone"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="(67) 99999-9999"
          />
        </div>
        <div>
          <label class="admin-label">Tipo de contato</label>
          <select v-model="newForm.leadType" class="admin-input">
            <option v-for="t in LEAD_TYPES" :key="t" :value="t">
              {{ LEAD_TYPE_LABELS[t] }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label">Etapa</label>
          <select v-model="newForm.stage" class="admin-input">
            <option v-for="s in LEAD_STAGES" :key="s" :value="s">
              {{ LEAD_STAGE_LABELS[s] }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label">Próximo retorno</label>
          <input
            v-model="newForm.nextContactAt"
            class="admin-input"
            type="date"
          />
        </div>
        <div v-if="brokers?.length">
          <label class="admin-label">Corretor responsável</label>
          <select v-model="newForm.brokerId" class="admin-input">
            <option value="">— ninguém —</option>
            <option v-for="b in brokers" :key="b.id" :value="b.id">
              {{ b.name }}
            </option>
          </select>
        </div>
        <div class="new-msg">
          <label class="admin-label">O que ele procura / observação</label>
          <textarea
            v-model="newForm.message"
            class="admin-textarea"
            rows="2"
            placeholder="Ex.: casa 3 quartos até 400 mil no centro"
          />
        </div>
      </div>
      <p v-if="newErr" class="err">{{ newErr }}</p>
      <div class="new-actions">
        <button class="admin-btn" :disabled="saving" @click="createNew">
          {{ saving ? "Salvando..." : "Adicionar ao funil" }}
        </button>
        <button
          class="admin-btn ghost"
          @click="
            showNew = false;
            resetNew();
          "
        >
          Cancelar
        </button>
      </div>
    </div>

    <!-- Resumo -->
    <div v-if="list.length" class="summary">
      <div class="s-card">
        <span class="s-n">{{ summary.novos }}</span
        ><small>Novos</small>
      </div>
      <div class="s-card" :class="{ alert: summary.atrasados }">
        <span class="s-n">{{ summary.atrasados }}</span
        ><small>Retornos atrasados</small>
      </div>
      <div class="s-card">
        <span class="s-n">{{ summary.andamento }}</span
        ><small>Em andamento</small>
      </div>
      <div class="s-card">
        <span class="s-n">{{ summary.fechados }}</span
        ><small>Fechados</small>
      </div>
    </div>

    <div v-if="allLeads.length" class="toolbar">
      <div class="view-toggle">
        <button :class="{ on: view === 'funil' }" @click="view = 'funil'">
          Funil
        </button>
        <button :class="{ on: view === 'lista' }" @click="view = 'lista'">
          Lista
        </button>
      </div>
      <select v-model="typeFilter" class="admin-input type-filter">
        <option value="todos">Todos os tipos ({{ allLeads.length }})</option>
        <option
          v-for="t in LEAD_TYPES"
          :key="t"
          :value="t"
          :disabled="!typeCounts[t]"
        >
          {{ LEAD_TYPE_LABELS[t] }} ({{ typeCounts[t] }})
        </option>
      </select>
    </div>

    <p v-if="pending" class="admin-card muted-block">Carregando...</p>
    <p
      v-else-if="!list.length && allLeads.length"
      class="admin-card muted-block"
    >
      Nenhum contato deste tipo.
      <button class="link-btn" @click="typeFilter = 'todos'">
        Ver todos os contatos
      </button>
    </p>
    <p v-else-if="!list.length" class="admin-card muted-block">
      Nenhum contato ainda. Quando alguém preencher o formulário no site ele
      aparece aqui — ou use
      <strong>“+ Novo contato”</strong> para registrar um lead que chegou por
      outro canal.
    </p>

    <!-- FUNIL -->
    <div v-else-if="view === 'funil'" class="board">
      <section
        v-for="s in LEAD_STAGES"
        :key="s"
        class="column"
        @dragover.prevent
        @drop="onDrop(s)"
      >
        <header class="col-head">
          <span class="col-title">{{ LEAD_STAGE_LABELS[s] }}</span>
          <span class="col-count">{{ byStage[s].length }}</span>
        </header>

        <p v-if="!byStage[s].length" class="col-empty">—</p>

        <article
          v-for="l in byStage[s]"
          :key="l.id"
          class="card"
          :class="{ over: isOverdue(l), busy: busy === l.id }"
          draggable="true"
          @dragstart="dragId = l.id"
          @dragend="dragId = null"
        >
          <div class="card-top">
            <strong class="c-name">{{ l.name || "Sem nome" }}</strong>
            <time
              class="c-when"
              :title="new Date(l.createdAt).toLocaleString('pt-BR')"
              >{{ whenLabel(l.createdAt) }}</time
            >
          </div>

          <span class="ltype" :class="`t-${l.leadType}`">{{
            LEAD_TYPE_LABELS[l.leadType]
          }}</span>

          <NuxtLink
            v-if="l.property"
            class="c-prop"
            :to="`/imovel/${l.property.code}`"
            target="_blank"
          >
            🏠 {{ l.property.code }} · {{ l.property.title }}
          </NuxtLink>

          <p v-if="l.message" class="c-msg">{{ l.message }}</p>
          <p v-if="l.notes" class="c-notes">📝 {{ l.notes }}</p>

          <div
            v-if="l.nextContactAt"
            class="c-return"
            :class="{ over: isOverdue(l) }"
          >
            ⏰ {{ returnLabel(l.nextContactAt) }}
          </div>
          <div v-if="brokerName(l.brokerId)" class="c-broker">
            👤 {{ brokerName(l.brokerId) }}
          </div>

          <div class="c-actions">
            <a
              v-if="waHref(l.phone)"
              class="admin-btn sm"
              :href="waHref(l.phone)"
              target="_blank"
              rel="noopener"
            >
              <AppIcon name="wa" /> WhatsApp
            </a>
            <button class="admin-btn ghost sm" @click="openEditor(l)">
              {{ editingId === l.id ? "Fechar" : "Detalhes" }}
            </button>
          </div>

          <!-- Editor -->
          <div v-if="editingId === l.id" class="editor">
            <div class="ed-row">
              <div>
                <label class="admin-label">Nome</label
                ><input v-model="edit.name" class="admin-input" />
              </div>
              <div>
                <label class="admin-label">WhatsApp / telefone</label
                ><input
                  v-model="edit.phone"
                  class="admin-input"
                  type="tel"
                  inputmode="numeric"
                />
              </div>
            </div>
            <div class="ed-row">
              <div>
                <label class="admin-label">Tipo de contato</label>
                <select v-model="edit.leadType" class="admin-input">
                  <option v-for="t in LEAD_TYPES" :key="t" :value="t">
                    {{ LEAD_TYPE_LABELS[t] }}
                  </option>
                </select>
              </div>
              <div>
                <label class="admin-label">Origem</label>
                <p class="ed-static">{{ LEAD_SOURCE_LABELS[l.source] }}</p>
              </div>
            </div>
            <label class="admin-label"
              >Anotações (histórico do atendimento)</label
            >
            <textarea
              v-model="edit.notes"
              class="admin-textarea"
              rows="3"
              placeholder="O que foi conversado, objeções, imóveis mostrados..."
            />
            <div class="ed-row">
              <div>
                <label class="admin-label">Próximo retorno</label
                ><input
                  v-model="edit.nextContactAt"
                  class="admin-input"
                  type="date"
                />
              </div>
              <div v-if="brokers?.length">
                <label class="admin-label">Corretor</label>
                <select v-model="edit.brokerId" class="admin-input">
                  <option value="">— ninguém —</option>
                  <option v-for="b in brokers" :key="b.id" :value="b.id">
                    {{ b.name }}
                  </option>
                </select>
              </div>
            </div>
            <div>
              <label class="admin-label">Mover para</label>
              <select
                :value="l.stage"
                class="admin-input"
                @change="
                  move(
                    l,
                    ($event.target as HTMLSelectElement).value as LeadStage,
                  )
                "
              >
                <option
                  v-for="opt in [
                    'novo',
                    'contato',
                    'visita',
                    'proposta',
                    'fechado',
                    'perdido',
                  ] as LeadStage[]"
                  :key="opt"
                  :value="opt"
                >
                  {{ LEAD_STAGE_LABELS[opt] }}
                </option>
              </select>
            </div>
            <div class="ed-actions">
              <button
                class="admin-btn"
                :disabled="busy === l.id"
                @click="saveEditor(l)"
              >
                Salvar
              </button>
              <button class="admin-btn danger sm" @click="remove(l)">
                Excluir
              </button>
            </div>
          </div>
        </article>
      </section>
    </div>

    <!-- LISTA (fallback simples) -->
    <div v-else class="lead-list">
      <article
        v-for="l in [...list]
          .filter((x) => x.stage !== 'perdido')
          .sort(sortColumn)"
        :key="l.id"
        class="admin-card lead"
      >
        <div class="lead-head">
          <strong>{{ l.name || "Sem nome" }}</strong>
          <span class="ltype" :class="`t-${l.leadType}`">{{
            LEAD_TYPE_LABELS[l.leadType]
          }}</span>
          <span class="pill">{{ LEAD_STAGE_LABELS[l.stage] }}</span>
        </div>
        <p v-if="l.message" class="c-msg">{{ l.message }}</p>
        <div v-if="isOverdue(l)" class="c-return over">
          ⏰ {{ returnLabel(l.nextContactAt!) }}
        </div>
        <div class="c-actions">
          <a
            v-if="waHref(l.phone)"
            class="admin-btn sm"
            :href="waHref(l.phone)"
            target="_blank"
            rel="noopener"
            ><AppIcon name="wa" /> WhatsApp</a
          >
          <button class="admin-btn ghost sm" @click="openEditor(l)">
            Detalhes
          </button>
        </div>
      </article>
    </div>

    <!-- Perdidos -->
    <div v-if="lostLeads.length" class="lost">
      <button class="lost-toggle" @click="showLost = !showLost">
        {{ showLost ? "▾" : "▸" }} Perdidos ({{ lostLeads.length }})
      </button>
      <div v-if="showLost" class="lost-list">
        <div v-for="l in lostLeads" :key="l.id" class="lost-item">
          <span
            >{{ l.name || "Sem nome"
            }}<template v-if="l.property">
              · {{ l.property.code }}</template
            ></span
          >
          <div class="lost-actions">
            <button class="admin-btn ghost sm" @click="move(l, 'novo')">
              Reabrir
            </button>
            <button class="admin-btn danger sm" @click="remove(l)">
              Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
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
.sub {
  color: var(--ink-soft);
  margin: 4px 0 0;
  font-size: 14px;
  max-width: 60ch;
}
.muted-block {
  color: var(--ink-soft);
}
.section-t {
  font-family: "Space Grotesk", sans-serif;
  font-size: 15px;
  margin: 0 0 4px;
}
.hint {
  color: var(--ink-soft);
  font-size: 13px;
  margin: 0 0 14px;
}
.err {
  color: #b91c1c;
  font-size: 13px;
  margin: 12px 0 0;
}

/* Novo contato */
.new-card {
  margin-bottom: 18px;
}
.new-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 640px) {
  .new-grid {
    grid-template-columns: 1fr 1fr;
  }
  .new-msg {
    grid-column: 1 / -1;
  }
}
.new-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

/* Resumo */
.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.s-card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.s-card.alert {
  border-color: #e5b8b8;
  background: #fbf0ef;
}
.s-n {
  font-family: "Space Grotesk", sans-serif;
  font-size: 26px;
  font-weight: 700;
  color: var(--brand);
}
.s-card.alert .s-n {
  color: #b23b3b;
}
.s-card small {
  color: var(--ink-soft);
  font-size: 12.5px;
}

/* Toggle */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.type-filter {
  width: auto;
  max-width: 100%;
  font-size: 13.5px;
}
.view-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.view-toggle button {
  border: none;
  background: none;
  padding: 6px 16px;
  border-radius: 7px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}
.view-toggle button.on {
  background: var(--surface);
  color: var(--brand);
  box-shadow: var(--shadow);
}

/* Etiqueta do tipo de contato.
   Verde = a pessoa PROCURA imóvel; azul = a pessoa TEM imóvel e está ofertando.
   A cor separa os dois lados do balcão antes da leitura do texto — que é a
   informação que muda o atendimento. Cinza = ainda não classificado. */
.ltype {
  display: inline-block;
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.6;
  border: 1px solid transparent;
}
.ltype.t-busca_compra {
  background: #dcfce7;
  color: #14532d;
  border-color: #bbf7d0;
}
.ltype.t-busca_aluguel {
  background: #ecfdf5;
  color: #166534;
  border-color: #d1fae5;
}
.ltype.t-oferta_venda {
  background: #dbeafe;
  color: #1e3a8a;
  border-color: #bfdbfe;
}
.ltype.t-oferta_aluguel {
  background: #eff6ff;
  color: #1e40af;
  border-color: #dbeafe;
}
.ltype.t-indefinido {
  background: var(--paper);
  color: var(--ink-soft);
  border-color: var(--line);
}

/* Botão que se parece com link (limpar filtro). */
.link-btn {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--brand);
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

/* Campo só de leitura no editor (origem do lead). */
.ed-static {
  margin: 0;
  padding: 9px 0;
  color: var(--ink-soft);
  font-size: 14px;
}

/* Board */
.board {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(280px, 1fr);
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 8px;
  align-items: start;
}
.column {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.col-title {
  font-family: "Space Grotesk", sans-serif;
  font-weight: 600;
  font-size: 14px;
}
.col-count {
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-soft);
  background: var(--surface);
  border-radius: 100px;
  padding: 1px 9px;
}
.col-empty {
  color: var(--ink-faint, var(--ink-soft));
  text-align: center;
  font-size: 13px;
  padding: 8px 0;
  opacity: 0.6;
}

/* Card */
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px;
  box-shadow: var(--shadow);
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.card:active {
  cursor: grabbing;
}
.card.over {
  border-left: 3px solid #b23b3b;
}
.card.busy {
  opacity: 0.6;
}
.card-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.c-name {
  font-size: 14.5px;
}
.c-when {
  font-size: 11.5px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.c-prop {
  font-size: 12.5px;
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.c-msg {
  font-size: 13px;
  color: var(--ink);
  margin: 0;
  white-space: pre-wrap;
}
.c-notes {
  font-size: 12.5px;
  color: var(--ink-soft);
  margin: 0;
  white-space: pre-wrap;
}
.c-return {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}
.c-return.over {
  color: #b23b3b;
}
.c-broker {
  font-size: 12px;
  color: var(--ink-soft);
}
.c-actions {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 2px;
}
.admin-btn.sm {
  padding: 7px 11px;
  font-size: 12.5px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.admin-btn.sm :deep(svg) {
  width: 14px;
  height: 14px;
}

/* Editor */
.editor {
  border-top: 1px solid var(--line);
  margin-top: 6px;
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ed-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.ed-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* Lista */
.lead-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lead {
  padding: 16px;
}
.lead-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

/* Perdidos */
.lost {
  margin-top: 22px;
}
.lost-toggle {
  background: none;
  border: none;
  color: var(--ink-soft);
  font-weight: 600;
  font-size: 13.5px;
  cursor: pointer;
  padding: 4px 0;
}
.lost-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lost-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 13.5px;
  color: var(--ink-soft);
}
.lost-actions {
  display: flex;
  gap: 7px;
}
</style>

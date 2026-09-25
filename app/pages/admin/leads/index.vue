<script setup lang="ts">
import type {
  Lead,
  LeadStage,
  LeadType,
  LeadCreateInput,
} from "~~/shared/models/lead";
import type { Broker } from "~~/shared/models/broker";
import type { WhatsappClick } from "~~/shared/models/whatsapp-click";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { leadFromRealtimeRow } from "~~/shared/utils/lead-row";
import { propertyPath } from "~~/shared/utils/property-url";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_TYPES,
  LEAD_TYPE_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_LOST_REASONS,
  LEAD_LOST_REASON_LABELS,
  seekingTypeFor,
} from "~~/shared/models/lead";
import type { LeadLostReason } from "~~/shared/models/lead";

definePageMeta({ layout: "admin", middleware: "admin" });

const tenant = useTenant();
const toast = useToast();
const { load: loadMembers, nameFor } = useMemberNames();
onMounted(loadMembers);
const { askConfirm } = useConfirm();

const {
  data: leads,
  pending,
  refresh,
  error: loadError,
} = useLazyAsyncData(
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

const route = useRoute();
const router = useRouter();

/**
 * Visão e filtro de tipo moram na URL (`?visao=lista&tipo=busca_compra`):
 * voltar de outra tela ou recarregar devolvia sempre o funil sem filtro.
 *
 * Sem `visao` na URL, o celular abre em LISTA: o funil lá são seis colunas de
 * 280px lado a lado, rolando na horizontal dentro da tela, e mover um card
 * dependia de arrastar — gesto que no toque briga com a rolagem.
 */
const visaoDaUrl = route.query.visao === "lista" || route.query.visao === "funil"
  ? (route.query.visao as "funil" | "lista")
  : null;
const view = ref<"funil" | "lista">(visaoDaUrl ?? "funil");
onMounted(() => {
  if (!visaoDaUrl && window.matchMedia("(max-width: 859px)").matches) view.value = "lista";
});
const showLost = ref(false);

// Filtro por tipo. Vale para o quadro E para os contadores: um resumo que
// ignora o filtro faria os números contradizerem as colunas na tela.
const tipoDaUrl = String(route.query.tipo || "");
const typeFilter = ref<LeadType | "todos">(
  (LEAD_TYPES as string[]).includes(tipoDaUrl) ? (tipoDaUrl as LeadType) : "todos",
);
watch([view, typeFilter], ([v, t]) => {
  router.replace({
    query: {
      ...route.query,
      visao: v,
      tipo: t === "todos" ? undefined : t,
    },
  });
});
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
/**
 * Ids com alteração local ainda não confirmada pelo servidor.
 *
 * `busy` guarda uma só (é o que desabilita o card na tela); a guarda do tempo
 * real precisa cobrir todas, senão um evento chegando no meio de uma segunda
 * alteração sobrescreveria o que a pessoa acabou de fazer.
 */
const inFlight = ref(new Set<string>());

async function patchLead(id: string, body: Partial<Lead>): Promise<boolean> {
  busy.value = id;
  inFlight.value.add(id);
  try {
    const updated = await adminFetch<Lead>(`/api/admin/leads/${id}`, {
      method: "PUT",
      body,
    });
    if (leads.value)
      leads.value = leads.value.map((x) => (x.id === id ? updated : x));
    return true;
  } catch {
    await refresh(); // desfaz o otimista voltando ao estado do servidor
    toast.error("Não foi possível salvar. Tente de novo.");
    return false;
  } finally {
    busy.value = null;
    inFlight.value.delete(id);
  }
}

function move(l: Lead, stage: LeadStage) {
  if (l.stage === stage) return;
  if (leads.value)
    leads.value = leads.value.map((x) => (x.id === l.id ? { ...x, stage } : x)); // otimista
  patchLead(l.id, { stage });
}

/**
 * Mudar de etapa pelo seletor do card — a alternativa ao arraste (WCAG
 * 2.5.7), e o único jeito no celular. Estava escondida dentro de "Detalhes",
 * onde ainda confundia: salvava na hora, enquanto o resto do mesmo painel só
 * salvava no botão "Salvar".
 *
 * No card, com toast: no arraste o card visivelmente muda de coluna; aqui, na
 * lista, nada se mexe na tela, e sem aviso a pessoa não sabe se pegou.
 */
function moveVia(l: Lead, stage: LeadStage) {
  if (l.stage === stage) return;
  move(l, stage);
  toast.success(`${l.name || "Contato"} movido para ${LEAD_STAGE_LABELS[stage]}.`);
}

async function remove(l: Lead) {
  const ok = await askConfirm({
    title: `Excluir o contato ${l.name || "sem nome"}?`,
    description: "O histórico de atendimento vai junto. Esta ação não volta.",
    confirmLabel: "Excluir",
    danger: true,
  });
  if (!ok) return;
  try {
    await adminFetch(`/api/admin/leads/${l.id}`, { method: "DELETE" });
    if (leads.value) leads.value = leads.value.filter((x) => x.id !== l.id);
    if (editingId.value === l.id) editingId.value = null;
    toast.success("Contato excluído.");
  } catch {
    toast.error("Não foi possível excluir o contato.");
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

// ---- Tempo real ----
//
// INSERT, UPDATE e DELETE. O UPDATE ficou de fora na primeira versão porque o
// quadro faz alteração otimista e um evento chegando no meio dela sobrescreveria
// o estado local — card piscando, ou voltando de coluna. Era a decisão certa
// para uma corretora sozinha.
//
// Com 4 a 6 pessoas no mesmo funil ela deixou de valer: sem sincronizar, o
// quadro de cada uma envelhece e a próxima que arrastar sobrescreve a anterior
// sem ninguém ver. O conflito continua real, mas se resolve com guarda: evento
// de linha com alteração local em voo é ignorado, porque a resposta do servidor
// já vai trazer o estado final.
//
// DELETE fica de fora, e não por esquecimento. Com a replica identity padrão o
// payload de exclusão traz só a chave primária, então o Supabase não tem
// `tenant_id` para avaliar a RLS — a assinatura receberia ids de contatos
// apagados de OUTROS clientes. Não vaza conteúdo (a leitura segue bloqueada),
// mas é exposição entre tenants. A alternativa seria `replica identity full`,
// recusada na 0019 porque joga nome, telefone e mensagem de cada lead no WAL.
// Excluir contato é raro; um card velho que some no próximo refetch custa menos
// que qualquer uma das duas.
const liveIds = ref<string[]>([]);
// Chegou contato novo que o filtro de tipo está escondendo? Aí o aviso precisa
// oferecer saída, senão a corretora vê "1 novo contato" e não acha o card.
const hiddenByFilter = computed(() =>
  liveIds.value.some((id) => !list.value.some((l) => l.id === id)),
);

// O payload do Realtime traz a linha crua, sem o imóvel embutido — então em vez
// de montar o Lead na mão, refaz a busca. Contato é evento raro; uma requisição
// a mais não pesa e evita card com dado pela metade.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    refreshTimer = null;
    // Adia enquanto há mudança otimista em voo: refetch no meio dela faria o
    // card voltar ao estado antigo até o servidor responder.
    if (busy.value) return scheduleRefresh();
    await refresh();
  }, 400);
}

// Se a assinatura cair, a tela fica parada parecendo atualizada — que é pior do
// que não ter tempo real. Então o estado é visível em vez de silencioso.
const liveStatus = ref<"conectando" | "on" | "off">("conectando");
let channel: RealtimeChannel | null = null;
onMounted(async () => {
  const tenantId = tenant.value?.id;
  if (!tenantId) return;
  const client = await getAdminSupabase();
  channel = client
    .channel(`leads-${tenantId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "leads",
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        const id = (payload.new as { id?: string })?.id;
        if (!id) return;
        // Já está na tela: é o cadastro manual feito nesta aba, ou um refetch
        // que chegou antes do evento. Avisar seria avisar do próprio clique.
        if (leads.value?.some((l) => l.id === id)) return;
        if (!liveIds.value.includes(id)) liveIds.value = [...liveIds.value, id];
        scheduleRefresh();
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "leads",
        filter: `tenant_id=eq.${tenantId}`,
      },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const id = typeof row?.id === "string" ? row.id : "";
        // Alteração nossa em voo: a resposta do PUT traz o estado final, e
        // aplicar o evento agora desfaria o que a pessoa acabou de fazer.
        if (!id || inFlight.value.has(id)) return;

        const atual = leads.value?.find((l) => l.id === id);
        const atualizado = leadFromRealtimeRow(row, atual, tenantId);
        if (!atualizado) return;

        // Contato que ainda não está na tela: deixa o refetch trazer, que vem
        // com o imóvel embutido.
        if (!atual) return scheduleRefresh();

        leads.value = (leads.value ?? []).map((l) =>
          l.id === id ? atualizado : l,
        );
        // Se a pessoa está com esse contato aberto, o que ela digitou continua
        // no editor — mas salvar agora sobrescreveria a alteração da outra.
        if (editingId.value === id) changedWhileEditing.value = true;
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") liveStatus.value = "on";
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        liveStatus.value = "off";
    });
});

onBeforeUnmount(async () => {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!channel) return;
  const client = await getAdminSupabase();
  await client.removeChannel(channel);
  channel = null;
});

// ---- Editor inline ----
const editingId = ref<string | null>(null);
/** Outra pessoa alterou este contato enquanto ele está aberto para edição. */
const changedWhileEditing = ref(false);
const edit = reactive({
  name: "",
  phone: "",
  brokerId: "",
  leadType: "indefinido" as LeadType,
});
/**
 * Detalhes do contato numa gaveta lateral, e não dentro do card: o card do
 * funil tem 280px, e o histórico e a agenda (0049) espremidos ali ficavam
 * ilegíveis. A gaveta é a mesma no funil e na lista.
 */
const editingLead = computed(() =>
  editingId.value ? (leads.value?.find((x) => x.id === editingId.value) ?? null) : null,
);
let focoAntes: HTMLElement | null = null;
function closeEditor() {
  editingId.value = null;
  losing.value = false;
  focoAntes?.focus();
  focoAntes = null;
}
/**
 * A gaveta se declara modal (`aria-modal`), então o Tab não pode escapar para
 * o funil atrás do véu: quem navega por teclado se perderia numa tela que
 * nem enxerga.
 */
function prenderFoco(e: KeyboardEvent) {
  const box = (e.currentTarget as HTMLElement) ?? null;
  if (!box) return;
  const focaveis = [...box.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((el) => el.offsetParent !== null);
  if (!focaveis.length) return;
  const primeiro = focaveis[0]!, ultimo = focaveis[focaveis.length - 1]!;
  if (e.shiftKey && document.activeElement === primeiro) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault();
    primeiro.focus();
  }
}
function openEditor(l: Lead) {
  if (editingId.value === l.id) return closeEditor();
  focoAntes = document.activeElement as HTMLElement | null;
  editingId.value = l.id;
  nextTick(() => document.getElementById("drawer-close")?.focus());
  changedWhileEditing.value = false;
  losing.value = false;
  if (editingId.value) {
    edit.name = l.name || "";
    edit.phone = l.phone || "";
    edit.brokerId = l.brokerId || "";
    edit.leadType = l.leadType;
  }
}
/** Sair da tela com o cadastro alterado e não salvo perdia a edição sem aviso. */
function editorDirty() {
  const l = editingId.value ? leads.value?.find((x) => x.id === editingId.value) : null;
  if (!l) return false;
  return (
    edit.name !== (l.name || "") ||
    edit.phone !== (l.phone || "") ||
    edit.brokerId !== (l.brokerId || "") ||
    edit.leadType !== l.leadType
  );
}

/**
 * `?lead=<id>` abre o contato direto — é como a agenda leva a pessoa do
 * compromisso para o histórico de quem ela vai atender.
 */
const leadDaUrl = String(route.query.lead || "");
if (leadDaUrl) {
  const stop = watch(
    leads,
    (ls) => {
      const l = ls?.find((x) => x.id === leadDaUrl);
      if (!l) return;
      stop();
      if (l.stage === "perdido") showLost.value = true;
      else openEditor(l);
      nextTick(() => document.getElementById(`lead-${l.id}`)?.scrollIntoView({ block: "center" }));
    },
    { immediate: true },
  );
}

// ---- Perda com motivo ----
// Mover para "perdido" exige motivo (o servidor recusa sem): é o relatório de
// perdas. Fica dentro do editor, e não como coluna de arrastar, pelo mesmo
// motivo que o funil não mostra "perdido": é arquivo, não etapa de trabalho.
const losing = ref(false);
const lostReason = ref<LeadLostReason | "">("");
async function markLost(l: Lead) {
  if (!lostReason.value) return;
  const motivo = lostReason.value;
  if (!(await patchLead(l.id, { stage: "perdido", lostReason: motivo }))) return;
  lostReason.value = "";
  closeEditor();
  toast.success(`${l.name || "Contato"} arquivado como perdido (${LEAD_LOST_REASON_LABELS[motivo].toLowerCase()}).`);
}
const newDirty = () =>
  showNew.value && !!(newForm.name || newForm.phone || newForm.message);
useUnsavedGuard(() => editorDirty() || newDirty());

const [DefineEditor, ReuseEditor] = createReusableTemplate<{ l: Lead }>();

async function saveEditor(l: Lead) {
  const ok = await patchLead(l.id, {
    name: edit.name.trim() || null,
    phone: edit.phone.trim() || null,
    brokerId: edit.brokerId || null,
    leadType: edit.leadType,
  });
  // A gaveta fica aberta: salvar o cadastro não encerra o atendimento, e o
  // histórico e a agenda continuam logo abaixo.
  if (ok) toast.success("Dados do contato salvos.");
}

// ---- Novo contato manual ----
// `?novo=1` abre o formulário direto — é o atalho "+ Novo contato" do
// dashboard, para quem acabou de desligar o telefone com um interessado.
const showNew = ref(route.query.novo === "1");
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
/**
 * Clique no WhatsApp que o contato em cadastro vai herdar. Guardado inteiro, e
 * não só o id, para a tela dizer de qual imóvel e horário ele veio — é o que o
 * atendente confere contra a conversa antes de salvar.
 */
const newFromClick = ref<WhatsappClick | null>(null);
const whatsappClicks = ref<{ refresh: () => Promise<void> } | null>(null);
function resetNew() {
  newFromClick.value = null;
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
    document.getElementById("nl-nome")?.focus();
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
        whatsappClickId: newFromClick.value?.id ?? null,
      },
    });
    if (newFromClick.value) whatsappClicks.value?.refresh();
    if (leads.value) leads.value = [created, ...leads.value];
    resetNew();
    showNew.value = false;
    toast.success(`${created.name || "Contato"} adicionado ao funil.`);
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    newErr.value = err?.data?.statusMessage || "Não foi possível salvar.";
  } finally {
    saving.value = false;
  }
}

/**
 * "Virar contato" de um clique: abre o cadastro com o que o clique já sabe.
 * O tipo sai da finalidade do imóvel, como no formulário do site; o corretor,
 * de para quem a conversa foi. O imóvel não passa por aqui — o servidor o lê
 * do próprio clique.
 */
function convertClick(c: WhatsappClick) {
  resetNew();
  newFromClick.value = c;
  newForm.leadType = seekingTypeFor(c.property?.purpose);
  newForm.brokerId = c.broker?.id ?? "";
  showNew.value = true;
  nextTick(() => {
    document.getElementById("nl-nome")?.scrollIntoView({ block: "center" });
    document.getElementById("nl-nome")?.focus();
  });
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
// <input type="date"> -> timestamptz, ancorado ao meio-dia local pra não
// pular de dia por causa de fuso ao converter para ISO.
function inputToIso(day: string): string | null {
  if (!day) return null;
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

useHead({ title: "Contatos · Painel" });
</script>

<template>
  <div>
    <!--
      O editor é definido UMA vez e reusado no funil e na lista. Antes ele só
      existia dentro dos cards do funil, e o "Detalhes" da lista abria um
      editor que não estava na página: pela lista não havia como editar, mudar
      de etapa nem excluir.
    -->
    <DefineEditor v-slot="{ l }">
          <div class="editor">
            <div class="ed-row">
              <div>
                <label class="admin-label" :for="`ed-nome-${l.id}`">Nome</label
                ><input :id="`ed-nome-${l.id}`"
                  v-model="edit.name" class="admin-input" />
              </div>
              <div>
                <label class="admin-label" :for="`ed-fone-${l.id}`">WhatsApp / telefone</label
                ><input
                  :id="`ed-fone-${l.id}`"
                  v-model="edit.phone"
                  class="admin-input"
                  type="tel"
                  inputmode="numeric"
                />
              </div>
            </div>
            <div class="ed-row">
              <div>
                <label class="admin-label" :for="`ed-tipo-${l.id}`">Tipo de contato</label>
                <select :id="`ed-tipo-${l.id}`"
                  v-model="edit.leadType" class="admin-input">
                  <option v-for="t in LEAD_TYPES" :key="t" :value="t">
                    {{ LEAD_TYPE_LABELS[t] }}
                  </option>
                </select>
              </div>
              <div>
                <label class="admin-label">Origem</label>
                <p class="ed-static">
                  {{ LEAD_SOURCE_LABELS[l.source] }}
                  <!-- Fica no editor, não no card: com seis pessoas mexendo, um
                       "alterado por" em cada card viraria ruído no quadro. -->
                  <small v-if="nameFor(l.updatedBy)" class="ed-who"
                    >Última alteração por {{ nameFor(l.updatedBy) }}</small
                  >
                </p>
              </div>
            </div>
            <p v-if="changedWhileEditing" class="ed-warn">
              Outra pessoa alterou este contato agora. O que você digitou
              continua aqui, mas salvar vai sobrescrever a alteração dela —
              feche e reabra para ver o estado atual.
            </p>
            <div class="ed-row">
              <div v-if="brokers?.length">
                <label class="admin-label" :for="`ed-corretor-${l.id}`">Corretor</label>
                <select :id="`ed-corretor-${l.id}`"
                  v-model="edit.brokerId" class="admin-input">
                  <option value="">— ninguém —</option>
                  <option v-for="b in brokers" :key="b.id" :value="b.id">
                    {{ b.name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="ed-actions">
              <button
                class="admin-btn"
                :disabled="busy === l.id"
                @click="saveEditor(l)"
              >
                Salvar
              </button>
              <button
                v-if="l.stage !== 'perdido' && !losing"
                class="admin-btn ghost sm"
                @click="losing = true"
              >
                <AppIcon name="lost" /> Marcar como perdido
              </button>
              <button class="admin-btn danger-ghost sm ed-del" @click="remove(l)">
                Excluir
              </button>
            </div>
            <form v-if="losing" class="lose" @submit.prevent="markLost(l)">
              <label class="admin-label" :for="`ed-perda-${l.id}`">Por que perdemos este contato?</label>
              <div class="lose-row">
                <select :id="`ed-perda-${l.id}`" v-model="lostReason" class="admin-input" required>
                  <option value="" disabled>Escolha o motivo</option>
                  <option v-for="r in LEAD_LOST_REASONS" :key="r" :value="r">{{ LEAD_LOST_REASON_LABELS[r] }}</option>
                </select>
                <button class="admin-btn danger sm" :disabled="!lostReason || busy === l.id">Arquivar como perdido</button>
                <button type="button" class="admin-btn ghost sm" @click="losing = false; lostReason = ''">Voltar</button>
              </div>
              <small class="lose-hint">O motivo vira o relatório de perdas. Dá para reabrir depois, em "Perdidos".</small>
            </form>

            <AdminLeadTimeline :lead="l" :brokers="brokers ?? []" @changed="scheduleRefresh" />
          </div>
    </DefineEditor>

    <div class="page-head">
      <div>
        <h1>Contatos</h1>
        <p class="sub">
          Seu funil de atendimento. Mova o contato conforme ele avança, registre
          cada conversa e deixe sempre um próximo passo agendado.
        </p>
      </div>
      <button class="admin-btn" @click="showNew = !showNew">
        {{ showNew ? "Fechar" : "+ Novo contato" }}
      </button>
    </div>

    <!-- Novo contato manual -->
    <div v-if="showNew" class="admin-card new-card">
      <h3 class="section-t">Novo contato</h3>
      <p v-if="newFromClick" class="from-click">
        <AppIcon name="wa" />
        Do clique no WhatsApp<template v-if="newFromClick.property">
          no imóvel <strong>{{ newFromClick.property.code }}</strong></template>,
        {{ whenLabel(newFromClick.createdAt) }}. O imóvel entra junto no contato.
      </p>
      <p v-else class="hint">
        Registre aqui o lead que chegou por WhatsApp, indicação ou ligação —
        assim ele não se perde.
      </p>
      <div class="new-grid">
        <div>
          <label class="admin-label" for="nl-nome">Nome *</label>
          <input
            id="nl-nome"
            v-model="newForm.name"
            class="admin-input"
            placeholder="Nome do interessado"
          />
        </div>
        <div>
          <label class="admin-label" for="nl-fone">WhatsApp / telefone</label>
          <input
            id="nl-fone"
            v-model="newForm.phone"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="(67) 99999-9999"
          />
        </div>
        <div>
          <label class="admin-label" for="nl-tipo">Tipo de contato</label>
          <select id="nl-tipo"
            v-model="newForm.leadType" class="admin-input">
            <option v-for="t in LEAD_TYPES" :key="t" :value="t">
              {{ LEAD_TYPE_LABELS[t] }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label" for="nl-etapa">Etapa</label>
          <select id="nl-etapa"
            v-model="newForm.stage" class="admin-input">
            <option v-for="s in LEAD_STAGES" :key="s" :value="s">
              {{ LEAD_STAGE_LABELS[s] }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label" for="nl-retorno">Próximo retorno</label>
          <input
            id="nl-retorno"
            v-model="newForm.nextContactAt"
            class="admin-input"
            type="date"
          />
        </div>
        <div v-if="brokers?.length">
          <label class="admin-label" for="nl-corretor">Corretor responsável</label>
          <select id="nl-corretor"
            v-model="newForm.brokerId" class="admin-input">
            <option value="">— ninguém —</option>
            <option v-for="b in brokers" :key="b.id" :value="b.id">
              {{ b.name }}
            </option>
          </select>
        </div>
        <div class="new-msg">
          <label class="admin-label" for="nl-msg">O que ele procura / observação</label>
          <textarea
            id="nl-msg"
            v-model="newForm.message"
            class="admin-textarea"
            rows="2"
            placeholder="Ex.: casa 3 quartos até 400 mil no centro"
          />
        </div>
      </div>
      <p v-if="newErr" class="err" role="alert">{{ newErr }}</p>
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

    <p v-if="liveStatus === 'off'" class="live-off">
      Atualização automática indisponível agora — recarregue a página para ver
      contatos novos.
    </p>

    <!-- Chegou contato agora (assinatura de INSERT) -->
    <div v-if="liveIds.length" class="live">
      <span class="live-dot" aria-hidden="true" />
      <strong>{{ liveIds.length }}</strong>
      <span>{{
        liveIds.length === 1 ? "novo contato" : "novos contatos"
      }}</span>
      <button
        v-if="hiddenByFilter"
        class="link-btn"
        @click="typeFilter = 'todos'"
      >
        o filtro está escondendo — ver todos
      </button>
      <button class="link-btn live-ok" @click="liveIds = []">ok</button>
    </div>

    <AdminWhatsappClicks ref="whatsappClicks" @converter="convertClick" />

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
        <button
          type="button"
          :class="{ on: view === 'funil' }"
          :aria-pressed="view === 'funil'"
          @click="view = 'funil'"
        >
          Funil
        </button>
        <button
          type="button"
          :class="{ on: view === 'lista' }"
          :aria-pressed="view === 'lista'"
          @click="view = 'lista'"
        >
          Lista
        </button>
      </div>
      <select v-model="typeFilter" class="admin-input type-filter" aria-label="Filtrar por tipo de contato">
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

    <p v-if="pending && !allLeads.length" class="admin-card muted-block" role="status">Carregando...</p>
    <!-- Antes do vazio: com `default: []`, falha de rede virava "Nenhum
         contato ainda" — a corretora achava que não tinha chegado ninguém. -->
    <div v-else-if="loadError" class="admin-card muted-block state-card" role="alert">
      <p>Não foi possível carregar os contatos. Verifique a conexão.</p>
      <button type="button" class="admin-btn" @click="refresh()">Tentar de novo</button>
    </div>
    <p
      v-else-if="!list.length && allLeads.length"
      class="admin-card muted-block"
    >
      Nenhum contato deste tipo.
      <button class="link-btn" @click="typeFilter = 'todos'">
        Ver todos os contatos
      </button>
    </p>
    <div v-else-if="!list.length" class="admin-card muted-block state-card">
      <p>
        Nenhum contato ainda. Quando alguém preencher o formulário no site ele
        aparece aqui — ou registre um lead que chegou por outro canal.
      </p>
      <button type="button" class="admin-btn" @click="showNew = true">+ Novo contato</button>
    </div>

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
          :id="`lead-${l.id}`"
          class="card"
          :class="{
            over: isOverdue(l),
            busy: busy === l.id,
            fresh: liveIds.includes(l.id),
          }"
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
            :to="propertyPath(l.property)"
            target="_blank"
          >
            <AppIcon name="home" /> {{ l.property.code }} · {{ l.property.title }}
          </NuxtLink>

          <p v-if="l.message" class="c-msg">{{ l.message }}</p>
          <p v-if="l.notes" class="c-notes"><AppIcon name="notes" /> {{ l.notes }}</p>

          <div
            v-if="l.nextContactAt"
            class="c-return"
            :class="{ over: isOverdue(l) }"
          >
            <AppIcon name="clock" /> {{ returnLabel(l.nextContactAt) }}
          </div>
          <div v-if="brokerName(l.brokerId)" class="c-broker">
            <AppIcon name="user" /> {{ brokerName(l.brokerId) }}
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
            <button
              class="admin-btn ghost sm"
              :aria-expanded="editingId === l.id"
              @click="openEditor(l)"
            >
              Abrir
            </button>
          </div>
          <label class="c-stage">
            <span>Etapa</span>
            <select
              :value="l.stage"
              class="admin-input"
              :disabled="busy === l.id"
              @change="moveVia(l, ($event.target as HTMLSelectElement).value as LeadStage)"
            >
              <option v-for="opt in LEAD_STAGES" :key="opt" :value="opt">
                {{ LEAD_STAGE_LABELS[opt] }}
              </option>
            </select>
          </label>

        </article>
      </section>
    </div>

    <!-- LISTA (fallback simples) -->
    <div v-else class="lead-list">
      <article
        v-for="l in [...list]
          .filter((x) => x.stage !== 'perdido')
          .sort(sortColumn)"
        :id="`lead-${l.id}`"
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
          <AppIcon name="clock" /> {{ returnLabel(l.nextContactAt!) }}
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
          <button
            class="admin-btn ghost sm"
            :aria-expanded="editingId === l.id"
            @click="openEditor(l)"
          >
            Abrir
          </button>
        </div>
        <label class="c-stage">
          <span>Etapa</span>
          <select
            :value="l.stage"
            class="admin-input"
            :disabled="busy === l.id"
            @change="moveVia(l, ($event.target as HTMLSelectElement).value as LeadStage)"
          >
            <option v-for="opt in LEAD_STAGES" :key="opt" :value="opt">
              {{ LEAD_STAGE_LABELS[opt] }}
            </option>
          </select>
        </label>
      </article>
    </div>

    <!-- Perdidos -->
    <div v-if="lostLeads.length" class="lost">
      <button class="lost-toggle" :aria-expanded="showLost" @click="showLost = !showLost">
        {{ showLost ? "▾" : "▸" }} Perdidos ({{ lostLeads.length }})
      </button>
      <div v-if="showLost" class="lost-list">
        <div v-for="l in lostLeads" :key="l.id" class="lost-item">
          <span
            >{{ l.name || "Sem nome"
            }}<template v-if="l.property">
              · {{ l.property.code }}</template
            ><small v-if="l.lostReason" class="lost-why">
              {{ LEAD_LOST_REASON_LABELS[l.lostReason] }}</small
            ></span
          >
          <div class="lost-actions">
            <button class="admin-btn ghost sm" @click="move(l, 'novo')">
              Reabrir
            </button>
            <button class="admin-btn danger-ghost sm" @click="remove(l)">
              Excluir
            </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="scrim">
        <div v-if="editingLead" class="scrim" aria-hidden="true" @click="closeEditor" />
      </Transition>
      <Transition name="drawer">
        <aside
          v-if="editingLead"
          class="drawer"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`dr-t-${editingLead.id}`"
          @keydown.esc="closeEditor"
          @keydown.tab="prenderFoco"
        >
          <header class="dr-head">
            <div class="dr-id">
              <h2 :id="`dr-t-${editingLead.id}`">{{ editingLead.name || "Sem nome" }}</h2>
              <p class="dr-sub">
                <span class="pill">{{ LEAD_STAGE_LABELS[editingLead.stage] }}</span>
                <span class="ltype" :class="`t-${editingLead.leadType}`">{{ LEAD_TYPE_LABELS[editingLead.leadType] }}</span>
                <NuxtLink v-if="editingLead.property" class="dr-prop" :to="propertyPath(editingLead.property)" target="_blank">
                  <AppIcon name="home" /> {{ editingLead.property.code }}
                </NuxtLink>
              </p>
            </div>
            <a
              v-if="waHref(editingLead.phone)"
              class="admin-btn sm dr-wa"
              :href="waHref(editingLead.phone)"
              target="_blank"
              rel="noopener"
            ><AppIcon name="wa" /> WhatsApp</a>
            <button id="drawer-close" type="button" class="dr-close" aria-label="Fechar detalhes" @click="closeEditor">
              <AppIcon name="close" />
            </button>
          </header>
          <div class="dr-body">
            <p v-if="editingLead.message" class="dr-msg">“{{ editingLead.message }}”</p>
            <ReuseEditor :l="editingLead" />
          </div>
        </aside>
      </Transition>
    </Teleport>
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
  font-size: var(--fs-ui);
  max-width: 60ch;
}
.muted-block {
  color: var(--ink-soft);
}
.section-t {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  margin: 0 0 4px;
}
.hint {
  color: var(--ink-soft);
  font-size: var(--fs-label);
  margin: 0 0 14px;
}
.err {
  color: #b91c1c;
  font-size: var(--fs-label);
  margin: 12px 0 0;
}

/* Gaveta de detalhes */
.scrim {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(20, 22, 26, 0.32);
}
.drawer {
  position: fixed;
  z-index: 61;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(560px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--paper);
  box-shadow: -12px 0 40px rgba(20, 22, 26, 0.16);
}
.dr-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--line);
}
.dr-id {
  flex: 1;
  min-width: 0;
}
.dr-id h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-title-sm);
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.dr-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}
.dr-prop {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--brand);
}
.dr-prop :deep(svg) {
  width: 13px;
  height: 13px;
}
.dr-wa {
  flex: none;
  text-decoration: none;
}
.dr-close {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  color: var(--ink-soft);
  cursor: pointer;
}
.dr-close:hover {
  background: var(--surface);
  color: var(--ink);
}
.dr-close:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.dr-close :deep(svg) {
  width: 20px;
  height: 20px;
}
.dr-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 16px 20px 28px;
}
.dr-body .editor {
  margin: 0;
  padding: 0;
  border-top: none;
}
.dr-msg {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--surface);
  font-size: var(--fs-ui);
  color: var(--ink-soft);
  white-space: pre-wrap;
}
.drawer-enter-active,
.drawer-leave-active {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(100%);
}
.scrim-enter-active,
.scrim-leave-active {
  transition: opacity 0.2s ease-out;
}
.scrim-enter-from,
.scrim-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active,
  .scrim-enter-active,
  .scrim-leave-active {
    transition: none;
  }
}

/* Perda com motivo */
.ed-del {
  margin-left: auto;
}
.lose {
  margin-top: 12px;
  padding: 12px;
  border-radius: var(--r-md);
  background: #fbf0ef;
}
.lose-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.lose-row .admin-input {
  flex: 1 1 200px;
  width: auto;
}
.lose-hint {
  display: block;
  margin-top: 8px;
  color: #7a3434;
  font-size: var(--fs-caption);
}
.lost-why {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--surface);
  color: var(--ink-soft);
  font-size: var(--fs-caption);
  font-weight: 600;
}

/* Novo contato */
.new-card {
  margin-bottom: 18px;
}
.from-click {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: var(--r-sm);
  background: var(--surface);
  font-size: var(--fs-label);
}
.from-click :deep(svg) {
  width: 16px;
  height: 16px;
  color: var(--wa, #25d366);
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
  border-radius: var(--r-md);
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
  font-family: var(--font-display);
  font-size: var(--fs-title-lg);
  font-weight: 700;
  color: var(--brand);
}
.s-card.alert .s-n {
  color: #b23b3b;
}
.s-card small {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
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
  font-size: var(--fs-label);
}
.view-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.view-toggle button {
  border: none;
  background: none;
  padding: 6px 16px;
  border-radius: var(--r-sm);
  font-size: var(--fs-label);
  font-weight: 600;
  color: var(--ink-soft);
  cursor: pointer;
}
.view-toggle button.on {
  background: var(--surface);
  color: var(--brand);
  box-shadow: var(--shadow);
}

.live-off {
  margin-bottom: 14px;
  padding: 9px 14px;
  border-radius: var(--r-md);
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: var(--fs-label);
}

/* Aviso de contato chegando em tempo real. */
.live {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: var(--r-md);
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  font-size: var(--fs-ui);
}
.live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #10b981;
  animation: live-pulse 1.6s ease-in-out infinite;
}
.live-ok {
  margin-left: auto;
}
@keyframes live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.25;
  }
}
/* Quem tem "prefiro menos animação" no sistema não precisa de ponto piscando. */
@media (prefers-reduced-motion: reduce) {
  .live-dot {
    animation: none;
  }
}

/* Card que acabou de chegar: destaque some quando o aviso é dispensado. */
.card.fresh {
  border-color: #6ee7b7;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18);
}

/* Etiqueta do tipo de contato.
   Verde = a pessoa PROCURA imóvel; azul = a pessoa TEM imóvel e está ofertando.
   A cor separa os dois lados do balcão antes da leitura do texto — que é a
   informação que muda o atendimento. Cinza = ainda não classificado. */
.ltype {
  display: inline-block;
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
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

.ed-who {
  display: block;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}

/* Aviso de edição concorrente dentro do editor. */
.ed-warn {
  margin: 0 0 10px;
  padding: 9px 12px;
  border-radius: var(--r-sm);
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: var(--fs-label);
  line-height: 1.5;
}

/* Campo só de leitura no editor (origem do lead). */
.ed-static {
  margin: 0;
  padding: 9px 0;
  color: var(--ink-soft);
  font-size: var(--fs-ui);
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
  border-radius: var(--r-md);
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
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--fs-ui);
}
.col-count {
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--ink-soft);
  background: var(--surface);
  border-radius: var(--r-pill);
  padding: 1px 9px;
}
.col-empty {
  color: var(--ink-faint, var(--ink-soft));
  text-align: center;
  font-size: var(--fs-label);
  padding: 8px 0;
  opacity: 0.6;
}

/* Card */
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
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
  font-size: var(--fs-ui);
}
.c-when {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  white-space: nowrap;
}
.c-prop {
  font-size: var(--fs-caption);
  color: var(--brand);
  font-weight: 600;
  text-decoration: none;
}
.c-msg {
  font-size: var(--fs-label);
  color: var(--ink);
  margin: 0;
  white-space: pre-wrap;
}
.c-notes {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  margin: 0;
  white-space: pre-wrap;
}
.c-return {
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--ink-soft);
}
.c-return.over {
  color: #b23b3b;
}
.c-broker {
  font-size: var(--fs-caption);
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
  font-size: var(--fs-caption);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.admin-btn.sm :deep(svg) {
  width: 14px;
  height: 14px;
}
/* 40px no card (alvo de toque): com 7px de padding davam ~30px. */
.c-actions .admin-btn.sm {
  min-height: 40px;
}
@media (pointer: coarse) {
  .c-actions .admin-btn.sm {
    min-height: 44px;
  }
}
.c-prop :deep(svg),
.c-notes :deep(svg),
.c-return :deep(svg),
.c-broker :deep(svg) {
  width: 13px;
  height: 13px;
  vertical-align: -2px;
}
.c-stage {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--ink-soft);
}
.c-stage .admin-input {
  padding: 8px 10px;
  font-size: var(--fs-label);
  min-height: 40px;
}
.state-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}
.state-card p {
  margin: 0;
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
  flex-wrap: wrap;
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
  font-size: var(--fs-label);
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
  border-radius: var(--r-md);
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.lost-actions {
  display: flex;
  gap: 7px;
}
</style>

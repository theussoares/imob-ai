<script setup lang="ts">
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Broker } from "~~/shared/models/broker";
import type { LeadStage } from "~~/shared/models/lead";
import { LEAD_STAGE_LABELS } from "~~/shared/models/lead";
import type {
  WhatsappAccountInfo,
  WhatsappConversation,
  WhatsappFiltro,
  WhatsappMessage,
} from "~~/shared/models/whatsapp";
import {
  WHATSAPP_FILTROS,
  WHATSAPP_FILTRO_LABELS,
  WHATSAPP_TEXTO_MAX,
  aguardandoResposta,
  textoDaMensagem,
  toWhatsappFiltro,
} from "~~/shared/models/whatsapp";
import { formatWhatsapp } from "~~/shared/utils/phone";
import { formatPropertyCode } from "~~/shared/utils/property-specs";

/**
 * Caixa de entrada do WhatsApp (0059).
 *
 * Três colunas no computador — lista, conversa, contato — porque quem atende
 * precisa ver, sem trocar de tela, de qual imóvel a pessoa veio e em que etapa
 * do funil ela está. No celular vira lista → conversa em tela cheia, com a
 * conversa na URL (`?c=`): é o link que um aviso pode abrir direto, e é o que
 * faz o "voltar" do Android voltar para a lista em vez de sair do painel.
 */
definePageMeta({ layout: "admin", middleware: ["admin", "whatsapp"] });
useHead({ title: "Conversas · Painel" });

const tenant = useTenant();
const toast = useToast();
const route = useRoute();
const router = useRouter();

// ---- Número conectado ----
const {
  data: conta,
  pending: contaPending,
  error: contaErro,
  refresh: recarregarConta,
} = useLazyAsyncData("admin:whatsapp:conta", () => adminFetch<WhatsappAccountInfo>("/api/admin/whatsapp/account"), {
  server: false,
});

const conexao = reactive({ phoneNumberId: "", wabaId: "", accessToken: "" });
const conectando = ref(false);
async function conectar() {
  conectando.value = true;
  try {
    await adminFetch("/api/admin/whatsapp/account", { method: "PUT", body: { ...conexao } });
    conexao.accessToken = "";
    toast.success("WhatsApp conectado. As próximas mensagens já chegam aqui.");
    await recarregarConta();
  } catch (e) {
    toast.error(friendlyErrorMessage(e, "Não foi possível conectar o número."));
  } finally {
    conectando.value = false;
  }
}

const confirmarDesconexao = ref(false);
async function desconectar() {
  confirmarDesconexao.value = false;
  try {
    await adminFetch("/api/admin/whatsapp/account", { method: "DELETE" });
    toast.success("WhatsApp desconectado. O histórico continua aqui.");
    await recarregarConta();
  } catch (e) {
    toast.error(friendlyErrorMessage(e, "Não foi possível desconectar."));
  }
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  } catch {
    toast.error("Não foi possível copiar. Selecione e copie à mão.");
  }
}

// ---- Lista ----
const filtro = ref<WhatsappFiltro>(toWhatsappFiltro(route.query.filtro));
const corretor = ref(String(route.query.corretor || ""));
const abertaId = ref(String(route.query.c || ""));
watch([filtro, corretor, abertaId], ([f, b, c]) =>
  router.replace({ query: { ...route.query, filtro: f === "todas" ? undefined : f, corretor: b || undefined, c: c || undefined } }),
);

const { data: brokers } = useLazyAsyncData("admin:conversas:brokers", () => adminFetch<Broker[]>("/api/admin/brokers"), {
  server: false,
  default: () => [] as Broker[],
});

const {
  data: conversas,
  pending: listaPending,
  error: listaErro,
  refresh: recarregarLista,
} = useLazyAsyncData(
  () => `admin:conversas:${filtro.value}:${corretor.value}`,
  () =>
    adminFetch<WhatsappConversation[]>("/api/admin/whatsapp/conversations", {
      query: { filtro: filtro.value, corretor: corretor.value || undefined },
    }),
  { server: false, default: () => [] as WhatsappConversation[], watch: [filtro, corretor] },
);

const semResposta = computed(() => (conversas.value ?? []).filter(aguardandoResposta).length);

function nomeDe(c: WhatsappConversation): string {
  return c.leadName || c.contactName || formatWhatsapp(c.waId) || "Contato";
}

// "Agora" anda com a tela aberta: "há 3 min" vira "há 4 min" sem recarregar.
const agora = ref(Date.now());
let tick: ReturnType<typeof setInterval> | null = null;
onMounted(() => (tick = setInterval(() => (agora.value = Date.now()), 30000)));

function ha(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((agora.value - Date.parse(iso)) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} dia${d > 1 ? "s" : ""}`;
}

function horaCurta(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date(agora.value);
  return d.toDateString() === hoje.toDateString()
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Na bolha: só a hora se foi hoje; senão dia e hora. */
function horaDaMensagem(iso: string): string {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date(agora.value).toDateString()
    ? hora
    : `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/** Tempo até a primeira resposta — o número que o dono pede. */
function tempoDeResposta(c: WhatsappConversation): string {
  if (!c.firstResponseAt) return "";
  const min = Math.max(0, Math.round((Date.parse(c.firstResponseAt) - Date.parse(c.createdAt)) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

// ---- Conversa aberta ----
interface Aberta {
  conversa: WhatsappConversation;
  mensagens: WhatsappMessage[];
  janelaAberta: boolean;
}
const aberta = ref<Aberta | null>(null);
const abertaPending = ref(false);
const abertaErro = ref(false);
const listaMsgs = ref<HTMLElement | null>(null);

async function carregarAberta(opts: { rolar?: boolean } = {}) {
  const id = abertaId.value;
  if (!id) {
    aberta.value = null;
    return;
  }
  if (aberta.value?.conversa.id !== id) abertaPending.value = true;
  abertaErro.value = false;
  try {
    const r = await adminFetch<Aberta>(`/api/admin/whatsapp/conversations/${id}`);
    if (abertaId.value !== id) return; // trocou de conversa no meio
    const eraFim = noFim();
    aberta.value = r;
    if (r.conversa.unreadCount > 0) marcarLida(id);
    // Rola só se a pessoa já estava no fim — quem subiu para reler algo não
    // pode ser arrancado de lá por uma mensagem nova.
    if (opts.rolar || eraFim) nextTick(rolarParaFim);
  } catch {
    abertaErro.value = true;
  } finally {
    abertaPending.value = false;
  }
}

function noFim(): boolean {
  const el = listaMsgs.value;
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}
function rolarParaFim() {
  const el = listaMsgs.value;
  if (el) el.scrollTop = el.scrollHeight;
}

async function marcarLida(id: string) {
  try {
    await adminFetch(`/api/admin/whatsapp/conversations/${id}/read`, { method: "POST" });
    const c = conversas.value?.find((x) => x.id === id);
    if (c) c.unreadCount = 0;
  } catch {
    // Contador errado até a próxima atualização; não vale um aviso.
  }
}

function abrir(id: string) {
  abertaId.value = id;
  resposta.value = "";
}
watch(abertaId, () => carregarAberta({ rolar: true }), { immediate: true });

// ---- Responder ----
const resposta = ref("");
const enviando = ref(false);
async function enviar() {
  const id = abertaId.value;
  const texto = resposta.value.trim();
  if (!id || !texto || enviando.value) return;
  enviando.value = true;
  try {
    await adminFetch(`/api/admin/whatsapp/conversations/${id}/messages`, { method: "POST", body: { text: texto } });
    resposta.value = "";
    await Promise.all([carregarAberta({ rolar: true }), recarregarLista()]);
  } catch (e) {
    // O texto fica no campo: a pessoa não perde o que escreveu.
    toast.error(friendlyErrorMessage(e, "A mensagem não foi enviada."));
  } finally {
    enviando.value = false;
  }
}
function aoTeclar(e: KeyboardEvent) {
  // Enter envia, Shift+Enter quebra linha — o mesmo do WhatsApp Web, que é o
  // hábito de quem atende.
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    enviar();
  }
}

const STATUS_ROTULO: Record<WhatsappMessage["status"], string> = {
  recebida: "",
  enviada: "Enviada",
  entregue: "Entregue",
  lida: "Lida",
  falhou: "Não entregue",
};

// ---- Tempo real ----
// O payload do Realtime traz a linha crua; em vez de montar o modelo na mão,
// refaz a busca (o mesmo desenho do quadro de leads).
const liveStatus = ref<"conectando" | "on" | "off">("conectando");
let channel: RealtimeChannel | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let polling: ReturnType<typeof setInterval> | null = null;

function agendarRecarga() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    recarregarLista();
    if (abertaId.value) carregarAberta();
  }, 400);
}

onMounted(async () => {
  const tenantId = tenant.value?.id;
  if (!tenantId) return;
  const client = await getAdminSupabase();
  const filter = `tenant_id=eq.${tenantId}`;
  channel = client
    .channel(`conversas-${tenantId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversations", filter }, agendarRecarga)
    .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_messages", filter }, agendarRecarga)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") liveStatus.value = "on";
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") liveStatus.value = "off";
    });
});

// Sem tempo real, recarga a cada 20s: uma caixa de entrada parada parecendo
// atualizada é pior do que uma que avisa e recarrega devagar.
watch(liveStatus, (s) => {
  if (s === "off" && !polling) polling = setInterval(agendarRecarga, 20000);
  if (s === "on" && polling) {
    clearInterval(polling);
    polling = null;
  }
});

onBeforeUnmount(async () => {
  if (tick) clearInterval(tick);
  if (timer) clearTimeout(timer);
  if (polling) clearInterval(polling);
  if (!channel) return;
  const client = await getAdminSupabase();
  await client.removeChannel(channel);
  channel = null;
});
</script>

<template>
  <div class="conv-page">
    <div class="page-head">
      <div>
        <h1>Conversas</h1>
        <p class="sub">
          O WhatsApp da imobiliária num lugar só. Quem manda mensagem vira contato no funil, com o imóvel de onde veio.
        </p>
      </div>
      <p v-if="conta?.conectado" class="numero">
        <AppIcon name="wa" />
        <span>{{ conta.verifiedName || "Número conectado" }} · {{ conta.displayPhone }}</span>
        <span class="live" :class="liveStatus" role="status">
          {{ liveStatus === "on" ? "Ao vivo" : liveStatus === "off" ? "Atualizando a cada 20s" : "Conectando…" }}
        </span>
      </p>
    </div>

    <!-- Estado: ainda carregando a conta -->
    <div v-if="contaPending && !conta" class="skel" aria-busy="true" aria-label="Carregando">
      <span v-for="i in 3" :key="i" class="skel-row" />
    </div>
    <div v-else-if="contaErro" class="admin-card estado" role="alert">
      <p>Não foi possível carregar. Verifique a conexão.</p>
      <button type="button" class="admin-btn" @click="recarregarConta()">Tentar de novo</button>
    </div>

    <!-- Estado: sem número conectado — a tela vazia leva direto a conectar -->
    <section v-else-if="!conta?.conectado" class="admin-card conectar" aria-labelledby="conectar-t">
      <AppIcon name="wa" class="estado-ico" />
      <h2 id="conectar-t">Conectar o WhatsApp da imobiliária</h2>
      <p class="estado-d">
        Pela API oficial do WhatsApp: o número continua funcionando no celular e as conversas passam a ficar
        registradas aqui. Os dados abaixo estão no painel da Meta, em <strong>WhatsApp → Configuração da API</strong>.
      </p>
      <p v-if="conta && !conta.plataformaPronta" class="aviso" role="alert">
        A plataforma ainda não tem o app da Meta configurado — as mensagens não chegariam. Fale com o suporte da
        Moradi antes de conectar.
      </p>
      <form class="conectar-form" @submit.prevent="conectar">
        <label>
          <span class="admin-label">Identificação do número de telefone</span>
          <input v-model.trim="conexao.phoneNumberId" class="admin-input" inputmode="numeric" autocomplete="off" required />
        </label>
        <label>
          <span class="admin-label">Identificação da conta do WhatsApp Business</span>
          <input v-model.trim="conexao.wabaId" class="admin-input" inputmode="numeric" autocomplete="off" required />
        </label>
        <label class="span-2">
          <span class="admin-label">Token de acesso (usuário do sistema)</span>
          <input
            v-model.trim="conexao.accessToken"
            class="admin-input"
            type="password"
            autocomplete="off"
            required
            aria-describedby="token-ajuda"
          />
          <span id="token-ajuda" class="ajuda">Guardado cifrado. Nunca aparece de novo nesta tela.</span>
        </label>
        <div v-if="conta?.webhookUrl" class="span-2 webhook">
          <span class="admin-label">Endereço do webhook (para o app da Meta)</span>
          <div class="webhook-linha">
            <code>{{ conta.webhookUrl }}</code>
            <button type="button" class="admin-btn ghost" @click="copiar(conta.webhookUrl)"><AppIcon name="copy" /> Copiar</button>
          </div>
        </div>
        <div class="span-2">
          <button class="admin-btn" :disabled="conectando || !conexao.phoneNumberId || !conexao.wabaId || !conexao.accessToken">
            {{ conectando ? "Conferindo com a Meta…" : "Conectar número" }}
          </button>
        </div>
      </form>
    </section>

    <!-- Caixa de entrada -->
    <div v-else class="inbox" :class="{ 'com-aberta': abertaId }">
      <aside class="col-lista" aria-label="Conversas">
        <div class="lista-topo">
          <div class="seg" role="radiogroup" aria-label="Filtrar conversas">
            <button
              v-for="f in WHATSAPP_FILTROS"
              :key="f"
              type="button"
              role="radio"
              :aria-checked="filtro === f"
              :class="{ on: filtro === f }"
              @click="filtro = f"
            >
              {{ WHATSAPP_FILTRO_LABELS[f] }}
            </button>
          </div>
          <select v-if="brokers?.length" v-model="corretor" class="admin-input" aria-label="Filtrar por corretor">
            <option value="">Todos os corretores</option>
            <option v-for="b in brokers" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <p class="resumo" role="status" aria-atomic="true">
            <template v-if="semResposta">{{ semResposta }} conversa{{ semResposta > 1 ? "s" : "" }} esperando resposta</template>
            <template v-else-if="conversas?.length">Todas respondidas</template>
          </p>
        </div>

        <div v-if="listaPending && !conversas?.length" class="skel" aria-busy="true" aria-label="Carregando conversas">
          <span v-for="i in 5" :key="i" class="skel-row" />
        </div>
        <div v-else-if="listaErro" class="estado" role="alert">
          <p>Não foi possível carregar as conversas.</p>
          <button type="button" class="admin-btn" @click="recarregarLista()">Tentar de novo</button>
        </div>
        <div v-else-if="!conversas?.length" class="estado">
          <AppIcon name="inbox" class="estado-ico" />
          <p class="estado-t">{{ filtro === "todas" ? "Nenhuma conversa ainda." : "Nada por aqui." }}</p>
          <p class="estado-d">
            {{
              filtro === "todas"
                ? "Quando alguém mandar mensagem para o número conectado, a conversa aparece aqui na hora."
                : "Nenhuma conversa neste filtro."
            }}
          </p>
        </div>
        <ul v-else class="lista">
          <li v-for="c in conversas" :key="c.id">
            <button
              type="button"
              class="item"
              :class="{ on: c.id === abertaId, esperando: aguardandoResposta(c) }"
              :aria-current="c.id === abertaId ? 'true' : undefined"
              @click="abrir(c.id)"
            >
              <span class="item-l1">
                <strong class="item-nome">{{ nomeDe(c) }}</strong>
                <time class="item-hora" :datetime="c.lastMessageAt">{{ horaCurta(c.lastMessageAt) }}</time>
              </span>
              <span class="item-l2">
                <span class="item-prev">
                  <template v-if="c.lastDirection === 'out'">Você: </template>{{ c.lastMessagePreview }}
                </span>
                <span v-if="c.unreadCount" class="badge-n" :aria-label="`${c.unreadCount} não lidas`">{{ c.unreadCount }}</span>
              </span>
              <span class="item-l3">
                <span v-if="aguardandoResposta(c)" class="tag espera"><AppIcon name="clock" /> {{ ha(c.lastMessageAt) === "agora" ? "Acabou de chegar" : `Esperando ${ha(c.lastMessageAt)}` }}</span>
                <span v-if="c.propertyCode" class="tag">{{ formatPropertyCode(c.propertyCode) }}</span>
                <span v-if="c.brokerName" class="tag">{{ c.brokerName }}</span>
              </span>
            </button>
          </li>
        </ul>
      </aside>

      <section class="col-conversa" aria-label="Conversa">
        <div v-if="!abertaId" class="estado vazio-conversa">
          <AppIcon name="wa" class="estado-ico" />
          <p class="estado-d">Escolha uma conversa na lista.</p>
        </div>
        <div v-else-if="abertaPending" class="skel" aria-busy="true" aria-label="Carregando conversa">
          <span v-for="i in 4" :key="i" class="skel-row" />
        </div>
        <div v-else-if="abertaErro || !aberta" class="estado" role="alert">
          <p>Não foi possível abrir a conversa.</p>
          <button type="button" class="admin-btn" @click="carregarAberta()">Tentar de novo</button>
        </div>
        <template v-else>
          <header class="conv-topo">
            <button type="button" class="voltar" aria-label="Voltar para a lista" @click="abertaId = ''">
              <AppIcon name="arrow-left" />
            </button>
            <div class="conv-quem">
              <strong>{{ nomeDe(aberta.conversa) }}</strong>
              <span>{{ formatWhatsapp(aberta.conversa.waId) }}</span>
            </div>
            <NuxtLink v-if="aberta.conversa.leadId" :to="`/admin/leads?lead=${aberta.conversa.leadId}`" class="admin-btn ghost">
              Ver contato
            </NuxtLink>
          </header>

          <ol ref="listaMsgs" class="msgs" aria-live="polite" aria-relevant="additions">
            <li v-for="m in aberta.mensagens" :key="m.id" class="msg" :class="m.direction">
              <p class="msg-txt" :class="{ midia: !m.body }">{{ textoDaMensagem(m.type, m.body) }}</p>
              <span class="msg-meta">
                <time :datetime="m.occurredAt">{{ horaDaMensagem(m.occurredAt) }}</time>
                <template v-if="m.origin === 'app'"> · pelo celular</template>
                <template v-if="m.direction === 'out' && STATUS_ROTULO[m.status]">
                  · <span :class="{ falhou: m.status === 'falhou' }">{{ STATUS_ROTULO[m.status] }}</span>
                </template>
              </span>
              <span v-if="m.status === 'falhou' && m.error" class="msg-erro">{{ m.error }}</span>
            </li>
          </ol>

          <form v-if="aberta.janelaAberta" class="compor" @submit.prevent="enviar">
            <label class="sr-only" for="resposta">Resposta</label>
            <textarea
              id="resposta"
              v-model="resposta"
              class="admin-input"
              rows="2"
              :maxlength="WHATSAPP_TEXTO_MAX"
              placeholder="Escreva a resposta (Enter envia, Shift+Enter quebra linha)"
              :disabled="enviando"
              @keydown="aoTeclar"
            />
            <button class="admin-btn" :disabled="enviando || !resposta.trim()">
              {{ enviando ? "Enviando…" : "Enviar" }}
            </button>
          </form>
          <p v-else class="janela-fechada" role="note">
            <AppIcon name="lock" />
            <span>
              Passaram 24h desde a última mensagem do cliente. Pela regra do WhatsApp, a conversa só pode ser retomada
              com um modelo aprovado — ou pelo celular, se o cliente escrever de novo.
            </span>
          </p>
        </template>
      </section>

      <aside v-if="aberta && abertaId" class="col-contato" aria-label="Contato">
        <h2>Contato</h2>
        <dl>
          <template v-if="aberta.conversa.leadId">
            <dt>No funil</dt>
            <dd>{{ aberta.conversa.leadStage ? LEAD_STAGE_LABELS[aberta.conversa.leadStage as LeadStage] : "—" }}</dd>
            <dt>Corretor</dt>
            <dd>{{ aberta.conversa.brokerName || "Sem corretor" }}</dd>
          </template>
          <template v-else>
            <dt>No funil</dt>
            <dd>Ainda não é contato</dd>
          </template>
          <template v-if="aberta.conversa.propertyCode">
            <dt>Imóvel de interesse</dt>
            <dd>
              <strong>{{ formatPropertyCode(aberta.conversa.propertyCode) }}</strong>
              <span v-if="aberta.conversa.propertyTitle" class="dd-sub">{{ aberta.conversa.propertyTitle }}</span>
            </dd>
          </template>
          <dt>Primeira resposta</dt>
          <dd>{{ aberta.conversa.firstResponseAt ? `em ${tempoDeResposta(aberta.conversa)}` : "Ainda não respondida" }}</dd>
          <dt>Início da conversa</dt>
          <dd>{{ new Date(aberta.conversa.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) }}</dd>
        </dl>
        <NuxtLink v-if="aberta.conversa.leadId" :to="`/admin/leads?lead=${aberta.conversa.leadId}`" class="admin-btn ghost bloco">
          Abrir no funil
        </NuxtLink>
      </aside>
    </div>

    <details v-if="conta?.conectado" class="gerenciar">
      <summary>Gerenciar número</summary>
      <p class="estado-d">
        Desconectar apaga o token daqui. As conversas continuam no painel, mas nenhuma mensagem nova entra nem sai.
      </p>
      <button v-if="!confirmarDesconexao" type="button" class="admin-btn ghost perigo" @click="confirmarDesconexao = true">
        Desconectar WhatsApp
      </button>
      <span v-else class="confirmar">
        <span>Tem certeza?</span>
        <button type="button" class="admin-btn perigo" @click="desconectar">Sim, desconectar</button>
        <button type="button" class="admin-btn ghost" @click="confirmarDesconexao = false">Cancelar</button>
      </span>
    </details>
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
.numero {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.numero :deep(svg) {
  width: 18px;
  height: 18px;
  color: var(--wa);
}
.live {
  border-radius: var(--r-pill);
  padding: 2px 10px;
  border: 1px solid var(--line-2);
  font-size: var(--fs-caption);
}
.live.on {
  color: var(--ok);
  border-color: currentColor;
}
.live.off {
  color: var(--danger);
  border-color: var(--danger-line);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Estados */
.estado {
  text-align: center;
  padding: 32px 16px;
  display: grid;
  justify-items: center;
  gap: 8px;
}
.estado-ico {
  width: 32px;
  height: 32px;
  color: var(--ink-soft);
}
.estado-t {
  font-weight: 600;
  margin: 0;
}
.estado-d {
  color: var(--ink-soft);
  margin: 0;
  font-size: var(--fs-ui);
  max-width: 60ch;
}
.skel {
  display: grid;
  gap: 10px;
  padding: 12px;
}
.skel-row {
  height: 56px;
  border-radius: var(--r-md);
  background: var(--surface);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skel-row {
    animation: none;
  }
}

/* Conectar */
.conectar {
  display: grid;
  gap: 10px;
  justify-items: start;
}
.conectar h2 {
  margin: 0;
  font-size: var(--fs-title-sm);
}
.conectar .estado-ico {
  color: var(--wa);
}
.aviso {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--danger-ghost);
  border: 1px solid var(--danger-line);
  color: var(--danger);
  font-size: var(--fs-label);
}
.conectar-form {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-top: 6px;
}
.conectar-form label {
  display: grid;
  gap: 6px;
}
.span-2 {
  grid-column: 1 / -1;
}
.ajuda {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.webhook {
  display: grid;
  gap: 6px;
}
.webhook-linha {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.webhook code {
  overflow-wrap: anywhere;
  background: var(--surface);
  padding: 8px 10px;
  border-radius: var(--r-sm);
  font-size: var(--fs-label);
  min-width: 0;
  flex: 1;
}
@media (max-width: 640px) {
  .conectar-form {
    grid-template-columns: 1fr;
  }
}

/* Caixa de entrada: três colunas no computador */
.inbox {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr) 260px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  background: var(--paper);
  box-shadow: var(--shadow);
  height: calc(100dvh - 210px);
  min-height: 480px;
  overflow: hidden;
}
.col-lista {
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lista-topo {
  padding: 12px;
  display: grid;
  gap: 8px;
  border-bottom: 1px solid var(--line);
}
.seg {
  display: flex;
  gap: 4px;
  background: var(--surface);
  border-radius: var(--r-pill);
  padding: 3px;
}
.seg button {
  flex: 1;
  border: 0;
  background: transparent;
  border-radius: var(--r-pill);
  padding: 7px 8px;
  min-height: 36px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  cursor: pointer;
}
.seg button.on {
  background: var(--paper);
  color: var(--ink);
  font-weight: 600;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
.seg button:focus-visible,
.item:focus-visible,
.voltar:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.resumo {
  margin: 0;
  min-height: 1.2em;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
}
.item {
  width: 100%;
  text-align: left;
  border: 0;
  border-bottom: 1px solid var(--line);
  background: transparent;
  padding: 12px 14px;
  display: grid;
  gap: 4px;
  cursor: pointer;
  border-left: 3px solid transparent;
}
.item:hover {
  background: var(--surface);
}
.item.on {
  background: var(--brand-ghost);
  border-left-color: var(--brand);
}
.item-l1,
.item-l2 {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.item-nome {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-hora {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
.item-prev {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.badge-n {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: var(--wa);
  color: #fff;
  font-size: var(--fs-caption);
  font-weight: 700;
  display: inline-grid;
  place-items: center;
  font-variant-numeric: tabular-nums;
}
.item-l3 {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.item-l3:empty {
  display: none;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-caption);
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  padding: 1px 8px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.tag :deep(svg) {
  width: 12px;
  height: 12px;
}
/* Texto, não só cor: "Esperando 12 min" se lê sem distinguir o vermelho. */
.tag.espera {
  color: var(--danger);
  border-color: var(--danger-line);
  background: var(--danger-ghost);
  font-weight: 600;
}

/* Conversa */
.col-conversa {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface);
}
.vazio-conversa {
  margin: auto;
}
.conv-topo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
}
.voltar {
  display: none;
  border: 0;
  background: transparent;
  width: 44px;
  height: 44px;
  border-radius: var(--r-pill);
  cursor: pointer;
  place-items: center;
}
.voltar :deep(svg) {
  width: 20px;
  height: 20px;
}
.conv-quem {
  flex: 1;
  min-width: 0;
  display: grid;
}
.conv-quem strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-quem span {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.msgs {
  list-style: none;
  margin: 0;
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.msg {
  max-width: min(75%, 560px);
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--paper);
  border: 1px solid var(--line);
  align-self: flex-start;
}
.msg.out {
  align-self: flex-end;
  background: var(--brand-ghost);
  border-color: color-mix(in srgb, var(--brand) 20%, white);
}
.msg-txt {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--fs-ui);
  line-height: 1.5;
}
.msg-txt.midia {
  font-style: italic;
  color: var(--ink-soft);
}
.msg-meta {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.falhou,
.msg-erro {
  color: var(--danger);
  font-weight: 600;
}
.msg-erro {
  display: block;
  font-size: var(--fs-caption);
  font-weight: 400;
}
.compor {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 10px 12px;
  background: var(--paper);
  border-top: 1px solid var(--line);
}
.compor textarea {
  flex: 1;
  resize: none;
  min-height: 44px;
  max-height: 160px;
  font-size: 16px; /* 16px evita o zoom automático do iOS ao focar */
}
.compor .admin-btn {
  min-height: 44px;
}
.janela-fechada {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 0;
  padding: 12px 14px;
  background: var(--paper);
  border-top: 1px solid var(--line);
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.janela-fechada :deep(svg) {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 2px;
}

/* Contato */
.col-contato {
  border-left: 1px solid var(--line);
  padding: 16px;
  overflow-y: auto;
}
.col-contato h2 {
  margin: 0 0 10px;
  font-size: var(--fs-ui);
}
.col-contato dl {
  margin: 0 0 14px;
  display: grid;
  gap: 2px;
}
.col-contato dt {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
  margin-top: 8px;
}
.col-contato dd {
  margin: 0;
  font-size: var(--fs-label);
  display: grid;
}
.dd-sub {
  color: var(--ink-soft);
}
.bloco {
  display: block;
  text-align: center;
}

.gerenciar {
  margin-top: 16px;
  font-size: var(--fs-label);
}
.gerenciar summary {
  cursor: pointer;
  color: var(--ink-soft);
  min-height: 24px;
}
.gerenciar .estado-d {
  margin: 8px 0;
}
.perigo {
  color: var(--danger);
}
.admin-btn.perigo:not(.ghost) {
  background: var(--danger);
  color: #fff;
}
.confirmar {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

/* Tablet: o painel do contato sai; o essencial dele já está no topo da conversa. */
@media (max-width: 1100px) {
  .inbox {
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  }
  .col-contato {
    display: none;
  }
}

/* Celular: uma coluna por vez, a conversa na URL. */
@media (max-width: 767px) {
  .inbox {
    grid-template-columns: 1fr;
    height: calc(100dvh - 190px - var(--admin-bottom-nav, 64px));
  }
  .inbox.com-aberta .col-lista {
    display: none;
  }
  .inbox:not(.com-aberta) .col-conversa {
    display: none;
  }
  .col-lista {
    border-right: 0;
  }
  .voltar {
    display: inline-grid;
  }
  .msg {
    max-width: 85%;
  }
}
</style>

<script setup lang="ts">
import type { WhatsappTemplate } from "~~/shared/models/whatsapp";
import {
  MODELOS_SUGERIDOS,
  WHATSAPP_CATEGORIA_LABELS,
  WHATSAPP_TEMPLATE_STATUS_LABELS,
  preencherModelo,
  problemaNoValor,
} from "~~/shared/models/whatsapp";

/**
 * Escolher e enviar um modelo aprovado pela Meta — fora da janela de 24h, ou
 * para começar a conversa com quem chegou pelo formulário do site.
 *
 * O texto que aparece na prévia é o mesmo que o servidor grava no histórico:
 * os dois montam com `preencherModelo`. O servidor relê o modelo na Meta e
 * não confia no que esta tela mostrou.
 */
const props = defineProps<{
  /** Endpoint que envia (conversa ou contato). */
  enviarPara: string;
  /** Nome do cliente, para preencher o primeiro campo dos modelos sugeridos. */
  nomeDoCliente: string | null;
  titulo?: string;
}>();
const emit = defineEmits<{ enviado: [r: { conversationId?: string }]; cancelar: [] }>();

const tenant = useTenant();
const toast = useToast();

const {
  data: modelos,
  pending,
  error,
  refresh,
} = useLazyAsyncData(`admin:whatsapp:modelos:${props.enviarPara}`, () => adminFetch<WhatsappTemplate[]>("/api/admin/whatsapp/templates"), {
  server: false,
  default: () => [] as WhatsappTemplate[],
});

const disponiveis = computed(() => (modelos.value ?? []).filter((m) => m.status === "aprovado" && m.suportado));
const outros = computed(() => (modelos.value ?? []).filter((m) => !(m.status === "aprovado" && m.suportado)));

const escolhidoKey = ref("");
const chave = (m: WhatsappTemplate) => `${m.name}|${m.language}`;
const escolhido = computed(() => disponiveis.value.find((m) => chave(m) === escolhidoKey.value) ?? null);
watch(disponiveis, (d) => {
  if (!escolhidoKey.value && d[0]) escolhidoKey.value = chave(d[0]);
}, { immediate: true });

const valores = ref<string[]>([]);
const primeiroNome = computed(() => (props.nomeDoCliente || "").trim().split(/\s+/)[0] || "");
// Troca de modelo recomeça os campos. Nos sugeridos, os dois são conhecidos
// (cliente e imobiliária) e já vêm preenchidos — é o caso comum, e digitar o
// nome da própria imobiliária a cada envio é o tipo de atrito que faz o
// corretor voltar para o celular.
watch(escolhido, (m) => {
  if (!m) return;
  const sugerido = MODELOS_SUGERIDOS.some((s) => s.name === m.name);
  valores.value = m.variables.map((_, i) => (sugerido ? [primeiroNome.value, tenant.value?.name || ""][i] ?? "" : ""));
}, { immediate: true });

function rotulo(m: WhatsappTemplate, i: number): string {
  if (MODELOS_SUGERIDOS.some((s) => s.name === m.name)) return ["Nome do cliente", "Nome da imobiliária"][i] ?? `Campo ${i + 1}`;
  const v = m.variables[i]!;
  return /^\d+$/.test(v) ? `Campo {{${v}}}` : `Campo "${v}"`;
}

const previa = computed(() => (escolhido.value ? preencherModelo(escolhido.value.body, escolhido.value.variables, valores.value) : ""));
const problema = computed(() => valores.value.map(problemaNoValor).find(Boolean) ?? null);

const enviando = ref(false);
async function enviar() {
  const m = escolhido.value;
  if (!m || problema.value || enviando.value) return;
  enviando.value = true;
  try {
    const r = await adminFetch<{ conversationId?: string }>(props.enviarPara, {
      method: "POST",
      body: { name: m.name, language: m.language, values: valores.value.map((v) => v.trim()) },
    });
    toast.success("Modelo enviado.");
    emit("enviado", r ?? {});
  } catch (e) {
    toast.error(friendlyErrorMessage(e, "O modelo não foi enviado."));
  } finally {
    enviando.value = false;
  }
}

const criando = ref(false);
async function criarSugeridos() {
  criando.value = true;
  try {
    await adminFetch("/api/admin/whatsapp/templates/sugeridos", { method: "POST" });
    toast.success("Modelos enviados para análise da Meta. Costuma levar de minutos a algumas horas.");
    await refresh();
  } catch (e) {
    toast.error(friendlyErrorMessage(e, "Não foi possível criar os modelos."));
  } finally {
    criando.value = false;
  }
}
const faltamSugeridos = computed(() =>
  MODELOS_SUGERIDOS.some((s) => !(modelos.value ?? []).some((m) => m.name === s.name)),
);
</script>

<template>
  <section class="modelo" aria-labelledby="modelo-t">
    <h3 id="modelo-t">{{ titulo || "Enviar modelo aprovado" }}</h3>

    <div v-if="pending && !modelos?.length" class="skel" aria-busy="true" aria-label="Carregando modelos">
      <span v-for="i in 2" :key="i" class="skel-row" />
    </div>
    <div v-else-if="error" class="estado" role="alert">
      <p>{{ friendlyErrorMessage(error, "Não foi possível buscar os modelos na Meta.") }}</p>
      <button type="button" class="admin-btn ghost" @click="refresh()">Tentar de novo</button>
    </div>

    <template v-else>
      <p v-if="!disponiveis.length" class="nota">
        Nenhum modelo aprovado ainda. Fora das 24h, o WhatsApp só entrega mensagens a partir de um modelo que a Meta
        analisou.
      </p>

      <fieldset v-if="disponiveis.length" class="lista">
        <legend class="sr-only">Modelo</legend>
        <label v-for="m in disponiveis" :key="chave(m)" class="opcao" :class="{ on: escolhidoKey === chave(m) }">
          <input v-model="escolhidoKey" type="radio" name="modelo" :value="chave(m)" />
          <span class="op-nome">{{ m.name }}</span>
          <span class="tag">{{ WHATSAPP_CATEGORIA_LABELS[m.category] }}</span>
        </label>
      </fieldset>

      <form v-if="escolhido" class="campos" @submit.prevent="enviar">
        <label v-for="(_, i) in escolhido.variables" :key="i">
          <span class="admin-label">{{ rotulo(escolhido, i) }}</span>
          <input v-model="valores[i]" class="admin-input" maxlength="500" required />
        </label>
        <div class="previa" aria-label="Como o cliente vai ler">
          <span class="previa-t">Como o cliente vai ler</span>
          <p>{{ previa }}</p>
        </div>
        <p class="nota">
          <template v-if="escolhido.category === 'MARKETING'">
            Modelo de marketing: a Meta cobra cada envio na conta da imobiliária.
          </template>
          <template v-else>A Meta pode cobrar este envio na conta da imobiliária.</template>
        </p>
        <p v-if="problema" class="erro" role="alert">{{ problema }}</p>
        <div class="acoes">
          <button class="admin-btn" :disabled="enviando || Boolean(problema)">
            {{ enviando ? "Enviando…" : "Enviar modelo" }}
          </button>
          <button type="button" class="admin-btn ghost" @click="emit('cancelar')">Cancelar</button>
        </div>
      </form>

      <ul v-if="outros.length" class="outros" aria-label="Outros modelos da conta">
        <li v-for="m in outros" :key="chave(m)">
          <span>{{ m.name }}</span>
          <span class="tag">{{ m.status === "aprovado" ? "Tipo ainda não suportado pelo painel" : WHATSAPP_TEMPLATE_STATUS_LABELS[m.status] }}</span>
        </li>
      </ul>

      <div v-if="faltamSugeridos" class="sugeridos">
        <p class="nota">
          A Moradi tem dois modelos prontos em português — primeiro contato e retomar conversa. Criar pede a análise
          da Meta na conta da imobiliária.
        </p>
        <button type="button" class="admin-btn ghost" :disabled="criando" @click="criarSugeridos">
          {{ criando ? "Enviando para análise…" : "Criar modelos sugeridos" }}
        </button>
      </div>
      <button v-if="!disponiveis.length" type="button" class="admin-btn ghost" @click="emit('cancelar')">Fechar</button>
    </template>
  </section>
</template>

<style scoped>
.modelo {
  display: grid;
  gap: 10px;
}
.modelo h3 {
  margin: 0;
  font-size: var(--fs-ui);
}
.nota {
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.erro {
  margin: 0;
  font-size: var(--fs-label);
  color: var(--danger);
}
.lista {
  border: 0;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.opcao {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  cursor: pointer;
  min-height: 44px;
}
.opcao.on {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.opcao:focus-within {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.op-nome {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--fs-label);
}
.tag {
  font-size: var(--fs-caption);
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  padding: 1px 8px;
  color: var(--ink-soft);
  white-space: nowrap;
}
.campos {
  display: grid;
  gap: 10px;
}
.campos label {
  display: grid;
  gap: 4px;
}
.previa {
  background: var(--brand-ghost);
  border-radius: 12px;
  padding: 10px 12px;
}
.previa-t {
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.previa p {
  margin: 2px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--fs-ui);
}
.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.outros {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.outros li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.sugeridos {
  display: grid;
  gap: 8px;
  justify-items: start;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.estado {
  display: grid;
  gap: 8px;
  justify-items: start;
}
.estado p {
  margin: 0;
}
.skel {
  display: grid;
  gap: 8px;
}
.skel-row {
  height: 44px;
  border-radius: var(--r-sm);
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
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>

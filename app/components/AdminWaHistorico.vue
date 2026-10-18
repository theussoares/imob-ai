<script setup lang="ts">
import type { WhatsappAccountInfo, WhatsappHistoryMode } from "~~/shared/models/whatsapp";
import { ACEITE_DO_HISTORICO, WHATSAPP_HISTORY_MODE_LABELS, WHATSAPP_HISTORY_STATUS_LABELS } from "~~/shared/models/whatsapp";

/**
 * Importar as conversas que já estavam no app WhatsApp Business do celular.
 *
 * Aparece só nas 24h depois da conexão (o prazo da Meta), e a escolha padrão é
 * a mais estreita — só quem já é contato no funil. O texto do aceite vai ao
 * servidor como está: é ele, e não um "sim", que fica registrado.
 */
const props = defineProps<{ historico: WhatsappAccountInfo["historico"] }>();
const emit = defineEmits<{ atualizado: [] }>();
const toast = useToast();

const mode = ref<WhatsappHistoryMode>("so_leads");
const aceito = ref(false);
const pedindo = ref(false);
const aberto = ref(false);

const prazo = computed(() =>
  props.historico.prazo
    ? new Date(props.historico.prazo).toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" })
    : "",
);

async function pedir() {
  if (!aceito.value || pedindo.value) return;
  pedindo.value = true;
  try {
    await adminFetch("/api/admin/whatsapp/history", { method: "POST", body: { mode: mode.value, aceite: ACEITE_DO_HISTORICO } });
    toast.success("Pedido feito. As conversas chegam aos poucos, nos próximos minutos.");
    emit("atualizado");
  } catch (e) {
    toast.error(friendlyErrorMessage(e, "Não foi possível pedir o histórico."));
  } finally {
    pedindo.value = false;
  }
}
</script>

<template>
  <section v-if="historico.podePedir" class="hist admin-card" aria-labelledby="hist-t">
    <div class="hist-topo">
      <div>
        <h2 id="hist-t">Trazer as conversas do celular?</h2>
        <p class="nota">
          A Meta pode enviar até 6 meses de conversas do app WhatsApp Business. Dá para pedir só até
          <strong>{{ prazo }}</strong>.
        </p>
      </div>
      <button v-if="!aberto" type="button" class="admin-btn ghost" @click="aberto = true">Escolher</button>
    </div>

    <form v-if="aberto" class="hist-form" @submit.prevent="pedir">
      <fieldset class="opcoes">
        <legend class="admin-label">Quais conversas</legend>
        <label v-for="m in (['so_leads', 'tudo'] as WhatsappHistoryMode[])" :key="m" class="op" :class="{ on: mode === m }">
          <input v-model="mode" type="radio" name="hist-mode" :value="m" />
          <span>
            <strong>{{ WHATSAPP_HISTORY_MODE_LABELS[m] }}</strong>
            <span v-if="m === 'so_leads'">Recomendado. Conversas pessoais e de quem nunca foi cliente ficam de fora.</span>
            <span v-else>Inclui conversas pessoais. As de quem não é contato no funil são apagadas depois de 90 dias sem mensagem.</span>
          </span>
        </label>
      </fieldset>
      <p class="nota">
        As conversas importadas não viram contato no funil, não geram aviso e não passam pela roleta. Fotos e áudios
        antigos são baixados só quando alguém abrir a conversa.
      </p>
      <label class="aceite">
        <input v-model="aceito" type="checkbox" />
        <span>{{ ACEITE_DO_HISTORICO }}</span>
      </label>
      <div class="acoes">
        <button class="admin-btn" :disabled="!aceito || pedindo">{{ pedindo ? "Pedindo…" : "Importar conversas" }}</button>
        <button type="button" class="admin-btn ghost" @click="aberto = false">Agora não</button>
      </div>
    </form>
  </section>
  <p v-else-if="historico.status" class="hist-status" role="status">
    <AppIcon :name="historico.status === 'concluido' ? 'check' : historico.status === 'recusado' || historico.status === 'falhou' ? 'alert' : 'clock'" />
    {{ WHATSAPP_HISTORY_STATUS_LABELS[historico.status] }}<template v-if="historico.mode"> · {{ WHATSAPP_HISTORY_MODE_LABELS[historico.mode].toLowerCase() }}</template>
  </p>
</template>

<style scoped>
.hist {
  margin-bottom: 16px;
  display: grid;
  gap: 12px;
}
.hist-topo {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.hist h2 {
  margin: 0;
  font-size: var(--fs-ui);
}
.nota {
  margin: 4px 0 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
  max-width: 70ch;
}
.hist-form {
  display: grid;
  gap: 12px;
}
.opcoes {
  border: 0;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.op {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.op.on {
  border-color: var(--brand);
  background: var(--brand-ghost);
}
.op:focus-within,
.aceite:focus-within {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.op input,
.aceite input {
  margin-top: 3px;
  flex: none;
}
.op > span {
  display: grid;
  gap: 2px;
}
.op > span > span {
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.aceite {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: var(--fs-label);
  cursor: pointer;
  border-radius: var(--r-sm);
}
.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hist-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.hist-status :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>

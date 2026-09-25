<script setup lang="ts">
import type { WhatsappClick } from "~~/shared/models/whatsapp-click";
import { WHATSAPP_CLICK_ORIGIN_LABELS } from "~~/shared/models/whatsapp-click";

/**
 * Cliques no WhatsApp dos últimos 7 dias, à parte do quadro.
 *
 * À parte porque clique não é contato: não tem nome nem telefone, e muito
 * clique não vira mensagem. No quadro, virariam cards vazios. Aqui ficam como
 * rastro para casar com a conversa que chegou — e o "Virar contato" leva para
 * o quadro só o que de fato virou conversa.
 */
const emit = defineEmits<{ converter: [click: WhatsappClick] }>();

const { data, pending, error, refresh } = useLazyAsyncData(
  "admin:whatsapp-clicks",
  () => adminFetch<WhatsappClick[]>("/api/admin/whatsapp-clicks"),
  { server: false, default: () => [] as WhatsappClick[] },
);
defineExpose({ refresh });

const clicks = computed(() => data.value ?? []);
const pendentes = computed(() => clicks.value.filter((c) => !c.leadId).length);

// Aberta quando há clique sem conversão: é quando existe algo a fazer. Com
// tudo convertido, fica fechada e não empurra o quadro para baixo.
const aberta = ref(false);
watch(pendentes, (n, antes) => {
  if (n > 0 && !antes) aberta.value = true;
}, { immediate: true });

const LIMITE = 5;
const verTodos = ref(false);
const visiveis = computed(() => (verTodos.value ? clicks.value : clicks.value.slice(0, LIMITE)));

/** "hoje 14:32", "ontem 09:10", "23/09 14:32" — a hora é o que casa com a conversa. */
function quando(iso: string) {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86400000);
  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmoDia(d, hoje)) return `hoje ${hora}`;
  if (mesmoDia(d, ontem)) return `ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

function destino(c: WhatsappClick) {
  if (c.destination === "corretor") return c.broker ? `corretor ${c.broker.name}` : "corretor";
  return "imobiliária";
}
</script>

<template>
  <section v-if="clicks.length || error" class="admin-card wa-clicks" aria-labelledby="wa-clicks-t">
    <button
      type="button"
      class="wa-head"
      :aria-expanded="aberta"
      aria-controls="wa-clicks-lista"
      @click="aberta = !aberta"
    >
      <AppIcon name="wa" />
      <span id="wa-clicks-t" class="wa-t">Cliques no WhatsApp</span>
      <span class="wa-n">últimos 7 dias · {{ clicks.length }}</span>
      <span v-if="pendentes" class="wa-pend">{{ pendentes }} sem contato</span>
      <span class="wa-chev" aria-hidden="true">{{ aberta ? "▾" : "▸" }}</span>
    </button>

    <div v-if="aberta" id="wa-clicks-lista">
      <p class="hint">
        Alguém abriu o WhatsApp a partir do site. O clique não diz quem foi: quando a
        mensagem chegar, confira o horário e o imóvel e use “Virar contato”.
      </p>

      <p v-if="error" class="err" role="alert">
        Não foi possível carregar os cliques.
        <button type="button" class="link-btn" @click="refresh()">Tentar de novo</button>
      </p>

      <ul class="wa-list">
        <li v-for="c in visiveis" :key="c.id" class="wa-item" :class="{ done: c.leadId }">
          <div class="wa-info">
            <strong v-if="c.property">{{ c.property.code }} · {{ c.property.title }}</strong>
            <strong v-else>Sem imóvel</strong>
            <small>
              {{ quando(c.createdAt) }} · foi para {{ destino(c) }} ·
              {{ WHATSAPP_CLICK_ORIGIN_LABELS[c.origin] }}
            </small>
          </div>
          <span v-if="c.leadId" class="wa-ok"><AppIcon name="check" /> Virou contato</span>
          <button
            v-else
            type="button"
            class="admin-btn ghost sm"
            :disabled="pending"
            @click="emit('converter', c)"
          >
            Virar contato
          </button>
        </li>
      </ul>

      <button
        v-if="clicks.length > LIMITE"
        type="button"
        class="link-btn wa-more"
        @click="verTodos = !verTodos"
      >
        {{ verTodos ? "Mostrar menos" : `Ver todos (${clicks.length})` }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.wa-clicks {
  margin-bottom: 16px;
  padding: 0;
  overflow: hidden;
}
.wa-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  flex-wrap: wrap;
}
.wa-head :deep(svg) {
  width: 18px;
  height: 18px;
  color: var(--wa, #25d366);
}
.wa-t {
  font-weight: 700;
}
.wa-n {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
}
.wa-pend {
  font-size: var(--fs-caption);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--brand);
}
.wa-chev {
  margin-left: auto;
  color: var(--ink-soft);
}
#wa-clicks-lista {
  padding: 0 16px 14px;
}
.hint {
  margin: 0 0 10px;
  color: var(--ink-soft);
  font-size: var(--fs-label);
}
.wa-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.wa-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.wa-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.wa-info strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wa-info small {
  color: var(--ink-soft);
  font-size: var(--fs-caption);
}
.wa-item.done .wa-info {
  opacity: 0.6;
}
.wa-ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.wa-ok :deep(svg) {
  width: 14px;
  height: 14px;
}
.wa-more {
  margin-top: 6px;
}
.err {
  color: #b91c1c;
  font-size: var(--fs-label);
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  color: var(--brand);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}
</style>

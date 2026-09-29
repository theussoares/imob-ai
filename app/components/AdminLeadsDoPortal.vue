<script setup lang="ts">
/**
 * "Receber leads no CRM" do Canal Pro: a URL secreta e o WhatsApp automático.
 *
 * Fica logo abaixo do feed de imóveis porque é a mesma tela do Canal Pro
 * (Integrações) e a mesma conversa com o cliente — o feed manda os imóveis,
 * esta URL traz de volta quem se interessou por eles.
 */
interface Config {
  url: string;
  autoWhatsapp: boolean;
  whatsappDisponivel: boolean;
}
const toast = useToast();
const cfg = ref<Config | null>(null);
const erro = ref("");
const copiado = ref(false);
const salvando = ref(false);

onMounted(async () => {
  try {
    cfg.value = await adminFetch<Config>("/api/admin/portais/leads");
  } catch {
    erro.value = "Não foi possível carregar o link de leads. Recarregue a página.";
  }
});

async function copiar() {
  if (!cfg.value) return;
  try {
    await navigator.clipboard.writeText(cfg.value.url);
    copiado.value = true;
    setTimeout(() => (copiado.value = false), 2000);
  } catch {
    /* clipboard indisponível: a pessoa copia do campo */
  }
}

const confirmarTroca = ref(false);
async function trocarLink() {
  confirmarTroca.value = false;
  try {
    await adminFetch("/api/admin/portais/leads/rotacionar", { method: "POST" });
    cfg.value = await adminFetch<Config>("/api/admin/portais/leads");
    toast.success("Link novo gerado. Cole no Canal Pro — o antigo já não funciona.");
  } catch (e) {
    toast.error(friendlyErrorMessage(e, "Não foi possível gerar um link novo."));
  }
}

async function alternar(ligado: boolean) {
  if (!cfg.value) return;
  salvando.value = true;
  const antes = cfg.value.autoWhatsapp;
  cfg.value.autoWhatsapp = ligado;
  try {
    await adminFetch("/api/admin/portais/leads", { method: "PUT", body: { autoWhatsapp: ligado } });
    toast.success(ligado ? "Todo lead novo de portal recebe o primeiro WhatsApp automaticamente." : "WhatsApp automático desligado.");
  } catch (e) {
    cfg.value.autoWhatsapp = antes;
    toast.error(friendlyErrorMessage(e, "Não foi possível salvar."));
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <div class="leads-portal">
    <h4 class="sub-t">Receber os leads dos portais no funil</h4>
    <p class="hint-text">
      No Canal Pro, em <em>Configurações → Integrações → Leads → Receber leads no CRM</em>, dê o nome
      <strong>Moradi</strong> e cole o link abaixo. Cada pessoa que chamar num anúncio entra direto em Contatos, com o
      imóvel, e passa pela roleta e pelo aviso como o contato do site.
    </p>
    <p v-if="erro" role="alert" class="erro">{{ erro }}</p>
    <p v-else-if="!cfg" class="hint-text">Carregando…</p>
    <template v-else>
      <div class="feed-row">
        <input class="admin-input url" :value="cfg.url" readonly aria-label="Link de leads para o Canal Pro" @focus="($event.target as HTMLInputElement).select()" />
        <button type="button" class="admin-btn ghost" @click="copiar">{{ copiado ? "Copiado!" : "Copiar link" }}</button>
      </div>
      <p class="hint-text">
        O link é secreto: quem o tiver consegue criar contatos no seu funil. Não publique.
        <template v-if="!confirmarTroca">
          Vazou? <button type="button" class="link-btn" @click="confirmarTroca = true">Gerar um link novo</button>
        </template>
      </p>
      <p v-if="confirmarTroca" class="confirmar" role="alert">
        O link atual para de funcionar na hora, e os leads só voltam a entrar depois que você colar o novo no Canal Pro.
        <button type="button" class="admin-btn" @click="trocarLink">Gerar link novo</button>
        <button type="button" class="admin-btn ghost" @click="confirmarTroca = false">Cancelar</button>
      </p>

      <label v-if="cfg.whatsappDisponivel" class="auto">
        <input type="checkbox" :checked="cfg.autoWhatsapp" :disabled="salvando" @change="alternar(($event.target as HTMLInputElement).checked)" />
        <span>
          <strong>Mandar o primeiro WhatsApp na hora</strong>
          <span>
            Usa o modelo <code>moradi_primeiro_contato</code> (precisa estar aprovado pela Meta, em Conversas). A conversa
            já nasce no painel. A Meta cobra cada envio na conta da imobiliária.
          </span>
        </span>
      </label>
    </template>
  </div>
</template>

<style scoped>
.leads-portal {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 8px;
}
.sub-t {
  margin: 0;
  font-size: var(--fs-ui);
}
.hint-text {
  margin: 0;
  font-size: 13px;
  color: var(--ink-soft);
}
.erro {
  margin: 0;
  color: var(--danger);
}
.feed-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.url {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.link-btn {
  border: 0;
  background: none;
  padding: 0;
  color: var(--brand);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.confirmar {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--danger-ghost);
  border: 1px solid var(--danger-line);
  font-size: 13px;
}
.auto {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-sm);
  cursor: pointer;
}
.auto:focus-within {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.auto input {
  margin-top: 3px;
  flex: none;
}
.auto > span {
  display: grid;
  gap: 2px;
}
.auto > span > span {
  font-size: 13px;
  color: var(--ink-soft);
}
</style>

<script setup lang="ts">
import type {
  ContractDetail,
  ContractParty,
  ContractPartyRole,
  ContractSavePayload,
  ContractStatus,
  PortalUser,
} from "~~/shared/models/portal";
import {
  CONTRACT_PARTY_ROLES,
  CONTRACT_ROLE_LABELS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
} from "~~/shared/models/portal";
import type { Property } from "~~/shared/models/property";

definePageMeta({ layout: "admin", middleware: "admin" });

const route = useRoute();
const toast = useToast();
const { askConfirm } = useConfirm();
const id = computed(() => String(route.params.id));
const isNew = computed(() => id.value === "novo");

const form = reactive({
  code: "",
  propertyId: "",
  addressLabel: "",
  status: "ativo" as ContractStatus,
  startedOn: "",
  endsOn: "",
  rentAmount: 0,
  dueDay: null as number | null,
  adjustmentIndex: "",
  notes: "",
  adminFeePercent: null as number | null,
  externalId: "",
});

// Aluguel: o campo exibe "R$ 1.850", o model guarda o inteiro 1850. Mesma
// convenção sem centavos que o resto do app usa para preço.
const { display: rentDisplay, onInput: onRentInput } = useMoneyInput(
  toRef(form, "rentAmount"),
);

const { data: properties } = useLazyAsyncData(
  "admin:properties:list",
  () => adminFetch<Property[]>("/api/admin/properties"),
  { server: false, default: () => [] as Property[] },
);

const { data: portalUsers } = useLazyAsyncData(
  "admin:portal-users:list",
  () => adminFetch<PortalUser[]>("/api/admin/portal-users"),
  { server: false, default: () => [] as PortalUser[] },
);

const { data: detail, refresh: refreshDetail } = useLazyAsyncData(
  `admin:contract:${id.value}`,
  async () =>
    isNew.value
      ? null
      : await adminFetch<ContractDetail>(`/api/admin/contracts/${id.value}`),
  { server: false },
);

watchEffect(() => {
  const d = detail.value;
  if (!d) return;
  Object.assign(form, {
    code: d.contract.code,
    propertyId: d.contract.propertyId || "",
    addressLabel: d.contract.addressLabel || "",
    status: d.contract.status,
    startedOn: d.contract.startedOn || "",
    endsOn: d.contract.endsOn || "",
    rentAmount: d.contract.rentAmount || 0,
    dueDay: d.contract.dueDay,
    adjustmentIndex: d.contract.adjustmentIndex || "",
    notes: d.internal?.notes || "",
    adminFeePercent: d.internal?.adminFeePercent ?? null,
    externalId: d.internal?.externalId || "",
  });
});

const parties = computed<ContractParty[]>(() => detail.value?.parties || []);

const saving = ref(false);
const error = ref("");

/**
 * Avisos que NÃO bloqueiam o salvamento.
 *
 * O servidor recusa o inválido (dia fora de 1–31, taxa fora de 0–100, vigência
 * invertida). Aqui ficam as coisas que costumam ser esquecimento e que só doem
 * depois: contrato sem participante não aparece para ninguém no portal, e é
 * exatamente o caso que gera "cadastrei e o cliente não vê nada".
 */
const avisos = computed(() => {
  const out: string[] = [];
  if (!isNew.value && !parties.value.length) {
    out.push(
      "Nenhum participante vinculado — este contrato não aparece para ninguém na Área do Cliente.",
    );
  }
  if (
    !isNew.value &&
    parties.value.length > 0 &&
    !parties.value.some((p) => p.role === "inquilino")
  ) {
    out.push(
      "Sem inquilino no contrato: boletos e recibos não têm para quem aparecer.",
    );
  }
  if (form.propertyId && form.addressLabel) {
    out.push(
      "Imóvel do catálogo e endereço escrito à mão preenchidos — o cliente verá o endereço escrito à mão.",
    );
  }
  return out;
});

function payload(): ContractSavePayload {
  return {
    code: form.code,
    propertyId: form.propertyId || null,
    addressLabel: form.addressLabel || null,
    status: form.status,
    startedOn: form.startedOn || null,
    endsOn: form.endsOn || null,
    rentAmount: form.rentAmount || null,
    dueDay: form.dueDay ?? null,
    adjustmentIndex: form.adjustmentIndex || null,
    internal: {
      notes: form.notes || null,
      adminFeePercent: form.adminFeePercent ?? null,
      externalId: form.externalId || null,
    },
  };
}

async function save() {
  saving.value = true;
  error.value = "";
  try {
    if (isNew.value) {
      const criado = await adminFetch<{ id: string }>("/api/admin/contracts", {
        method: "POST",
        body: payload(),
      });
      toast.success("Contrato criado.");
      // Vai para a edição, e não para a lista: participante só pode ser
      // vinculado depois que o contrato tem id, e um contrato sem participante
      // não aparece para ninguém no portal.
      await navigateTo(`/admin/contratos/${criado.id}`);
    } else {
      await adminFetch(`/api/admin/contracts/${id.value}`, {
        method: "PUT",
        body: payload(),
      });
      toast.success("Contrato salvo.");
      await refreshDetail();
    }
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    error.value = err?.data?.statusMessage || "Não foi possível salvar.";
  } finally {
    saving.value = false;
  }
}

async function encerrar() {
  const ok = await askConfirm({
    title: `Encerrar o contrato ${form.code}?`,
    description:
      "O contrato sai da lista de ativos, mas continua visível para o cliente — os recibos dele ainda servem para o imposto de renda.",
    confirmLabel: "Encerrar",
  });
  if (!ok) return;
  form.status = "encerrado";
  await save();
}

// --- Participantes ---------------------------------------------------------

const novaParte = reactive({
  portalUserId: "",
  role: "inquilino" as ContractPartyRole,
});
const addingParty = ref(false);
const partyError = ref("");

async function addParty() {
  if (!novaParte.portalUserId) {
    partyError.value = "Escolha o cliente.";
    return;
  }
  addingParty.value = true;
  partyError.value = "";
  try {
    await adminFetch(`/api/admin/contracts/${id.value}/parties`, {
      method: "POST",
      body: { ...novaParte },
    });
    novaParte.portalUserId = "";
    await refreshDetail();
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    partyError.value =
      err?.data?.statusMessage || "Não foi possível vincular a pessoa.";
  } finally {
    addingParty.value = false;
  }
}

async function removeParty(p: ContractParty) {
  const ok = await askConfirm({
    title: `Tirar ${p.name} do contrato?`,
    description: `A pessoa perde o acesso a este contrato e aos documentos dele. O cadastro dela e o histórico de downloads continuam.`,
    confirmLabel: "Tirar do contrato",
    danger: true,
  });
  if (!ok) return;
  try {
    await adminFetch(`/api/admin/contracts/${id.value}/parties/${p.id}`, {
      method: "DELETE",
    });
    await refreshDetail();
    toast.success("Pessoa desvinculada do contrato.");
  } catch {
    toast.error("Não foi possível desvincular a pessoa.");
  }
}

useHead({
  title: computed(() =>
    isNew.value ? "Novo contrato · Painel" : `${form.code} · Painel`,
  ),
});
</script>

<template>
  <div>
    <NuxtLink class="back" to="/admin/contratos">← Contratos</NuxtLink>
    <h1>{{ isNew ? "Novo contrato" : form.code || "Contrato" }}</h1>

    <form class="admin-card" style="margin-top: 16px" @submit.prevent="save">
      <h3 class="section-t">Identificação</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Código *</label>
          <input
            v-model="form.code"
            class="admin-input"
            required
            placeholder="LOC-001"
          />
        </div>
        <div>
          <label class="admin-label">Situação</label>
          <select v-model="form.status" class="admin-select">
            <option v-for="s in CONTRACT_STATUSES" :key="s" :value="s">
              {{ CONTRACT_STATUS_LABELS[s] }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label">Imóvel do catálogo</label>
          <select v-model="form.propertyId" class="admin-select">
            <option value="">— Não está no catálogo —</option>
            <option v-for="p in properties" :key="p.id" :value="p.id">
              {{ p.code }} · {{ p.title }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label">Endereço (fora do catálogo)</label>
          <input
            v-model="form.addressLabel"
            class="admin-input"
            placeholder="Rua das Acácias, 250 — Apto 12"
          />
        </div>
      </div>

      <h3 class="section-t">Vigência e valores</h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Início</label>
          <input v-model="form.startedOn" class="admin-input" type="date" />
        </div>
        <div>
          <label class="admin-label">Término</label>
          <input v-model="form.endsOn" class="admin-input" type="date" />
        </div>
        <div>
          <label class="admin-label">Aluguel</label>
          <input
            :value="rentDisplay"
            class="admin-input"
            inputmode="numeric"
            placeholder="R$ 1.850"
            @input="onRentInput"
          />
        </div>
        <div>
          <label class="admin-label">Dia do vencimento</label>
          <input
            v-model.number="form.dueDay"
            class="admin-input"
            type="number"
            min="1"
            max="31"
            placeholder="10"
          />
        </div>
        <div>
          <label class="admin-label">Índice de reajuste</label>
          <input
            v-model="form.adjustmentIndex"
            class="admin-input"
            placeholder="IGP-M"
          />
        </div>
      </div>

      <!-- Campos internos: ficam em contract_internal e NUNCA chegam ao
           cliente. A separação visual existe para que isso fique claro para
           quem preenche. -->
      <h3 class="section-t">
        Interno da imobiliária
        <small>Não aparece para o cliente</small>
      </h3>
      <div class="form-grid">
        <div>
          <label class="admin-label">Taxa de administração (%)</label>
          <input
            v-model.number="form.adminFeePercent"
            class="admin-input"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="10"
          />
        </div>
        <div>
          <label class="admin-label">ID no ERP</label>
          <input v-model="form.externalId" class="admin-input" />
        </div>
        <div class="full">
          <label class="admin-label">Anotação</label>
          <textarea v-model="form.notes" class="admin-input" rows="3" />
        </div>
      </div>

      <ul v-if="avisos.length" class="avisos">
        <li v-for="a in avisos" :key="a">{{ a }}</li>
      </ul>

      <div class="form-actions">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : isNew ? "Criar contrato" : "Salvar" }}
        </button>
        <button
          v-if="!isNew && form.status === 'ativo'"
          class="admin-btn ghost"
          type="button"
          @click="encerrar"
        >
          Encerrar contrato
        </button>
      </div>
      <p v-if="error" class="err">{{ error }}</p>
    </form>

    <div v-if="!isNew" class="admin-card" style="margin-top: 18px">
      <h3 class="section-t">Participantes</h3>
      <p style="color: var(--ink-soft); font-size: 13px; margin: -6px 0 14px">
        Quem está neste contrato e em que papel. É o vínculo que dá acesso à
        Área do Cliente — o papel decide quais documentos a pessoa enxerga.
      </p>

      <ul v-if="parties.length" class="party-list">
        <li v-for="p in parties" :key="p.id" class="party">
          <div>
            <strong>{{ p.name }}</strong>
            <span class="pill">{{ CONTRACT_ROLE_LABELS[p.role] }}</span>
            <span v-if="!p.active" class="pill muted">Acesso desativado</span>
            <div class="party-meta">{{ p.email }}</div>
          </div>
          <button
            class="admin-btn danger sm"
            type="button"
            @click="removeParty(p)"
          >
            Tirar
          </button>
        </li>
      </ul>
      <p v-else style="color: var(--ink-soft)">Ninguém vinculado ainda.</p>

      <div class="add-party">
        <select v-model="novaParte.portalUserId" class="admin-select">
          <option value="">— Escolha o cliente —</option>
          <option v-for="u in portalUsers" :key="u.id" :value="u.id">
            {{ u.name }} · {{ u.email }}
          </option>
        </select>
        <select v-model="novaParte.role" class="admin-select">
          <option v-for="r in CONTRACT_PARTY_ROLES" :key="r" :value="r">
            {{ CONTRACT_ROLE_LABELS[r] }}
          </option>
        </select>
        <button
          class="admin-btn"
          type="button"
          :disabled="addingParty"
          @click="addParty"
        >
          {{ addingParty ? "Vinculando..." : "Vincular" }}
        </button>
      </div>
      <p v-if="partyError" class="err">{{ partyError }}</p>
      <p
        v-if="!portalUsers?.length"
        style="color: var(--ink-soft); font-size: 13px"
      >
        Nenhum cliente cadastrado ainda nesta imobiliária.
      </p>
    </div>
  </div>
</template>

<style scoped>
.back {
  display: inline-block;
  color: var(--ink-soft);
  text-decoration: none;
  font-size: 13px;
  margin-bottom: 10px;
}
.section-t {
  font-family: "Space Grotesk", sans-serif;
  font-size: 15px;
  margin: 22px 0 14px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.section-t:first-child {
  margin-top: 0;
}
.section-t small {
  font-family: inherit;
  font-weight: 500;
  font-size: 12px;
  color: var(--ink-soft);
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
  .form-grid .full {
    grid-column: 1 / -1;
  }
}
.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 18px;
}
.avisos {
  margin: 16px 0 0;
  padding: 12px 14px 12px 30px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  color: #92400e;
  font-size: 13px;
}
.err {
  color: #b91c1c;
  font-size: 13px;
  margin: 10px 0 0;
}
.party-list {
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}
.party {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 2px;
  border-bottom: 1px solid var(--line);
}
.party:last-child {
  border-bottom: none;
}
.party strong {
  font-size: 15px;
  margin-right: 8px;
}
.party-meta {
  color: var(--ink-soft);
  font-size: 13px;
  margin-top: 2px;
}
.add-party {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
@media (min-width: 620px) {
  .add-party {
    grid-template-columns: 2fr 1fr auto;
    align-items: center;
  }
}
.admin-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
}
</style>

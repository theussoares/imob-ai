<script setup lang="ts">
import type {
  ContractDetail,
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
  notes: "",

  /*
   * Sem campo na tela, mas ainda no formulário — e isso é de propósito.
   *
   * Índice de reajuste, taxa de administração e id no ERP saíram da interface
   * porque nada os consome: os três já estão escritos no contrato em PDF que a
   * imobiliária sobe, e digitá-los de novo é trabalho que ninguém lê. As
   * COLUNAS continuam no banco, para o dia em que existir cobrança — aí o
   * sistema vai precisar do número estruturado, porque PDF não se consulta.
   *
   * Continuam viajando no payload porque `toContractRow` e
   * `toContractInternalRow` gravam o objeto inteiro: parar de enviá-los
   * APAGARIA o que já está gravado a cada salvamento. Aqui eles são carregados
   * do banco e devolvidos intactos.
   */
  adjustmentIndex: "",
  adminFeePercent: null as number | null,
  externalId: "",
});

/**
 * Um imóvel, uma origem.
 *
 * Antes os dois campos conviviam na tela e um aviso amarelo explicava qual
 * venceria. Aviso que explica ambiguidade é ambiguidade não resolvida: quem
 * preenche os dois já errou, e descobrir depois de salvar não ajuda. Agora a
 * escolha vem primeiro e só um campo existe por vez.
 */
const origemImovel = ref<"catalogo" | "manual">("catalogo");

watch(origemImovel, (origem) => {
  // Limpar o campo abandonado é o que garante que só um chegue ao servidor —
  // sem isso, trocar de opção deixaria o valor antigo escondido no payload.
  if (origem === "catalogo") form.addressLabel = "";
  else form.propertyId = "";
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
  origemImovel.value = d.contract.propertyId ? "catalogo" : "manual";
});

// --- Participantes ---------------------------------------------------------

/**
 * No contrato NOVO os vínculos ficam segurados aqui até o salvamento.
 *
 * `contract_parties` precisa do id do contrato, que ainda não existe — mas isso
 * é limitação do banco, não do formulário. Empurrar a pessoa para uma segunda
 * tela só porque a FK exige uma chave é vazar detalhe de implementação para
 * quem está cadastrando. Aqui a lista vive no cliente e é gravada em sequência
 * logo depois do POST do contrato.
 */
const partesPendentes = ref<
  { portalUserId: string; role: ContractPartyRole }[]
>([]);

const novaParte = reactive({
  portalUserId: "",
  role: "inquilino" as ContractPartyRole,
});
const addingParty = ref(false);
const partyError = ref("");

function pessoa(portalUserId: string): PortalUser | undefined {
  return (portalUsers.value || []).find((u) => u.id === portalUserId);
}

/** A lista da tela, venha ela do servidor (edição) ou da memória (novo). */
const partesExibidas = computed(() => {
  if (isNew.value) {
    return partesPendentes.value.map((p, i) => {
      const u = pessoa(p.portalUserId);
      return {
        chave: `pendente-${i}`,
        portalUserId: p.portalUserId,
        role: p.role,
        name: u?.name || "Cliente",
        email: u?.email || "",
        active: u?.active ?? true,
      };
    });
  }
  return (detail.value?.parties || []).map((p) => ({
    chave: p.id,
    portalUserId: p.portalUserId,
    role: p.role,
    name: p.name,
    email: p.email,
    active: p.active,
  }));
});

const semInquilino = computed(
  () => !partesExibidas.value.some((p) => p.role === "inquilino"),
);

async function addParty() {
  if (!novaParte.portalUserId) {
    partyError.value = "Escolha o cliente.";
    return;
  }
  partyError.value = "";

  if (isNew.value) {
    const repetido = partesPendentes.value.some(
      (p) =>
        p.portalUserId === novaParte.portalUserId && p.role === novaParte.role,
    );
    if (repetido) {
      partyError.value = "Esta pessoa já está na lista com esse papel.";
      return;
    }
    partesPendentes.value.push({ ...novaParte });
    novaParte.portalUserId = "";
    return;
  }

  addingParty.value = true;
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

async function removeParty(parte: (typeof partesExibidas.value)[number]) {
  if (isNew.value) {
    // Ainda não existe vínculo nenhum no banco: é só tirar da lista, sem
    // confirmação — nada foi concedido para poder ser revogado.
    partesPendentes.value = partesPendentes.value.filter(
      (p) => !(p.portalUserId === parte.portalUserId && p.role === parte.role),
    );
    return;
  }

  const ok = await askConfirm({
    title: `Tirar ${parte.name} do contrato?`,
    description:
      "A pessoa perde o acesso a este contrato e aos documentos dele. O cadastro dela e o histórico de downloads continuam.",
    confirmLabel: "Tirar do contrato",
    danger: true,
  });
  if (!ok) return;
  try {
    await adminFetch(
      `/api/admin/contracts/${id.value}/parties/${parte.chave}`,
      { method: "DELETE" },
    );
    await refreshDetail();
    toast.success("Pessoa desvinculada do contrato.");
  } catch {
    toast.error("Não foi possível desvincular a pessoa.");
  }
}

// --- Salvar ----------------------------------------------------------------

const saving = ref(false);
const error = ref("");

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

      /*
       * Os vínculos vão um a um, depois do contrato.
       *
       * Falha aqui NÃO desfaz o contrato: ele é o registro que importa, e
       * recriar tudo porque um vínculo não entrou custaria à pessoa o
       * formulário inteiro. O que não entrou é dito em voz alta e fica para
       * refazer na tela seguinte, onde o botão já está.
       */
      const falhas: string[] = [];
      for (const parte of partesPendentes.value) {
        try {
          await adminFetch(`/api/admin/contracts/${criado.id}/parties`, {
            method: "POST",
            body: parte,
          });
        } catch {
          falhas.push(pessoa(parte.portalUserId)?.name || "Cliente");
        }
      }

      if (falhas.length) {
        toast.error(
          `Contrato criado, mas não foi possível vincular: ${falhas.join(", ")}.`,
        );
      } else {
        toast.success("Contrato criado.");
      }
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

    <form @submit.prevent="save">
      <div class="admin-card" style="margin-top: 16px">
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

          <div class="full">
            <span class="admin-label">Imóvel *</span>
            <div class="escolha">
              <label class="radio">
                <input
                  v-model="origemImovel"
                  type="radio"
                  value="catalogo"
                  name="origem-imovel"
                />
                Está no catálogo
              </label>
              <label class="radio">
                <input
                  v-model="origemImovel"
                  type="radio"
                  value="manual"
                  name="origem-imovel"
                />
                Digitar o endereço
              </label>
            </div>

            <select
              v-if="origemImovel === 'catalogo'"
              v-model="form.propertyId"
              class="admin-select"
            >
              <option value="">— Escolha o imóvel —</option>
              <option v-for="p in properties" :key="p.id" :value="p.id">
                {{ p.code }} · {{ p.title }}
              </option>
            </select>
            <input
              v-else
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
        </div>

        <!-- Campos internos: ficam em contract_internal e NUNCA chegam ao
             cliente. A separação visual existe para que isso fique claro para
             quem preenche. -->
        <h3 class="section-t">
          Interno da imobiliária
          <small>Não aparece para o cliente</small>
        </h3>
        <div class="form-grid">
          <div class="full">
            <label class="admin-label">Anotação</label>
            <textarea v-model="form.notes" class="admin-input" rows="3" />
          </div>
        </div>
      </div>

      <!--
        Participantes na MESMA tela do contrato novo.
        Antes só apareciam depois de salvar, e o aviso de "nenhum participante"
        chegava como punição por um estado que a tela não tinha deixado evitar.
      -->
      <div class="admin-card" style="margin-top: 18px">
        <h3 class="section-t">
          Participantes
          <small v-if="partesExibidas.length && semInquilino">
            sem inquilino, boletos e recibos não têm para quem aparecer
          </small>
          <small v-else-if="!partesExibidas.length">
            sem ninguém aqui, o contrato não aparece na Área do Cliente
          </small>
        </h3>

        <ul v-if="partesExibidas.length" class="party-list">
          <li v-for="p in partesExibidas" :key="p.chave" class="party">
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
            class="admin-btn ghost"
            type="button"
            :disabled="addingParty"
            @click="addParty"
          >
            {{ addingParty ? "Vinculando..." : "Adicionar" }}
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

      <div class="form-actions">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{
            saving
              ? "Salvando..."
              : isNew
                ? "Salvar e concluir"
                : "Salvar alterações"
          }}
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

    <!--
      Documentos existem na tela desde o começo, mesmo sem poder funcionar
      ainda: some o "apareceu do nada" depois de salvar. O arquivo vai para
      `portal-docs` num caminho que carrega o id do contrato, e é esse id que a
      policy de storage confere — sem contrato salvo não há caminho válido, e
      isso é dito em vez de escondido.
    -->
    <div v-if="isNew" class="admin-card bloqueado" style="margin-top: 18px">
      <h3 class="section-t">Documentos</h3>
      <p>
        Contrato assinado, vistoria e comprovantes entram aqui depois de salvar.
      </p>
    </div>
    <AdminPortalDocuments
      v-else
      :key="id"
      :contract-id="id"
      style="margin-top: 18px"
    />
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
  flex-wrap: wrap;
}
.section-t:first-child {
  margin-top: 0;
}
/* A explicação vira legenda do próprio título, em vez de parágrafo abaixo dele:
   diz a mesma coisa sem empurrar o formulário para baixo. */
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
.escolha {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 2px 0 8px;
}
.radio {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.form-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 18px;
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
}
@media (min-width: 620px) {
  .add-party {
    grid-template-columns: 2fr 1fr auto;
    align-items: center;
  }
}
.bloqueado {
  opacity: 0.6;
}
.bloqueado p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 13px;
}
.admin-btn.sm {
  padding: 8px 12px;
  font-size: 13px;
}
</style>

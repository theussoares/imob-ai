<script setup lang="ts">
/**
 * Detalhe de um contrato.
 *
 * Só mostra o que o cliente tem motivo para consultar: endereço, papel dele,
 * valor, vencimento e vigência. Não há nada da imobiliária aqui porque não há
 * nada da imobiliária no tipo — `ContractForClient` não carrega `notes`,
 * `admin_fee_percent` nem `external_id`, e a API nunca os envia.
 *
 * As outras partes do contrato também não aparecem: o inquilino não precisa do
 * nome e do telefone do proprietário para baixar um comprovante. Se um dia for
 * pedido, é decisão de produto — não pode acontecer por descuido de um `select`.
 */
import type { ContractForClient } from "~~/shared/models/portal";
import { CONTRACT_ROLE_LABELS } from "~~/shared/models/portal";
import {
  contractPeriodLabel,
  dueDayLabel,
  formatBRL,
} from "~~/shared/utils/portal-format";

definePageMeta({ middleware: "portal", layout: "portal" });

const route = useRoute();

const contrato = ref<ContractForClient | null>(null);
const carregando = ref(true);
const erro = ref("");

onMounted(async () => {
  try {
    contrato.value = await portalFetch<ContractForClient>(
      `/api/portal/contracts/${route.params.id}`,
    );
  } catch (e) {
    // 404 aqui significa "não é seu ou não existe" — de propósito o servidor não
    // distingue os dois, e a tela repete essa indistinção em vez de adivinhar.
    erro.value =
      (e as { statusCode?: number })?.statusCode === 404
        ? "Contrato não encontrado."
        : "Não conseguimos carregar este contrato agora.";
  } finally {
    carregando.value = false;
  }
});

const papeis = computed(() =>
  (contrato.value?.roles ?? []).map((r) => CONTRACT_ROLE_LABELS[r]).join(" e "),
);

useSeoMeta({ title: "Contrato", robots: "noindex, nofollow" });
</script>

<template>
  <div>
    <NuxtLink to="/area-cliente" class="pc-voltar">← Meus contratos</NuxtLink>

    <p v-if="carregando" class="pc-sub">Carregando…</p>
    <p v-else-if="erro" class="pc-msg erro">{{ erro }}</p>

    <template v-else-if="contrato">
      <h1>{{ contrato.addressLabel || contrato.code }}</h1>
      <p class="pc-sub">
        {{ papeis }}
        <span v-if="contrato.status === 'encerrado'" class="pc-tag"
          >Encerrado</span
        >
      </p>

      <dl class="pc-dados">
        <div>
          <dt>Contrato</dt>
          <dd>{{ contrato.code }}</dd>
        </div>
        <div>
          <dt>Aluguel</dt>
          <dd>{{ formatBRL(contrato.rentAmount) }}</dd>
        </div>
        <div>
          <dt>Vencimento</dt>
          <dd>{{ dueDayLabel(contrato.dueDay) }}</dd>
        </div>
        <div>
          <dt>Vigência</dt>
          <dd>
            {{ contractPeriodLabel(contrato.startedOn, contrato.endsOn) }}
          </dd>
        </div>
      </dl>

      <!-- Documentos são o card 2.3. O aviso fica porque a tela sem ele parece
           quebrada para quem entrou justamente atrás do boleto. -->
      <p class="pc-sub">Seus documentos aparecem aqui em breve.</p>
    </template>
  </div>
</template>

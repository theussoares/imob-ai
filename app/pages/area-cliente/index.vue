<script setup lang="ts">
/**
 * Home da Área do Cliente: a lista de contratos.
 *
 * É a primeira tela que a pessoa vê depois de entrar, e o trabalho dela é
 * responder "o que eu tenho aqui?" sem exigir leitura. Por isso o papel aparece
 * em cada contrato: quem aluga um imóvel e é dono de outro precisa distinguir os
 * dois de relance — e esse é o caso que motivou `roles` ser uma lista.
 */
import type { ContractForClient } from "~~/shared/models/portal";
import { CONTRACT_ROLE_LABELS } from "~~/shared/models/portal";
import { contractPeriodLabel, formatBRL } from "~~/shared/utils/portal-format";

definePageMeta({ middleware: "portal", layout: "portal" });

const { me, signOut } = usePortalAuth();

const contratos = ref<ContractForClient[]>([]);
const carregando = ref(true);
const erro = ref("");

onMounted(async () => {
  try {
    contratos.value = await portalFetch<ContractForClient[]>(
      "/api/portal/contracts",
    );
  } catch {
    // A mensagem é deliberadamente genérica: o motivo real (sessão, entitlement
    // do tenant, falha de rede) está no log do servidor, e nenhum deles é
    // assunto do inquilino.
    erro.value = "Não conseguimos carregar seus contratos agora.";
  } finally {
    carregando.value = false;
  }
});

function papeis(c: ContractForClient) {
  return c.roles.map((r) => CONTRACT_ROLE_LABELS[r]).join(" e ");
}

async function sair() {
  await signOut();
  await navigateTo("/area-cliente/login");
}

useSeoMeta({ title: "Área do cliente", robots: "noindex, nofollow" });
</script>

<template>
  <div>
    <h1>Olá, {{ me?.name }}</h1>
    <p class="pc-sub">{{ me?.tenantName }}</p>

    <p v-if="carregando" class="pc-sub">Carregando seus contratos…</p>
    <p v-else-if="erro" class="pc-msg erro">{{ erro }}</p>

    <!-- Estado vazio com instrução, não só constatação: a pessoa entrou porque
         a imobiliária mandou, então "fale com a imobiliária" é o próximo passo
         real, e o card 2.4 ainda vai desenhar isto com mais cuidado. -->
    <p v-else-if="!contratos.length" class="pc-sub">
      Você ainda não tem contratos por aqui. Se acha que isso está errado, fale
      com a imobiliária.
    </p>

    <ul v-else class="pc-lista">
      <li v-for="c in contratos" :key="c.id">
        <NuxtLink :to="`/area-cliente/contratos/${c.id}`" class="pc-item">
          <span class="pc-item-topo">
            <strong>{{ c.addressLabel || c.code }}</strong>
            <span v-if="c.status === 'encerrado'" class="pc-tag"
              >Encerrado</span
            >
          </span>
          <span class="pc-item-meta">{{ papeis(c) }}</span>
          <span class="pc-item-meta">
            {{ formatBRL(c.rentAmount) }} ·
            {{ contractPeriodLabel(c.startedOn, c.endsOn) }}
          </span>
        </NuxtLink>
      </li>
    </ul>

    <button type="button" class="pc-link" @click="sair">Sair</button>
  </div>
</template>

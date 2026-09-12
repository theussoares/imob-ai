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
import type {
  ContractForClient,
  PortalDocument,
} from "~~/shared/models/portal";
import {
  CONTRACT_ROLE_LABELS,
  PORTAL_DOC_CATEGORIES,
  PORTAL_DOC_LABELS,
} from "~~/shared/models/portal";
import {
  contractPeriodLabel,
  dueDayLabel,
  formatBRL,
  formatDateBR,
} from "~~/shared/utils/portal-format";

definePageMeta({ middleware: "portal", layout: "portal" });

const route = useRoute();

const contrato = ref<ContractForClient | null>(null);
const documentos = ref<PortalDocument[]>([]);
const carregando = ref(true);
const erro = ref("");
const baixando = ref<string | null>(null);
const erroDownload = ref("");

onMounted(async () => {
  try {
    // Em paralelo: o contrato e os documentos são consultas independentes, e o
    // portal é usado no celular — uma ida a menos é perceptível.
    const [c, docs] = await Promise.all([
      portalFetch<ContractForClient>(
        `/api/portal/contracts/${route.params.id}`,
      ),
      portalFetch<PortalDocument[]>(
        `/api/portal/contracts/${route.params.id}/documents`,
      ),
    ]);
    contrato.value = c;
    documentos.value = docs;
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

/**
 * Documentos agrupados por categoria, na ordem do domínio.
 *
 * A ordem vem de `PORTAL_DOC_CATEGORIES`, não de `Object.keys`: contrato e
 * vistoria primeiro, depois o que se repete todo mês. Categoria sem documento
 * some — seção vazia faz a pessoa achar que algo não carregou.
 */
const porCategoria = computed(() =>
  PORTAL_DOC_CATEGORIES.map((categoria) => ({
    categoria,
    label: PORTAL_DOC_LABELS[categoria],
    // A API já devolve ordenado por competência decrescente; o filtro preserva
    // essa ordem, então o recibo do mês mais recente fica no topo de cada grupo.
    itens: documentos.value.filter((d) => d.category === categoria),
  })).filter((g) => g.itens.length > 0),
);

/** "setembro/2026 · vence 10/09/2026 · R$ 2.400" — só o que existir. */
function detalhe(doc: PortalDocument): string {
  const partes: string[] = [];
  if (doc.competence) {
    partes.push(
      new Date(`${doc.competence}T12:00:00`).toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      }),
    );
  }
  if (doc.dueOn) partes.push(`vence ${formatDateBR(doc.dueOn)}`);
  if (doc.amount !== null) partes.push(formatBRL(doc.amount));
  return partes.join(" · ");
}

async function baixar(doc: PortalDocument) {
  erroDownload.value = "";
  baixando.value = doc.id;
  try {
    await baixarDocumento(doc.id, `${doc.title}.pdf`);
  } catch {
    // Genérica de propósito: 404 aqui pode ser "não é seu" e dizer isso
    // confirmaria que o documento existe.
    erroDownload.value = "Não conseguimos abrir este documento agora.";
  } finally {
    baixando.value = null;
  }
}

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

      <h2 class="pc-h2">Documentos</h2>

      <p v-if="erroDownload" class="pc-msg erro">{{ erroDownload }}</p>

      <PortalEmptyState
        v-if="!porCategoria.length"
        titulo="Nenhum documento publicado ainda"
        descricao="Assim que a imobiliária publicar contrato, vistoria ou comprovante, eles aparecem aqui — e você pode baixar quando quiser."
        :assunto="`os documentos do contrato ${contrato.code}`"
      />

      <section
        v-for="grupo in porCategoria"
        :key="grupo.categoria"
        class="pc-grupo"
      >
        <h3 class="pc-grupo-titulo">{{ grupo.label }}</h3>
        <ul class="pc-lista">
          <li v-for="doc in grupo.itens" :key="doc.id">
            <button
              type="button"
              class="pc-item pc-item-botao"
              :disabled="baixando === doc.id"
              @click="baixar(doc)"
            >
              <span class="pc-item-topo">
                <strong>{{ doc.title }}</strong>
                <span class="pc-baixar">{{
                  baixando === doc.id ? "Baixando…" : "Baixar"
                }}</span>
              </span>
              <span v-if="detalhe(doc)" class="pc-item-meta">{{
                detalhe(doc)
              }}</span>
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

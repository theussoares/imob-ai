<script setup lang="ts">
import type {
  Property,
  PropertyInput,
  PropertyImageInput,
} from "~~/shared/models/property";
import type { Broker } from "~~/shared/models/broker";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_STATUSES,
  PROPERTY_STATUS_LABELS,
} from "~~/shared/models/property";
import {
  areaRangeError,
  priceRangeError,
  roomsRangeError,
} from "~~/shared/utils/property-limits";
import { draftKey, parseDraft, serializeDraft } from "~~/shared/utils/form-draft";
import { AI_TONE_LABELS, type AiTone } from "~~/shared/models/ai-tone";
import { COTA_MENSAL_DESCRICAO, type SaldoMensalIA } from "~~/shared/models/ai-generation";

definePageMeta({ layout: "admin", middleware: "admin" });

const route = useRoute();
const tenant = useTenant();
const id = computed(() => String(route.params.id));
const isNew = computed(() => id.value === "novo");

const form = reactive<
  Required<Omit<PropertyInput, "images">> & { images: PropertyImageInput[] }
>({
  code: "",
  title: "",
  type: "casa",
  purpose: "venda",
  price: 0,
  neighborhood: "",
  city: tenant.value?.city || "",
  state: tenant.value?.state || "",
  bedrooms: 0,
  suites: 0,
  bathrooms: 0,
  parking: 0,
  area: 0,
  highStandard: false,
  description: "",
  features: [],
  status: "active",
  featured: false,
  images: [],
  location: "",
  brokerId: "",
  ownerName: "",
  ownerPhone: "",
});
const featuresText = ref("");

// Preço: campo exibe "R$ 350.000", model guarda o inteiro 350000.
const { display: priceDisplay, onInput: onPriceInput } = useMoneyInput(
  toRef(form, "price"),
);
// Proprietário: exibe +55 (67) 99123-4567, model guarda dígitos com DDI.
const {
  display: ownerPhoneDisplay,
  onInput: onOwnerPhoneInput,
  isValid: ownerPhoneValid,
} = usePhoneInput(toRef(form, "ownerPhone"), "whatsapp");

const { data: brokers } = await useAsyncData(
  "admin:brokers:list",
  () => adminFetch<Broker[]>("/api/admin/brokers"),
  {
    server: false,
    default: () => [] as Broker[],
  },
);

/**
 * Bairros que a imobiliária já usa, para a lista de sugestões do campo.
 *
 * O servidor alinha a grafia no salvar (ver `canonicalNeighborhood`), mas só
 * alcança o que se LÊ igual: "Jardim dos Ipês 2" e "Jardim dos Ipes3" são
 * bairros distintos para qualquer normalizador. Mostrar o que já existe ANTES
 * de digitar é o que evita o terceiro "Jardim dos Ipês" nascer torto.
 */
const { data: bairros } = await useAsyncData(
  "admin:neighborhoods",
  () => adminFetch<string[]>("/api/admin/neighborhoods"),
  {
    server: false,
    default: () => [] as string[],
  },
);

const { load: loadMembers, nameFor } = useMemberNames();
onMounted(loadMembers);

const { descricaoIa, carregar } = useAdminFeatures();
onMounted(carregar);

/**
 * Tom e saldo, carregados junto com o bloco de IA.
 *
 * O tom era invisível aqui: definido uma vez em Configurações, e quem gerava
 * não sabia em qual tom o texto viria até ler. O saldo só aparecia DEPOIS da
 * primeira geração — com duas restando, a pessoa descobria no 429.
 *
 * Falha em qualquer um dos dois não bloqueia a geração: são informação, não
 * pré-requisito. O servidor continua sendo quem aplica a cota.
 */
const tomIa = ref<AiTone | null>(null);
watch(
  descricaoIa,
  async (ativo) => {
    if (!ativo || !import.meta.client) return;
    const [tom, saldo] = await Promise.allSettled([
      adminFetch<{ aiTone: AiTone }>("/api/admin/ai-tone"),
      adminFetch<SaldoMensalIA>("/api/admin/ai-quota"),
    ]);
    if (tom.status === "fulfilled") tomIa.value = tom.value.aiTone;
    if (saldo.status === "fulfilled") saldoIa.value = saldo.value.restantes;
  },
  { immediate: true },
);

const { data: existing } = await useAsyncData(
  `admin:property:${id.value}`,
  async () =>
    isNew.value
      ? null
      : await adminFetch<Property>(`/api/admin/properties/${id.value}`),
  { server: false },
);

watchEffect(() => {
  const p = existing.value;
  if (!p) return;
  Object.assign(form, {
    code: p.code,
    title: p.title,
    type: p.type,
    purpose: p.purpose,
    price: p.price,
    neighborhood: p.neighborhood || "",
    city: p.city || "",
    state: p.state || "",
    bedrooms: p.bedrooms,
    suites: p.suites,
    bathrooms: p.bathrooms,
    parking: p.parking,
    area: p.area,
    highStandard: p.highStandard,
    description: p.description || "",
    features: p.features,
    status: p.status,
    featured: p.featured,
    // urlSm precisa vir junto: replaceImages regrava as linhas do zero, e sem
    // isto a derivada de 640px seria perdida a cada edição do imóvel.
    images: p.images.map((i) => ({
      url: i.url,
      urlSm: i.urlSm,
      alt: i.alt,
      isCover: i.isCover,
      position: i.position,
    })),
    location: p.location || "",
    brokerId: p.brokerId || "",
    ownerName: p.ownerName || "",
    ownerPhone: p.ownerPhone || "",
  });
  featuresText.value = p.features.join("\n");
});

const saving = ref(false);
const error = ref("");
const errorEl = ref<HTMLElement | null>(null);
const toast = useToast();

/**
 * O que conta como "mudou": o formulário inteiro mais o texto dos
 * diferenciais, comparados com o que a tela carregou.
 *
 * O retrato é tirado DEPOIS do `watchEffect` acima preencher a ficha — antes
 * disso, todo imóvel existente pareceria "alterado" só por ter carregado.
 */
function retrato() {
  return JSON.stringify({ ...form, featuresText: featuresText.value });
}
const original = ref(retrato());
watch(existing, async () => {
  await nextTick();
  original.value = retrato();
});
// Sugestão da IA ainda não usada também conta: gerou, consumiu cota, e sair
// sem aceitar nem descartar jogaria o texto fora sem aviso.
const dirty = () => retrato() !== original.value || sugestaoIa.value !== null;
const { release } = useUnsavedGuard(dirty);

/**
 * Rascunho do cadastro NOVO, guardado no aparelho a cada alteração (com
 * pausa, para não gravar a cada tecla). Ver shared/utils/form-draft.ts para
 * por que só no cadastro novo.
 */
const chaveRascunho = computed(() => draftKey(tenant.value?.id, "imovel-novo"));
const rascunhoDisponivel = ref<{ savedAt: number } | null>(null);
onMounted(() => {
  if (!isNew.value) return;
  try {
    const d = parseDraft(localStorage.getItem(chaveRascunho.value));
    if (d) rascunhoDisponivel.value = { savedAt: d.savedAt };
  } catch {
    // localStorage indisponível (aba anônima, bloqueio): segue sem rascunho.
  }
});
watchDebounced(
  () => retrato(),
  (atual) => {
    if (!isNew.value || atual === original.value) return;
    try {
      localStorage.setItem(chaveRascunho.value, serializeDraft(JSON.parse(atual)));
    } catch {
      // Cota cheia ou bloqueio: perder o rascunho não pode travar o cadastro.
    }
  },
  { debounce: 800 },
);
function restaurarRascunho() {
  try {
    const d = parseDraft<Record<string, unknown>>(localStorage.getItem(chaveRascunho.value));
    if (d) {
      const { featuresText: ft, ...resto } = d.data as { featuresText?: string };
      Object.assign(form, resto);
      featuresText.value = ft || "";
    }
  } catch {
    // Mesmo motivo acima.
  }
  rascunhoDisponivel.value = null;
}
function descartarRascunho() {
  try {
    localStorage.removeItem(chaveRascunho.value);
  } catch {
    // idem
  }
  rascunhoDisponivel.value = null;
}

/**
 * Mostra o erro e LEVA a pessoa até ele. O erro fica no fim de um formulário
 * de ~2800px: sem rolar até lá, quem apertou salvar no topo (barra fixa) não
 * via nada acontecer e apertava de novo.
 */
async function mostrarErro(msg: string) {
  error.value = msg;
  await nextTick();
  errorEl.value?.scrollIntoView({ behavior: "smooth", block: "center" });
  errorEl.value?.focus();
}

/**
 * Avisos de plausibilidade, enquanto a pessoa digita.
 *
 * O servidor recusa o absurdo (ver property-limits.ts), mas descobrir o erro
 * só ao clicar em salvar é tarde: a pessoa já preencheu a ficha inteira. Aqui
 * o aviso aparece no momento em que o número fica estranho.
 *
 * São dois níveis. Estes avisos NÃO bloqueiam — eles apontam o que costuma ser
 * engano de digitação, e quem cadastra é quem sabe se é engano mesmo. O que
 * bloqueia é o teto do servidor, que é ordens de grandeza acima daqui.
 */
const avisos = computed(() => {
  const out: string[] = [];
  const p = form.price;

  const limite = priceRangeError(p, form.purpose);
  if (limite) out.push(limite);
  else if (form.purpose === "venda" && p > 0 && p < 10000) {
    out.push(
      "Preço de venda abaixo de R$ 10.000 — se este for o valor do aluguel, troque a pretensão para Aluguel.",
    );
  } else if (form.purpose === "aluguel" && p >= 100000) {
    out.push(
      "Aluguel a partir de R$ 100.000/mês — se este for o valor de venda, troque a pretensão para Venda.",
    );
  }

  // Preço por m² é o que denuncia o zero a mais quando a área está preenchida:
  // nenhum metro quadrado no país passa de R$ 100 mil, nem no Leblon.
  if (p > 0 && form.area > 0 && form.purpose === "venda") {
    const porM2 = p / form.area;
    if (porM2 > 100000) {
      out.push(
        `Dá R$ ${Math.round(porM2).toLocaleString("pt-BR")} por m² — confira o preço ou a área.`,
      );
    }
  }

  const areaErro = areaRangeError(form.area || 0);
  if (areaErro) out.push(areaErro);

  // Em produção há um terreno com 400 suítes: é a metragem no campo errado.
  for (const [v, label] of [
    [form.bedrooms, "Quartos"],
    [form.suites, "Suítes"],
    [form.bathrooms, "Banheiros"],
    [form.parking, "Vagas"],
  ] as const) {
    const erro = roomsRangeError(v || 0, label);
    if (erro) out.push(erro);
  }

  // Suíte é quarto com banheiro: no cadastro brasileiro ela é subconjunto dos
  // quartos, nunca um extra. Mais suítes que quartos é sempre erro de campo.
  if (form.suites > 0 && form.suites > form.bedrooms) {
    out.push(
      `${form.suites} suíte(s) para ${form.bedrooms} quarto(s) — a suíte conta junto com os quartos, então o total de quartos precisa incluí-las.`,
    );
  }

  return out;
});

async function save() {
  if (form.price <= 0) {
    await mostrarErro("Informe o preço do imóvel.");
    document.getElementById("f-preco")?.focus();
    return;
  }
  if (!ownerPhoneValid.value) {
    await mostrarErro("WhatsApp do proprietário inválido (com DDD).");
    document.getElementById("f-dono-fone")?.focus();
    return;
  }
  saving.value = true;
  error.value = "";
  const payload: PropertyInput = {
    ...form,
    brokerId: form.brokerId || null,
    features: featuresText.value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
  try {
    if (isNew.value) {
      await adminFetch("/api/admin/properties", {
        method: "POST",
        body: payload,
      });
    } else {
      // Manda de volta a versão que esta tela carregou. Se outra pessoa salvou
      // nesse meio-tempo, o servidor recusa com 409 em vez de sobrescrever — e
      // o erro cai no `error.value` abaixo, sem sair da página, então o que foi
      // digitado continua na tela.
      await adminFetch(`/api/admin/properties/${id.value}`, {
        method: "PUT",
        body: {
          ...payload,
          expectedUpdatedAt: existing.value?.updatedAt ?? null,
        },
      });
    }
    release();
    if (isNew.value) descartarRascunho();
    // Sem isto a tela só voltava para a lista, e quem salvou não tinha certeza
    // se tinha gravado — abria de novo para conferir.
    toast.success(isNew.value ? `Imóvel ${form.code} cadastrado.` : `Imóvel ${form.code} salvo.`);
    await navigateTo("/admin/imoveis");
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    await mostrarErro(
      err?.data?.statusMessage ||
        "Não foi possível salvar. Verifique os campos.",
    );
  } finally {
    saving.value = false;
  }
}

// Estado da geração de descrição por IA: dicas digitadas, progresso da
// chamada, texto anterior e último texto gerado (os dois juntos decidem se
// "desfazer" pode aparecer — ver `podeDesfazer` abaixo) e o saldo mensal que
// o endpoint devolve junto com o texto.
const dicasIa = ref("");
const gerandoIa = ref(false);
const descricaoAnterior = ref<string | null>(null);
const ultimoGerado = ref<string | null>(null);
const saldoIa = ref<number | null>(null);

/**
 * O texto gerado fica numa PRÉVIA até a pessoa aceitar.
 *
 * Antes a geração sobrescrevia a descrição na hora, com "Desfazer" como
 * saída — o que exigiu a regra delicada de `podeDesfazer` para não apagar
 * uma edição feita depois. Com a prévia, a descrição atual não é tocada até
 * "Usar este texto": dá para comparar as duas, gerar outra sem perder nada, e
 * o "nada vai ao ar sem você" deixa de ser promessa para virar o fluxo da
 * tela. Custo: um clique a mais, no único momento em que ele vale a pena.
 *
 * `podeDesfazer` continua: depois de aceitar, desfazer ainda volta ao texto
 * de antes, pela mesma regra.
 */
const sugestaoIa = ref<string | null>(null);

/**
 * "Desfazer" só existe enquanto `form.description` ainda for, ao pé da
 * letra, o texto que a última geração devolveu — não basta ter gerado em
 * algum momento. Round 1 de revisão: sem essa condição, um corretor que gera,
 * depois edita à mão (acrescenta um parágrafo, corrige um dado) e clica
 * "Desfazer" perde a edição em silêncio, porque o botão reverte para
 * `descricaoAnterior` (o texto de ANTES da IA) sem saber que o textarea mudou
 * de novo por baixo.
 *
 * Alternativa descartada: manter o botão sempre visível depois de gerar e
 * abrir um `confirm()` antes de sobrescrever. Resolveria o mesmo caso, mas
 * cobra uma pergunta de confirmação em TODO clique em "Desfazer" — inclusive
 * nos 99% das vezes em que não há edição manual para proteger. O `computed`
 * evita a pergunta redundante ao tornar a condição impossível de violar: não
 * há `watch` para dessincronizar, é função pura do estado atual.
 *
 * Custo aceito: quem editou à mão depois de gerar e quer voltar ao texto
 * pré-IA não tem mais o botão — precisa desfazer a edição manualmente. É a
 * troca certa: o botão sumir é menos grave que ele apagar trabalho sem aviso.
 */
const podeDesfazer = computed(
  () => descricaoAnterior.value !== null && form.description === ultimoGerado.value,
);

/**
 * O endpoint só devolve o texto — quem grava é o `save()` acima, depois que o
 * corretor leu. Não é um detalhe de implementação a preservar: é a trava
 * contra publicidade enganosa (a IA pode inventar um atributo a partir da
 * foto), e só vale enquanto não existir caminho que publique sem revisão
 * humana. Gerar aqui e chamar `save()` sozinho por trás apagaria essa leitura.
 */
async function gerarDescricao() {
  gerandoIa.value = true;
  error.value = "";
  try {
    const r = await adminFetch<{ texto: string; restanteNoMes: number }>(
      `/api/admin/properties/${isNew.value ? "novo" : id.value}/descricao`,
      {
        method: "POST",
        body: {
          title: form.title,
          type: form.type,
          purpose: form.purpose,
          neighborhood: form.neighborhood,
          city: form.city,
          state: form.state,
          bedrooms: form.bedrooms,
          suites: form.suites,
          bathrooms: form.bathrooms,
          parking: form.parking,
          area: form.area,
          highStandard: form.highStandard,
          features: featuresText.value
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
          dicas: dicasIa.value,
          // Modo reescrita é derivado disto: sem parâmetro de modo, não há
          // dois lugares para a mesma informação discordar.
          descricaoAtual: form.description,
          imagemUrl:
            form.images.find((i) => i.isCover)?.url ??
            form.images[0]?.url ??
            null,
        },
      },
    );
    sugestaoIa.value = r.texto;
    saldoIa.value = r.restanteNoMes;
  } catch (e: unknown) {
    // Mesmo formato do `save()` acima: o `statusMessage` do servidor cai em
    // `error.value` e aparece no topo do formulário, sem sair da página — o
    // que foi digitado continua na tela. É por isso que o 429 da cota e o 403
    // do recurso não contratado têm mensagem legível no servidor.
    const err = e as { data?: { statusMessage?: string } };
    error.value =
      err?.data?.statusMessage || "Não foi possível gerar a descrição agora.";
  } finally {
    gerandoIa.value = false;
  }
}

/**
 * `descricaoAnterior` guardado ANTES de sobrescrever, e sempre — mesmo na
 * segunda aceitação em diante (ou depois de uma edição manual: é o texto que
 * estava no campo NESTE clique, seja lá de onde ele veio). É desfazer de UM
 * nível (como Ctrl+Z), não uma pilha até o texto anterior a qualquer IA. A
 * alternativa — travar `descricaoAnterior` no valor pré-IA — foi descartada:
 * tornaria a segunda aceitação impossível de desfazer isoladamente.
 *
 * `ultimoGerado` anda junto: é o texto aceito, o mesmo que vai para
 * `form.description`. Escritos sempre neste par, nunca um sem o outro.
 */
function usarSugestao() {
  if (sugestaoIa.value === null) return;
  descricaoAnterior.value = form.description;
  form.description = sugestaoIa.value;
  ultimoGerado.value = sugestaoIa.value;
  sugestaoIa.value = null;
}
function descartarSugestao() {
  sugestaoIa.value = null;
}

function desfazerIa() {
  // Guarda redundante: o botão só existe (`v-if="podeDesfazer"`) quando isto
  // já é verdade. Fica aqui porque a função não deveria confiar cegamente em
  // quem a chama.
  if (!podeDesfazer.value || descricaoAnterior.value === null) return;
  form.description = descricaoAnterior.value;
  descricaoAnterior.value = null;
  ultimoGerado.value = null;
}

useHead(() => ({
  title: (isNew.value ? "Novo imóvel" : "Editar imóvel") + " · Painel",
}));
</script>

<template>
  <div>
    <NuxtLink to="/admin/imoveis" class="back-link">← Voltar</NuxtLink>
    <h1>{{ isNew ? "Novo imóvel" : "Editar imóvel" }}</h1>
    <!-- Só aparece quando dá para dizer QUEM: "alterado por alguém" não ajuda
         ninguém, e imóvel antigo não tem autor registrado. -->
    <p v-if="!isNew && nameFor(existing?.updatedBy)" class="last-edit">
      Última alteração por {{ nameFor(existing?.updatedBy) }}
      <template v-if="existing?.updatedAt">
        em {{ new Date(existing.updatedAt).toLocaleString("pt-BR") }}
      </template>
    </p>

    <div v-if="rascunhoDisponivel" class="draft" role="status">
      <span>
        Há um cadastro não salvo de
        {{ new Date(rascunhoDisponivel.savedAt).toLocaleString("pt-BR") }}.
      </span>
      <button type="button" class="admin-btn sm" @click="restaurarRascunho">
        Recuperar
      </button>
      <button type="button" class="admin-btn ghost sm" @click="descartarRascunho">
        Descartar
      </button>
    </div>

    <!--
      Seções com fieldset/legend: eram 24 campos numa grade só, e no celular
      a ficha virava uma coluna de ~2800px sem nenhum marco para saber onde se
      estava. O leitor de tela também anuncia a seção ao entrar nela.

      Todo rótulo tem `for`: antes o rótulo era só texto ao lado — o leitor de
      tela lia "campo de edição" sem nome, e tocar no rótulo não focava o
      campo, o que no celular é o alvo maior e mais fácil de acertar.
    -->
    <form class="admin-card prop-form" style="margin-top: 16px" @submit.prevent="save">
      <p class="req-note"><span aria-hidden="true">*</span> Campo obrigatório</p>

      <fieldset class="sec">
        <legend>Dados principais</legend>
        <div class="form-grid">
          <div>
            <label class="admin-label" for="f-codigo">Código *</label>
            <input
              id="f-codigo"
              v-model="form.code"
              class="admin-input"
              placeholder="Ex.: NC-0231"
              required
            />
          </div>
          <div class="f-wide">
            <label class="admin-label" for="f-titulo">Título *</label>
            <input
              id="f-titulo"
              v-model="form.title"
              class="admin-input"
              placeholder="Ex.: Casa no Jardim Alvorada"
              required
            />
          </div>
          <div>
            <label class="admin-label" for="f-tipo">Tipo *</label>
            <select id="f-tipo" v-model="form.type" class="admin-select">
              <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">
                {{ PROPERTY_TYPE_LABELS[t] }}
              </option>
            </select>
          </div>
          <div>
            <label class="admin-label" for="f-pretensao">Pretensão *</label>
            <select id="f-pretensao" v-model="form.purpose" class="admin-select">
              <option value="venda">Venda</option>
              <option value="aluguel">Aluguel</option>
            </select>
          </div>
          <div>
            <label class="admin-label" for="f-preco">Preço (R$) *</label>
            <input
              id="f-preco"
              :value="priceDisplay"
              class="admin-input"
              type="text"
              inputmode="numeric"
              placeholder="R$ 350.000"
              aria-required="true"
              @input="onPriceInput"
            />
          </div>
          <div>
            <label class="admin-label" for="f-status">Status</label>
            <select id="f-status" v-model="form.status" class="admin-select">
              <option v-for="s in PROPERTY_STATUSES" :key="s" :value="s">
                {{ PROPERTY_STATUS_LABELS[s] }}
              </option>
            </select>
          </div>
        </div>
        <div class="checks">
          <label
            ><input v-model="form.highStandard" type="checkbox" /> Alto
            padrão</label
          >
          <label
            ><input v-model="form.featured" type="checkbox" /> Destaque</label
          >
        </div>
      </fieldset>

      <fieldset class="sec">
        <legend>Localização</legend>
        <div class="form-grid loc-grid">
          <div>
            <label class="admin-label" for="f-bairro">Bairro</label>
            <!-- `datalist` e não `select`: bairro continua texto livre, porque o
                 primeiro imóvel de um bairro novo precisa poder criá-lo. A lista
                 só sugere o que já existe. -->
            <input
              id="f-bairro"
              v-model="form.neighborhood"
              class="admin-input"
              list="bairros-cadastrados"
              autocomplete="off"
            />
            <datalist id="bairros-cadastrados">
              <option v-for="b in bairros" :key="b" :value="b" />
            </datalist>
          </div>
          <div>
            <label class="admin-label" for="f-cidade">Cidade</label>
            <input id="f-cidade" v-model="form.city" class="admin-input" />
          </div>
          <div>
            <label class="admin-label" for="f-uf">UF</label>
            <input id="f-uf" v-model="form.state" class="admin-input" maxlength="2" />
          </div>
        </div>
      </fieldset>

      <fieldset class="sec">
        <legend>Características</legend>
        <div class="form-grid num-grid">
          <div>
            <label class="admin-label" for="f-quartos">Quartos</label>
            <input
              id="f-quartos"
              v-model.number="form.bedrooms"
              class="admin-input"
              type="number"
              inputmode="numeric"
              min="0"
            />
          </div>
          <div>
            <label class="admin-label" for="f-suites">Suítes</label>
            <input
              id="f-suites"
              v-model.number="form.suites"
              class="admin-input"
              type="number"
              inputmode="numeric"
              min="0"
            />
          </div>
          <div>
            <label class="admin-label" for="f-banheiros">Banheiros</label>
            <input
              id="f-banheiros"
              v-model.number="form.bathrooms"
              class="admin-input"
              type="number"
              inputmode="numeric"
              min="0"
            />
          </div>
          <div>
            <label class="admin-label" for="f-vagas">Vagas</label>
            <input
              id="f-vagas"
              v-model.number="form.parking"
              class="admin-input"
              type="number"
              inputmode="numeric"
              min="0"
            />
          </div>
          <div>
            <label class="admin-label" for="f-area">Área (m²)</label>
            <input
              id="f-area"
              v-model.number="form.area"
              class="admin-input"
              type="number"
              inputmode="decimal"
              min="0"
              step="0.01"
            />
          </div>
        </div>
      </fieldset>

      <fieldset class="sec">
        <legend>Descrição e diferenciais</legend>
        <label class="admin-label" for="f-descricao">Descrição</label>

        <!--
          `v-if="descricaoIa"` é conveniência de tela, não controle de acesso —
          quem recusa a geração é o endpoint. Esconder o bloco aqui só evita
          oferecer um botão que o servidor rejeitaria de qualquer forma para
          quem não contratou o recurso.
        -->
        <section v-if="descricaoIa" class="ia-bloco" aria-labelledby="ia-titulo">
          <div class="ia-top">
            <h3 id="ia-titulo" class="ia-titulo"><AppIcon name="spark" /> Descrição por IA</h3>
            <span v-if="saldoIa !== null" class="ia-saldo" :class="{ baixo: saldoIa <= 5 }">
              Restam {{ saldoIa }} de {{ COTA_MENSAL_DESCRICAO }} este mês
            </span>
          </div>
          <!-- Tom só para leitura: ele é da imobiliária, não do imóvel, e mora
               em Configurações. Mostrar aqui evita a surpresa do texto no tom
               errado; trocar por geração abriria a porta para cada corretor
               escrever num tom, que é o que o campo existe para evitar. -->
          <p v-if="tomIa" class="ia-tom">
            Tom: <b>{{ AI_TONE_LABELS[tomIa] }}</b>
            · <NuxtLink to="/admin/config">alterar</NuxtLink>
          </p>
          <label class="admin-label" for="f-dicas-ia">Dicas para a IA (opcional)</label>
          <input
            id="f-dicas-ia"
            v-model="dicasIa"
            class="admin-input"
            maxlength="500"
            placeholder="Ex.: rua tranquila, perto da escola, reformado em 2024"
          />
          <div class="ia-acoes">
            <button
              type="button"
              class="admin-btn sm"
              :disabled="gerandoIa || saldoIa === 0"
              @click="gerarDescricao"
            >
              <AppIcon name="spark" />
              {{
                gerandoIa
                  ? "Gerando…"
                  : sugestaoIa !== null
                    ? "Gerar outra"
                    : form.description
                      ? "Melhorar com IA"
                      : "Gerar com IA"
              }}
            </button>
            <!--
              `podeDesfazer`, não `descricaoAnterior !== null`: some assim que o
              corretor edita o textarea à mão depois de aceitar, porque nesse
              ponto "Desfazer" deixaria de significar "voltar de uma geração" e
              passaria a significar "apagar o que acabei de escrever". Ver o
              comentário do `computed` no script.
            -->
            <button
              v-if="podeDesfazer && sugestaoIa === null"
              type="button"
              class="admin-btn ghost sm"
              :disabled="gerandoIa"
              @click="desfazerIa"
            >
              Desfazer
            </button>
          </div>

          <!-- aria-live: a prévia nasce depois do clique, abaixo do botão; sem
               o anúncio, quem usa leitor de tela não sabe que o texto chegou. -->
          <div aria-live="polite">
            <div v-if="sugestaoIa !== null" class="ia-previa">
              <p class="ia-previa-t">Sugestão da IA — confira antes de usar</p>
              <p class="ia-previa-txt">{{ sugestaoIa }}</p>
              <div class="ia-acoes">
                <button type="button" class="admin-btn sm" @click="usarSugestao">
                  Usar este texto
                </button>
                <button type="button" class="admin-btn ghost sm" :disabled="gerandoIa" @click="descartarSugestao">
                  Descartar
                </button>
              </div>
            </div>
          </div>
        </section>

        <textarea id="f-descricao" v-model="form.description" class="admin-textarea" rows="4" />

        <label class="admin-label" for="f-diferenciais" style="margin-top: 14px"
          >Diferenciais (um por linha)</label
        >
        <textarea
          id="f-diferenciais"
          v-model="featuresText"
          class="admin-textarea"
          rows="4"
          placeholder="Piscina&#10;Churrasqueira&#10;Portão eletrônico"
        />
      </fieldset>

      <fieldset class="sec">
        <legend>Fotos</legend>
        <AdminImageUploader v-model="form.images" />
      </fieldset>

      <fieldset class="sec sec-int">
        <legend>
          <AppIcon name="lock" class="int-ico" />
          Informações internas
          <span>(só no painel, não aparecem no site)</span>
        </legend>
        <div class="form-grid">
          <div style="grid-column: 1 / -1">
            <label class="admin-label" for="f-local">Localização (endereço / referência)</label>
            <input
              id="f-local"
              v-model="form.location"
              class="admin-input"
              placeholder="Rua, nº, bairro, ponto de referência..."
            />
          </div>
          <div>
            <label class="admin-label" for="f-corretor">Corretor que captou</label>
            <select id="f-corretor" v-model="form.brokerId" class="admin-select">
              <option value="">— Nenhum —</option>
              <option v-for="b in brokers" :key="b.id" :value="b.id">
                {{ b.name }}
              </option>
            </select>
            <NuxtLink to="/admin/corretores" class="hint-link"
              >Gerenciar corretores →</NuxtLink
            >
          </div>
          <div>
            <label class="admin-label" for="f-dono-nome">Proprietário — nome</label>
            <input id="f-dono-nome" v-model="form.ownerName" class="admin-input" />
          </div>
          <div>
            <label class="admin-label" for="f-dono-fone">Proprietário — WhatsApp</label>
            <input
              id="f-dono-fone"
              :value="ownerPhoneDisplay"
              class="admin-input"
              type="tel"
              inputmode="numeric"
              placeholder="+55 (67) 99123-4567"
              :aria-invalid="!ownerPhoneValid || undefined"
              :aria-describedby="!ownerPhoneValid ? 'f-dono-fone-err' : undefined"
              @input="onOwnerPhoneInput"
            />
            <p v-if="!ownerPhoneValid" id="f-dono-fone-err" class="field-err">
              Número inválido (com DDD).
            </p>
          </div>
        </div>
      </fieldset>

      <!-- Avisos de conferência: não impedem salvar, apontam o que costuma ser
           erro de digitação. role="status" para quem usa leitor de tela ouvir
           o aviso aparecer, sem interromper o que está digitando. -->
      <ul v-if="avisos.length" class="chk" role="status">
        <li v-for="a in avisos" :key="a">{{ a }}</li>
      </ul>

      <!-- role="alert" + foco (ver `mostrarErro`): o erro nasce no fim da
           ficha, longe de quem apertou salvar na barra fixa. -->
      <p v-if="error" ref="errorEl" class="form-err" role="alert" tabindex="-1">
        {{ error }}
      </p>

      <!--
        Barra fixa no celular: o botão só existia no fim da ficha, e quem
        mudou só o preço precisava rolar ~2800px para salvar. No desktop a
        barra continua no fluxo, no fim do formulário.
      -->
      <div class="save-bar">
        <button class="admin-btn" type="submit" :disabled="saving">
          {{ saving ? "Salvando..." : "Salvar imóvel" }}
        </button>
        <NuxtLink class="admin-btn ghost" to="/admin/imoveis"
          >Cancelar</NuxtLink
        >
      </div>
    </form>
  </div>
</template>

<style scoped>
.last-edit {
  margin: 6px 0 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}

.back-link {
  display: inline-block;
  color: var(--ink-soft);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--fs-ui);
  margin-bottom: 10px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 520px) {
  .form-grid {
    grid-template-columns: 1fr 1fr;
  }
}
.sec {
  border: none;
  margin: 0;
  padding: 0 0 20px;
  min-width: 0;
}
.sec + .sec {
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.sec legend {
  font-family: var(--font-display);
  font-size: var(--fs-body);
  font-weight: 600;
  padding: 0;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.sec-int {
  border-top-style: dashed !important;
}
.int-ico {
  width: 16px;
  height: 16px;
}
.sec legend span {
  font-family: var(--font-body);
  font-weight: 500;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.hint-link {
  display: inline-block;
  margin-top: 6px;
  font-size: var(--fs-caption);
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}
.field-err {
  color: #b91c1c;
  font-size: var(--fs-caption);
  margin: 4px 0 0;
}
/*
 * A largura do campo diz o que se espera nele (Baymard, "form field width").
 * Título — o texto mais longo — tinha a mesma largura que UF, que é duas
 * letras; e os cinco números ocupavam campos largos em duas linhas.
 */
@media (min-width: 720px) {
  .f-wide {
    grid-column: span 2;
  }
}
@media (min-width: 520px) {
  .form-grid.loc-grid {
    grid-template-columns: 2fr 2fr 88px;
  }
  .form-grid.num-grid {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  }
}
.req-note {
  margin: 0 0 14px;
  font-size: var(--fs-caption);
  color: var(--ink-soft);
}
.form-err {
  color: #b91c1c;
  margin-top: 14px;
  font-weight: 600;
}
.form-err:focus {
  outline: 2px solid #b91c1c;
  outline-offset: 3px;
}
.draft {
  margin-top: 14px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid #fcd34d;
  background: #fffbeb;
  color: #78350f;
  font-size: var(--fs-ui);
}
.save-bar {
  margin-top: 18px;
  display: flex;
  gap: 10px;
}
@media (max-width: 859px) {
  .save-bar {
    position: sticky;
    bottom: calc(var(--admin-bottom-nav, 0px) + env(safe-area-inset-bottom));
    z-index: 5;
    margin: 18px -16px -16px;
    padding: 12px 16px;
    background: var(--paper);
    border-top: 1px solid var(--line);
  }
  .save-bar .admin-btn {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
}
.checks {
  display: flex;
  gap: 20px;
  margin-top: 14px;
  font-size: var(--fs-ui);
  font-weight: 600;
}
.checks label {
  display: flex;
  align-items: center;
  gap: 7px;
}
@media (min-width: 720px) {
  .form-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Bloco de geração por IA: claro, com borda e título próprio. Na landing a
   réplica é escura para destacar numa página de vendas; dentro do formulário
   o bloco só precisa se distinguir dos campos ao redor. */
.ia-bloco {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 12px;
  padding: 14px 16px;
  border: 1px solid var(--line-2);
  border-left: 4px solid var(--brand);
  border-radius: var(--r-md);
  background: var(--brand-ghost);
}
.ia-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.ia-titulo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-ui);
}
.ia-titulo :deep(svg),
.ia-acoes :deep(svg) {
  width: 16px;
  height: 16px;
}
.ia-saldo {
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--ink-soft);
  background: var(--paper);
  border-radius: var(--r-pill);
  padding: 3px 10px;
  font-variant-numeric: tabular-nums;
}
.ia-saldo.baixo {
  color: #92400e;
  background: #fef3c7;
}
.ia-tom {
  margin: 0;
  font-size: var(--fs-label);
  color: var(--ink-soft);
}
.ia-tom a {
  color: var(--brand);
  font-weight: 600;
}
.ia-acoes {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ia-acoes .admin-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
}
.ia-previa {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--paper);
  border: 1px solid var(--line-2);
}
.ia-previa-t {
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--ink-soft);
}
.ia-previa-txt {
  margin: 0;
  white-space: pre-line;
  line-height: 1.6;
}

/* Bloco de avisos de conferência do cadastro. Âmbar, não vermelho: vermelho
   diz "não dá pra salvar", e dá — é só uma conferência antes de publicar. */
.chk {
  margin: 14px 0 0;
  padding: 12px 14px 12px 30px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: var(--r-md);
  color: #78350f;
  font-size: var(--fs-label);
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>

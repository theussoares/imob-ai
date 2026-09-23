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
    error.value = "Informe o preço do imóvel.";
    return;
  }
  if (!ownerPhoneValid.value) {
    error.value = "WhatsApp do proprietário inválido (com DDD).";
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
    await navigateTo("/admin/imoveis");
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string } };
    error.value =
      err?.data?.statusMessage ||
      "Não foi possível salvar. Verifique os campos.";
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
    // `descricaoAnterior` guardado ANTES de sobrescrever, e sempre — mesmo na
    // segunda geração em diante (ou na segunda depois de uma edição manual: é
    // o texto que estava no campo NESTE clique, seja lá de onde ele veio). É
    // desfazer de UM nível (como Ctrl+Z), não uma pilha até o texto anterior a
    // qualquer IA: gerar duas vezes seguidas e desfazer volta para o texto da
    // PRIMEIRA geração, não para o que estava escrito antes dela. A
    // alternativa — travar `descricaoAnterior` no valor pré-IA e nunca
    // regravar — foi descartada: ela tornaria a segunda geração impossível de
    // desfazer isoladamente, e é exatamente o caso de quem clicou "Melhorar
    // com IA" de novo porque o resultado anterior já estava bom, só querendo
    // um ajuste fino — desfazer devolveria ao texto original, descartando sem
    // aviso a tentativa boa que existia no meio.
    //
    // `ultimoGerado` anda junto: é o texto desta geração, o mesmo que vai
    // para `form.description` na linha de baixo. As duas ficam coerentes em
    // qualquer sequência de gerações porque são escritas juntas, sempre neste
    // par — nunca uma sem a outra.
    descricaoAnterior.value = form.description;
    form.description = r.texto;
    ultimoGerado.value = r.texto;
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

    <form class="admin-card" style="margin-top: 16px" @submit.prevent="save">
      <div class="form-grid">
        <div>
          <label class="admin-label">Código *</label>
          <input
            v-model="form.code"
            class="admin-input"
            placeholder="Ex.: NC-0231"
            required
          />
        </div>
        <div>
          <label class="admin-label">Título *</label>
          <input
            v-model="form.title"
            class="admin-input"
            placeholder="Ex.: Casa no Jardim Alvorada"
            required
          />
        </div>
        <div>
          <label class="admin-label">Tipo *</label>
          <select v-model="form.type" class="admin-select">
            <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">
              {{ PROPERTY_TYPE_LABELS[t] }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label">Pretensão *</label>
          <select v-model="form.purpose" class="admin-select">
            <option value="venda">Venda</option>
            <option value="aluguel">Aluguel</option>
          </select>
        </div>
        <div>
          <label class="admin-label">Preço (R$) *</label>
          <input
            :value="priceDisplay"
            class="admin-input"
            type="text"
            inputmode="numeric"
            placeholder="R$ 350.000"
            @input="onPriceInput"
          />
        </div>
        <div>
          <label class="admin-label">Status</label>
          <select v-model="form.status" class="admin-select">
            <option v-for="s in PROPERTY_STATUSES" :key="s" :value="s">
              {{ PROPERTY_STATUS_LABELS[s] }}
            </option>
          </select>
        </div>
        <div>
          <label class="admin-label">Bairro</label>
          <!-- `datalist` e não `select`: bairro continua texto livre, porque o
               primeiro imóvel de um bairro novo precisa poder criá-lo. A lista
               só sugere o que já existe. -->
          <input
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
          <label class="admin-label">Cidade</label>
          <input v-model="form.city" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">UF</label>
          <input v-model="form.state" class="admin-input" maxlength="2" />
        </div>
        <div>
          <label class="admin-label">Quartos</label>
          <input
            v-model.number="form.bedrooms"
            class="admin-input"
            type="number"
            min="0"
          />
        </div>
        <div>
          <label class="admin-label">Suítes</label>
          <input
            v-model.number="form.suites"
            class="admin-input"
            type="number"
            min="0"
          />
        </div>
        <div>
          <label class="admin-label">Banheiros</label>
          <input
            v-model.number="form.bathrooms"
            class="admin-input"
            type="number"
            min="0"
          />
        </div>
        <div>
          <label class="admin-label">Vagas</label>
          <input
            v-model.number="form.parking"
            class="admin-input"
            type="number"
            min="0"
          />
        </div>
        <div>
          <label class="admin-label">Área (m²)</label>
          <input
            v-model.number="form.area"
            class="admin-input"
            type="number"
            min="0"
            step="0.01"
          />
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

      <label class="admin-label" style="margin-top: 14px">Descrição</label>

      <!--
        `v-if="descricaoIa"` é conveniência de tela, não controle de acesso —
        quem recusa a geração é o endpoint. Esconder o bloco aqui só evita
        oferecer um botão que o servidor rejeitaria de qualquer forma para
        quem não contratou o recurso.
      -->
      <div v-if="descricaoIa" class="ia-bloco">
        <input
          v-model="dicasIa"
          class="admin-input"
          maxlength="500"
          placeholder="Dicas para a IA (opcional): o que destacar neste imóvel"
        />
        <div class="ia-acoes">
          <button
            type="button"
            class="admin-btn sm"
            :disabled="gerandoIa"
            @click="gerarDescricao"
          >
            {{
              gerandoIa
                ? "Gerando…"
                : form.description
                  ? "Melhorar com IA"
                  : "Gerar com IA"
            }}
          </button>
          <!--
            `podeDesfazer`, não `descricaoAnterior !== null`: some assim que o
            corretor edita o textarea à mão depois de gerar, porque nesse
            ponto "Desfazer" deixaria de significar "voltar de uma geração" e
            passaria a significar "apagar o que acabei de escrever". Ver o
            comentário do `computed` no script.
          -->
          <button
            v-if="podeDesfazer"
            type="button"
            class="admin-btn ghost sm"
            :disabled="gerandoIa"
            @click="desfazerIa"
          >
            Desfazer
          </button>
          <span v-if="saldoIa !== null" class="ia-saldo"
            >restam {{ saldoIa }} gerações este mês</span
          >
        </div>
      </div>

      <textarea v-model="form.description" class="admin-textarea" rows="4" />

      <label class="admin-label" style="margin-top: 14px"
        >Diferenciais (um por linha)</label
      >
      <textarea
        v-model="featuresText"
        class="admin-textarea"
        rows="4"
        placeholder="Piscina&#10;Churrasqueira&#10;Portão eletrônico"
      />

      <label class="admin-label" style="margin-top: 14px">Imagens</label>
      <AdminImageUploader v-model="form.images" />

      <h3 class="int-title">
        🔒 Informações internas
        <span>(só no painel, não aparecem no site)</span>
      </h3>
      <div class="form-grid">
        <div style="grid-column: 1 / -1">
          <label class="admin-label">Localização (endereço / referência)</label>
          <input
            v-model="form.location"
            class="admin-input"
            placeholder="Rua, nº, bairro, ponto de referência..."
          />
        </div>
        <div>
          <label class="admin-label">Corretor que captou</label>
          <select v-model="form.brokerId" class="admin-select">
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
          <label class="admin-label">Proprietário — nome</label>
          <input v-model="form.ownerName" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Proprietário — WhatsApp</label>
          <input
            :value="ownerPhoneDisplay"
            class="admin-input"
            type="tel"
            inputmode="numeric"
            placeholder="+55 (67) 99123-4567"
            @input="onOwnerPhoneInput"
          />
          <p v-if="!ownerPhoneValid" class="field-err">
            Número inválido (com DDD).
          </p>
        </div>
      </div>

      <!-- Avisos de conferência: não impedem salvar, apontam o que costuma ser
           erro de digitação. role="status" para quem usa leitor de tela ouvir
           o aviso aparecer, sem interromper o que está digitando. -->
      <ul v-if="avisos.length" class="chk" role="status">
        <li v-for="a in avisos" :key="a">{{ a }}</li>
      </ul>

      <p v-if="error" style="color: #b91c1c; margin-top: 14px">{{ error }}</p>

      <div style="margin-top: 18px; display: flex; gap: 10px">
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
  font-size: 13px;
  color: var(--ink-soft);
}

.back-link {
  display: inline-block;
  color: var(--ink-soft);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
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
.int-title {
  font-family: "Space Grotesk", sans-serif;
  font-size: 15px;
  margin: 24px 0 12px;
  padding-top: 16px;
  border-top: 1px dashed var(--line-2);
}
.int-title span {
  font-family: "Inter", sans-serif;
  font-weight: 500;
  font-size: 12.5px;
  color: var(--ink-soft);
}
.hint-link {
  display: inline-block;
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--brand);
  text-decoration: none;
  font-weight: 600;
}
.field-err {
  color: #b91c1c;
  font-size: 12.5px;
  margin: 4px 0 0;
}
.checks {
  display: flex;
  gap: 20px;
  margin-top: 14px;
  font-size: 14px;
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

/* Bloco de geração de descrição por IA, entre o label e o textarea que ele
   preenche — cinza neutro para não competir com o aviso âmbar de baixo. */
.ia-bloco {
  margin: 8px 0 10px;
  padding: 12px 14px;
  border: 1px solid var(--line-2);
  border-radius: 10px;
  background: var(--surface);
}
.ia-acoes {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.ia-saldo {
  font-size: 12.5px;
  color: var(--ink-soft);
}

/* Bloco de avisos de conferência do cadastro. Âmbar, não vermelho: vermelho
   diz "não dá pra salvar", e dá — é só uma conferência antes de publicar. */
.chk {
  margin: 14px 0 0;
  padding: 12px 14px 12px 30px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: 10px;
  color: #78350f;
  font-size: 13.5px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>

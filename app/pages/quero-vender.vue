<script setup lang="ts">
import type { PropertyCard, PropertyPurpose, PropertyType } from '~~/shared/models/property'
import { PROPERTY_TYPES, PROPERTY_TYPE_LABELS } from '~~/shared/models/property'
import { buildOwnerLeadMessage, offeringTypeFor } from '~~/shared/utils/owner-lead'
import { isValidBrPhone } from '~~/shared/utils/phone'

const tenant = useTenant()
const requestFetch = useRequestFetch()
const url = useRequestURL({ xForwardedHost: true, xForwardedProto: true })
const { whatsappLink } = useContact()

// Mesma chave da home e das categorias: navegar entre elas não refaz requisição.
// Aqui os imóveis servem só para dizer quantos a imobiliária já anuncia — que é
// prova social real, ao contrário de depoimento inventado.
const { data: properties } = await useAsyncData('properties', () => requestFetch<PropertyCard[]>('/api/properties'), {
  default: () => [] as PropertyCard[],
  getCachedData: (key, nuxtApp) => nuxtApp.payload.data[key] ?? nuxtApp.static.data[key],
})

const cidade = computed(() => tenant.value?.city || '')
const emCidade = computed(() => (cidade.value ? ` em ${cidade.value}` : ''))
const titulo = computed(() => `Quer vender ou alugar seu imóvel${emCidade.value}?`)
const canonical = `${url.origin}/quero-vender`

// ---- Formulário ----
const form = reactive({
  name: '',
  phone: '',
  purpose: 'venda' as PropertyPurpose,
  propertyType: '' as PropertyType | '',
  neighborhood: '',
  note: '',
})
const { display: phoneDisplay, onInput: onPhoneInput } = usePhoneInput(toRef(form, 'phone'), 'br')

const status = ref<'idle' | 'sending' | 'ok' | 'error'>('idle')
const error = ref('')

async function submit() {
  if (!form.name.trim()) {
    error.value = 'Preencha seu nome.'
    return
  }
  if (!isValidBrPhone(form.phone)) {
    error.value = 'Telefone inválido. Ex.: (67) 99217-1768'
    return
  }
  status.value = 'sending'
  error.value = ''
  try {
    await $fetch('/api/leads', {
      method: 'POST',
      body: {
        name: form.name,
        phone: form.phone,
        // Tipo e bairro entram na mensagem, não em colunas novas: são
        // informação para o corretor ler, não algo que alguém vá filtrar.
        message: buildOwnerLeadMessage(form),
        source: 'quero_vender',
        leadType: offeringTypeFor(form.purpose),
      },
    })
    status.value = 'ok'
  } catch (e: unknown) {
    status.value = 'error'
    const err = e as { data?: { statusMessage?: string } }
    error.value = err?.data?.statusMessage || 'Não foi possível enviar. Tente novamente.'
  }
}

useSeoMeta({
  title: () => titulo.value,
  description: () =>
    `Anuncie seu imóvel${emCidade.value} com ${tenant.value?.name || 'a nossa imobiliária'}: ` +
    `avaliação do valor, divulgação com fotos e corretor cuidando das visitas e da negociação. Fale com a gente.`,
  ogTitle: () => `${titulo.value}${tenant.value?.name ? ' · ' + tenant.value.name : ''}`,
  ogType: 'website',
})

useHead(() => ({
  link: [{ rel: 'canonical', href: canonical }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Início', item: url.origin + '/' },
              { '@type': 'ListItem', position: 2, name: 'Quero vender ou alugar', item: canonical },
            ],
          },
          {
            '@type': 'RealEstateAgent',
            name: tenant.value?.name,
            url: url.origin,
            // Só campos que o tenant realmente preencheu — dado estruturado
            // inventado é pior que dado estruturado ausente.
            ...(tenant.value?.city ? { areaServed: { '@type': 'City', name: tenant.value.city } } : {}),
            ...(tenant.value?.phone ? { telephone: tenant.value.phone } : {}),
            ...(tenant.value?.email ? { email: tenant.value.email } : {}),
            makesOffer: {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Intermediação de venda e locação de imóveis',
                ...(tenant.value?.city ? { areaServed: { '@type': 'City', name: tenant.value.city } } : {}),
              },
            },
          },
        ],
      }),
    },
  ],
}))
</script>

<template>
  <div class="qv">
    <nav class="crumbs" aria-label="Trilha de navegação">
      <NuxtLink to="/">Início</NuxtLink>
      <span aria-hidden="true">›</span>
      <span aria-current="page">Quero vender ou alugar</span>
    </nav>

    <header class="qv-head">
      <h1>{{ titulo }}</h1>
      <p class="qv-lede">
        A gente avalia quanto ele vale hoje, cuida do anúncio e conduz as visitas e a negociação até a assinatura. Você
        não precisa atender curioso nem combinar horário com desconhecido.
      </p>
      <a class="qv-cta" href="#formulario">Quero uma avaliação</a>
    </header>

    <!-- Numerado porque é sequência de verdade: uma etapa depende da anterior. -->
    <section class="qv-steps" aria-labelledby="como">
      <h2 id="como">Como funciona</h2>
      <ol>
        <li>
          <h3>Avaliação do valor</h3>
          <p>
            Visitamos o imóvel e comparamos com o que está sendo vendido e alugado
            {{ cidade ? `em ${cidade}` : 'na região' }}. Você recebe uma faixa de preço realista — anunciar acima do
            mercado é o que faz um imóvel encalhar.
          </p>
        </li>
        <li>
          <h3>Anúncio e divulgação</h3>
          <p>
            Fotos, descrição e publicação no nosso site e nos portais. Quem procura por imóvel como o seu encontra o
            anúncio.
          </p>
        </li>
        <li>
          <h3>Visitas e negociação</h3>
          <p>
            Um corretor acompanha cada visita, filtra quem tem interesse real e conduz a proposta e a documentação até o
            fim.
          </p>
        </li>
      </ol>
    </section>

    <section id="formulario" class="qv-form-wrap" aria-labelledby="fale">
      <div class="qv-form-card">
        <h2 id="fale">Fale com a gente</h2>

        <p v-if="status === 'ok'" class="qv-ok">
          Recebemos seus dados. Um corretor entra em contato pelo WhatsApp para combinar a avaliação. ✅
        </p>

        <form v-else @submit.prevent="submit">
          <fieldset class="qv-purpose">
            <legend>O que você quer fazer?</legend>
            <label :class="{ on: form.purpose === 'venda' }">
              <input v-model="form.purpose" type="radio" value="venda" />
              <span>Vender</span>
            </label>
            <label :class="{ on: form.purpose === 'aluguel' }">
              <input v-model="form.purpose" type="radio" value="aluguel" />
              <span>Alugar</span>
            </label>
          </fieldset>

          <div class="qv-grid">
            <div>
              <label class="admin-label" for="qv-nome">Seu nome *</label>
              <input id="qv-nome" v-model="form.name" class="admin-input" type="text" />
            </div>
            <div>
              <label class="admin-label" for="qv-tel">WhatsApp *</label>
              <input
                id="qv-tel"
                :value="phoneDisplay"
                class="admin-input"
                type="tel"
                inputmode="numeric"
                placeholder="(67) 99217-1768"
                @input="onPhoneInput"
              />
            </div>
            <div>
              <label class="admin-label" for="qv-tipo">Tipo do imóvel</label>
              <select id="qv-tipo" v-model="form.propertyType" class="admin-input">
                <option value="">Não sei dizer</option>
                <option v-for="t in PROPERTY_TYPES" :key="t" :value="t">
                  {{ PROPERTY_TYPE_LABELS[t] }}
                </option>
              </select>
            </div>
            <div>
              <label class="admin-label" for="qv-bairro">Bairro</label>
              <input id="qv-bairro" v-model="form.neighborhood" class="admin-input" type="text" />
            </div>
          </div>

          <label class="admin-label" for="qv-obs">Algo que a gente deva saber</label>
          <textarea
            id="qv-obs"
            v-model="form.note"
            class="admin-textarea"
            rows="3"
            placeholder="Ex.: está alugado até dezembro, precisa de reforma, tenho pressa..."
          />

          <p v-if="error" class="qv-err">{{ error }}</p>

          <button class="admin-btn qv-submit" type="submit" :disabled="status === 'sending'">
            {{ status === 'sending' ? 'Enviando...' : 'Quero uma avaliação' }}
          </button>
          <p class="qv-priv">Usamos seus dados só para retornar esse contato. Sem cadastro e sem lista de e-mail.</p>
        </form>
      </div>

      <aside class="qv-side">
        <h2>Prefere conversar agora?</h2>
        <a v-if="tenant?.whatsapp" class="qv-wa" :href="whatsappLink()" target="_blank" rel="noopener">
          <AppIcon name="wa" /> Chamar no WhatsApp
        </a>
        <a v-if="tenant?.phone" class="qv-tel" :href="`tel:${tenant.phone}`">
          <AppIcon name="phone" /> {{ tenant.phone }}
        </a>

        <!-- Só fato verificável: nada de depoimento ou número inventado. -->
        <dl class="qv-facts">
          <div v-if="tenant?.creci">
            <dt>CRECI</dt>
            <dd>{{ tenant.creci }}</dd>
          </div>
          <div v-if="cidade">
            <dt>Atuação</dt>
            <dd>{{ cidade }}{{ tenant?.state ? ` · ${tenant.state}` : '' }}</dd>
          </div>
          <div v-if="properties.length">
            <dt>Imóveis anunciados hoje</dt>
            <dd>{{ properties.length }}</dd>
          </div>
        </dl>
        <p v-if="properties.length" class="qv-see">
          <NuxtLink to="/">Ver os imóveis que já anunciamos →</NuxtLink>
        </p>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.qv {
  max-width: 1040px;
  margin: 0 auto;
  padding: 22px 20px 72px;
  display: flex;
  flex-direction: column;
  gap: 34px;
}

.crumbs {
  display: flex;
  gap: 7px;
  font-size: 13.5px;
  color: var(--ink-soft);
}
.crumbs a {
  color: var(--brand);
}

.qv-head {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
}
.qv-head h1 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(27px, 5vw, 40px);
  line-height: 1.12;
  letter-spacing: -0.02em;
  margin: 0;
  max-width: 20ch;
  text-wrap: balance;
}
.qv-lede {
  margin: 0;
  max-width: 60ch;
  font-size: 17px;
  line-height: 1.6;
  color: var(--ink-soft);
}
.qv-cta {
  display: inline-block;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  padding: 12px 22px;
  border-radius: 10px;
  text-decoration: none;
}

.qv-steps h2,
.qv-form-wrap h2 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 20px;
  margin: 0 0 14px;
}
.qv-steps ol {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  counter-reset: passo;
  list-style: none;
}
.qv-steps li {
  counter-increment: passo;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px;
}
.qv-steps li::before {
  content: counter(passo);
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 13.5px;
  font-weight: 700;
  margin-bottom: 10px;
}
.qv-steps h3 {
  font-size: 16px;
  margin: 0 0 5px;
}
.qv-steps p {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--ink-soft);
}

.qv-form-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(240px, 1fr);
  gap: 20px;
  align-items: start;
}
@media (max-width: 780px) {
  .qv-form-wrap {
    grid-template-columns: 1fr;
  }
}
.qv-form-card,
.qv-side {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px;
}
.qv-form-card form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.qv-purpose {
  border: none;
  padding: 0;
  margin: 0 0 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.qv-purpose legend {
  font-size: 13.5px;
  font-weight: 600;
  margin-bottom: 8px;
  padding: 0;
}
.qv-purpose label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border: 1.5px solid var(--line-2);
  border-radius: 9px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14.5px;
}
.qv-purpose label.on {
  border-color: var(--brand);
  background: color-mix(in srgb, var(--brand) 8%, transparent);
  color: var(--brand);
}

.qv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  margin-bottom: 6px;
}
.qv-submit {
  margin-top: 14px;
}
.qv-err {
  color: #b91c1c;
  font-size: 13.5px;
  margin: 10px 0 0;
}
.qv-ok {
  color: var(--wa-dark);
  font-weight: 600;
  font-size: 15.5px;
  line-height: 1.55;
  margin: 0;
}
.qv-priv {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: var(--ink-soft);
}

.qv-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qv-wa,
.qv-tel {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 16px;
  border-radius: 10px;
  font-weight: 600;
  text-decoration: none;
}
.qv-wa {
  /* --wa já é o verde escurecido para atingir AA com texto BRANCO (≈5.8:1).
     Texto escuro em cima dele reprova no contraste. */
  background: var(--wa);
  color: #fff;
}
.qv-tel {
  border: 1px solid var(--line-2);
  color: inherit;
}
.qv-facts {
  margin: 6px 0 0;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.qv-facts div {
  display: flex;
  flex-direction: column;
}
.qv-facts dt {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}
.qv-facts dd {
  margin: 0;
  font-weight: 600;
}
.qv-see {
  margin: 4px 0 0;
  font-size: 14px;
}
.qv-see a {
  color: var(--brand);
}
</style>

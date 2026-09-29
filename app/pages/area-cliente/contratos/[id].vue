<script setup lang="ts">
import type { ContractForClient, PortalDocCategory, PortalDocument } from '~~/shared/models/portal'
import { PORTAL_DOC_CATEGORIES, PORTAL_DOC_LABELS } from '~~/shared/models/portal'
import { classificarFalha, MENSAGEM_DE_FALHA } from '~~/shared/utils/session-error'
import type { ChargeForClient } from '~~/shared/models/cobranca'

definePageMeta({ layout: 'portal', middleware: 'portal' })

const route = useRoute()
const id = computed(() => String(route.params.id || ''))

const contrato = ref<ContractForClient | null>(null)
const documentos = ref<PortalDocument[]>([])
const carregando = ref(true)
const erro = ref('')
const baixando = ref<string | null>(null)
const erroDownload = ref('')
const boletos = ref<ChargeForClient[]>([])

onMounted(async () => {
  try {
    // Em paralelo: o endpoint de documentos já valida o contrato por conta
    // própria, então não há ordem a respeitar entre os dois.
    const [c, docs] = await Promise.all([
      portalFetch<ContractForClient>(`/api/portal/contratos/${id.value}`),
      portalFetch<PortalDocument[]>(`/api/portal/contratos/${id.value}/documentos`),
    ])
    contrato.value = c
    documentos.value = docs
    // Boletos só para o inquilino, e fora do Promise.all de propósito: uma
    // falha aqui não pode esconder os documentos, que existiam antes da
    // cobrança e continuam sendo o principal desta página.
    if (c.roles.includes('inquilino')) {
      portalFetch<ChargeForClient[]>(`/api/portal/contratos/${id.value}/cobrancas`)
        .then((b) => (boletos.value = b))
        .catch(() => {})
    }
  } catch (e: unknown) {
    // Diferencia sessão caída, falha de rede e 404: "não foi possível carregar"
    // serve para tudo e não diz o que fazer.
    const tipo = classificarFalha(e)
    erro.value =
      tipo === 'nao_encontrado' ? 'Contrato não encontrado.' : MENSAGEM_DE_FALHA[tipo]
  } finally {
    carregando.value = false
  }
})

/** Agrupado por categoria, na ordem do enum — não na ordem que o banco devolveu. */
const porCategoria = computed(() => {
  const grupos: { categoria: PortalDocCategory; docs: PortalDocument[] }[] = []
  for (const categoria of PORTAL_DOC_CATEGORIES) {
    const docs = documentos.value.filter((d) => d.category === categoria)
    if (docs.length) grupos.push({ categoria, docs })
  }
  return grupos
})

async function baixar(doc: PortalDocument) {
  baixando.value = doc.id
  erroDownload.value = ''
  try {
    // POST: o endpoint grava a trilha de acesso, e um GET seria disparado por
    // prefetch do navegador e preview de mensageiro.
    const { url } = await portalFetch<{ url: string }>(
      `/api/portal/documentos/${doc.id}/download`,
      { method: 'POST' },
    )
    // ⚠️ `window.open` aqui NÃO serve, e o motivo é o iPhone — que é a
    // plataforma principal deste portal. Entre o toque em "Baixar" e esta linha
    // existe um `await`, então a janela seria aberta fora do turno do gesto: o
    // Chrome costuma tolerar, o Safari recusa. E recusa CALADO — não lança
    // nada, `erroDownload` continua vazio, o spinner só para. A pessoa não vê
    // nada acontecer, e a trilha de LGPD registra um download que nunca chegou.
    //
    // `location.href` não é popup e não passa por essa regra. A URL assinada vem
    // com `Content-Disposition: attachment` (ver o `download` no endpoint), então
    // o navegador baixa o arquivo e a pessoa continua na lista, que é onde ela
    // vai querer continuar.
    window.location.href = url
  } catch (e: unknown) {
    const status = (e as { statusCode?: number })?.statusCode
    erroDownload.value =
      status === 429
        ? 'Muitos downloads seguidos. Aguarde um minuto e tente de novo.'
        : MENSAGEM_DE_FALHA[classificarFalha(e)]
  } finally {
    baixando.value = null
  }
}

/** Em aberto primeiro (o que o inquilino veio fazer aqui), depois o histórico. */
const boletosEmAberto = computed(() =>
  boletos.value.filter((b) => b.status === 'emitida' || b.status === 'vencida' || b.status === 'parcial').sort((a, b) => a.dueOn.localeCompare(b.dueOn)),
)
const boletosPassados = computed(() =>
  boletos.value.filter((b) => b.status === 'paga' || b.status === 'cancelada').sort((a, b) => b.dueOn.localeCompare(a.dueOn)),
)

useHead({
  title: 'Contrato · Área do Cliente',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div>
    <NuxtLink to="/area-cliente" class="voltar">
      <AppIcon name="arrow-left" />
      Meus contratos
    </NuxtLink>

    <div v-if="carregando" aria-busy="true" aria-label="Carregando o contrato">
      <div class="esqueleto alto" />
      <div class="esqueleto" />
    </div>

    <p v-else-if="erro" class="erro" role="alert">
      <AppIcon name="alert" />
      {{ erro }}
    </p>

    <template v-else-if="contrato">
      <PortalContratoResumo :contrato="contrato" />

      <section v-if="boletos.length" class="secao" aria-labelledby="t-boletos">
        <h2 id="t-boletos" class="secao-tit">Boletos do aluguel</h2>

        <ul v-if="boletosEmAberto.length" class="boletos">
          <PortalBoletoItem v-for="(b, i) in boletosEmAberto" :key="b.id" :boleto="b" :principal="i === 0" />
        </ul>
        <p v-else class="em-dia">
          <AppIcon name="check" />
          Nenhum boleto em aberto. Tudo em dia!
        </p>

        <!-- Histórico recolhido: é consulta rara (o comprovante para o IR), e
             aberto empurraria os documentos para longe no celular. -->
        <details v-if="boletosPassados.length" class="historico">
          <summary>
            Histórico de pagamentos
            <span class="conta">{{ boletosPassados.length }}</span>
            <AppIcon name="chevron-down" class="seta" />
          </summary>
          <ul>
            <PortalBoletoItem v-for="b in boletosPassados" :key="b.id" :boleto="b" historico />
          </ul>
        </details>
      </section>

      <section class="secao" aria-labelledby="t-docs">
        <h2 id="t-docs" class="secao-tit">
          Documentos
          <span v-if="documentos.length" class="conta">{{ documentos.length }}</span>
        </h2>

        <p v-if="erroDownload" class="erro" role="alert">
          <AppIcon name="alert" />
          {{ erroDownload }}
        </p>

        <div v-if="!documentos.length" class="vazio">
          <b>Nenhum documento publicado ainda</b>
          <p>Quando a imobiliária publicar contratos, vistorias ou comprovantes, eles aparecem aqui.</p>
        </div>

        <div v-for="grupo in porCategoria" :key="grupo.categoria" class="grupo">
          <h3 class="grupo-tit">{{ PORTAL_DOC_LABELS[grupo.categoria] }}</h3>
          <ul class="docs">
            <PortalDocumentoItem
              v-for="d in grupo.docs"
              :key="d.id"
              :doc="d"
              :baixando="baixando === d.id"
              @baixar="baixar(d)"
            />
          </ul>
        </div>
      </section>

      <PortalAjuda :codigo="contrato.code" />
    </template>
  </div>
</template>

<style scoped>
.voltar {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 16px;
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-2);
  text-decoration: none;
}
.voltar:hover {
  color: var(--ink);
}
.voltar:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 3px;
  border-radius: 4px;
}
.esqueleto {
  height: 140px;
  margin-bottom: 14px;
  border-radius: 16px;
  background: linear-gradient(100deg, #efeee9 30%, #f7f6f2 50%, #efeee9 70%) 0 0 / 300% 100%;
  animation: brilho 1.4s ease-in-out infinite;
}
.esqueleto.alto {
  height: 230px;
  background-color: var(--ink);
}
@keyframes brilho {
  to {
    background-position: -150% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .esqueleto {
    animation: none;
  }
}
.erro {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: #fdecec;
  color: #9f1c1c;
  font-size: 15px;
}
.secao {
  margin-top: 34px;
}
.secao-tit {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  font-size: 20px;
  font-weight: 700;
}
.conta {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--line);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-2);
  letter-spacing: 0;
}
.boletos {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.em-dia {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 14px 16px;
  border-radius: 12px;
  background: #e3f3e8;
  color: #1c6b3a;
  font-weight: 700;
}
.historico {
  margin-top: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
}
.historico summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.historico summary::-webkit-details-marker {
  display: none;
}
.historico summary:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  border-radius: 14px;
}
.historico .seta {
  margin-left: auto;
  transition: rotate 0.2s ease;
}
.historico[open] .seta {
  rotate: 180deg;
}
.historico ul {
  list-style: none;
  margin: 0;
  padding: 0 12px 6px;
  border-top: 1px solid var(--line);
}
.vazio {
  padding: 22px;
  border: 1px dashed var(--line-2);
  border-radius: 14px;
  background: #fff;
  font-size: 15px;
}
.vazio p {
  margin: 4px 0 0;
  color: var(--ink-2);
  line-height: 1.5;
}
.grupo + .grupo {
  margin-top: 18px;
}
.grupo-tit {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}
.docs {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}
</style>

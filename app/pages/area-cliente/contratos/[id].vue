<script setup lang="ts">
import type { ContractForClient, PortalDocCategory, PortalDocument } from '~~/shared/models/portal'
import { CONTRACT_PARTY_LABELS, PORTAL_DOC_CATEGORIES, PORTAL_DOC_LABELS } from '~~/shared/models/portal'
import { classificarFalha, MENSAGEM_DE_FALHA } from '~~/shared/utils/session-error'

definePageMeta({ layout: 'portal', middleware: 'portal' })

const route = useRoute()
const id = computed(() => String(route.params.id || ''))

const contrato = ref<ContractForClient | null>(null)
const documentos = ref<PortalDocument[]>([])
const carregando = ref(true)
const erro = ref('')
const baixando = ref<string | null>(null)
const erroDownload = ref('')

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

function competencia(d: PortalDocument): string {
  if (!d.competence) return ''
  // A competência é gravada no dia 1; só o mês e o ano interessam na tela.
  const [ano, mes] = d.competence.split('-')
  return `${mes}/${ano}`
}

function data(v: string | null): string {
  if (!v) return '—'
  const [ano, mes, dia] = v.split('-')
  return `${dia}/${mes}/${ano}`
}

function dinheiro(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const papeis = computed(() =>
  (contrato.value?.roles ?? []).map((r) => CONTRACT_PARTY_LABELS[r]).join(' e '),
)

useHead({
  title: 'Contrato · Área do Cliente',
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <div>
    <NuxtLink to="/area-cliente" class="voltar">← Meus contratos</NuxtLink>

    <p v-if="carregando" class="muted">Carregando…</p>
    <p v-else-if="erro" class="erro" role="alert">{{ erro }}</p>

    <template v-else-if="contrato">
      <h1 class="tit">{{ contrato.addressLabel || `Contrato ${contrato.code}` }}</h1>
      <p class="sub">Você é o {{ papeis }} neste contrato.</p>

      <section class="painel">
        <div><span>Contrato</span><b>{{ contrato.code }}</b></div>
        <div><span>Situação</span><b>{{ contrato.status === 'ativo' ? 'Ativo' : 'Encerrado' }}</b></div>
        <div><span>Início</span><b>{{ data(contrato.startedOn) }}</b></div>
        <div><span>Término</span><b>{{ data(contrato.endsOn) }}</b></div>
        <div><span>Aluguel</span><b>{{ dinheiro(contrato.rentAmount) }}</b></div>
        <div><span>Vencimento</span><b>{{ contrato.dueDay ? `dia ${contrato.dueDay}` : '—' }}</b></div>
      </section>

      <h2 class="tit2">Documentos</h2>

      <p v-if="erroDownload" class="erro" role="alert">{{ erroDownload }}</p>

      <div v-if="!documentos.length" class="vazio">
        <p><b>Nenhum documento publicado ainda.</b></p>
        <p>Quando a imobiliária publicar contratos, vistorias ou comprovantes, eles aparecem aqui.</p>
      </div>

      <section v-for="grupo in porCategoria" :key="grupo.categoria" class="grupo">
        <h3 class="grupo-tit">{{ PORTAL_DOC_LABELS[grupo.categoria] }}</h3>
        <ul class="docs">
          <li v-for="d in grupo.docs" :key="d.id">
            <div class="doc-info">
              <b>{{ d.title }}</b>
              <small>
                <template v-if="competencia(d)">{{ competencia(d) }}</template>
                <template v-if="d.dueOn"> · vence {{ data(d.dueOn) }}</template>
                <template v-if="d.amount !== null"> · {{ dinheiro(d.amount) }}</template>
              </small>
            </div>
            <button type="button" class="btn-baixar" :disabled="baixando === d.id" @click="baixar(d)">
              {{ baixando === d.id ? 'Abrindo…' : 'Baixar' }}
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.voltar {
  display: inline-block;
  font-size: 13px;
  color: #4b5563;
  text-decoration: none;
  margin-bottom: 12px;
}
.tit {
  font-size: 21px;
  margin: 0 0 4px;
}
.tit2 {
  font-size: 17px;
  margin: 26px 0 10px;
}
.sub {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 16px;
}
.muted {
  font-size: 14px;
  color: #6b7280;
}
.erro {
  color: #b91c1c;
  font-size: 14px;
}
.painel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
}
.painel div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.painel span {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
}
.painel b {
  font-size: 14px;
}
.vazio {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  font-size: 14px;
  color: #4b5563;
}
.vazio p {
  margin: 0 0 6px;
}
.grupo {
  margin-bottom: 18px;
}
.grupo-tit {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
  margin: 0 0 8px;
}
.docs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.docs li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  padding: 12px 14px;
}
.doc-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.doc-info b {
  font-size: 14px;
}
.doc-info small {
  font-size: 12px;
  color: #6b7280;
}
.btn-baixar {
  flex: none;
  border: 1px solid var(--brand);
  background: var(--brand);
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn-baixar:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>

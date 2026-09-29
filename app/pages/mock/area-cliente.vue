<script setup lang="ts">
import type { ContractForClient, PortalDocument } from '~~/shared/models/portal'
import type { ChargeForClient } from '~~/shared/models/cobranca'
import { PORTAL_DOC_LABELS } from '~~/shared/models/portal'

/**
 * MOCK de interface — o interior da Área do Cliente com dados inventados.
 *
 * As páginas de verdade exigem sessão de cliente, e abrir uma conta de teste
 * significaria gravar no banco de produção (develop e prod dividem o banco).
 * Aqui os MESMOS componentes das páginas são montados com dados de exemplo,
 * para revisar a interface. Some do build de produção pelo 404 abaixo.
 */
if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Not Found' })

definePageMeta({ layout: 'portal' })
useSeoMeta({ title: 'Mock · Área do Cliente', robots: 'noindex, nofollow' })

const contratos: ContractForClient[] = [
  { id: 'c1', code: 'LOC-0142', addressLabel: 'Rua das Palmeiras, 318 — apto 42, Jardim das Américas', status: 'ativo', startedOn: '2025-03-01', endsOn: '2028-02-29', rentAmount: 2350, dueDay: 10, roles: ['inquilino'] },
  { id: 'c2', code: 'LOC-0087', addressLabel: 'Av. Ranulpho Marques Leal, 1200 — casa', status: 'ativo', startedOn: '2024-06-01', endsOn: '2027-05-31', rentAmount: 3900, dueDay: 5, roles: ['proprietario', 'fiador'] },
  { id: 'c3', code: 'LOC-0031', addressLabel: 'Rua Paranaíba, 77', status: 'encerrado', startedOn: '2022-01-01', endsOn: '2024-12-31', rentAmount: 1800, dueDay: 15, roles: ['inquilino'] },
]

const boletos: ChargeForClient[] = [
  { id: 'b1', competence: '2026-10-01', dueOn: '2026-10-10', amount: 2350, status: 'emitida', paymentUrl: 'https://www.asaas.com/i/exemplo', bankSlipUrl: null, digitableLine: '23793.38128 60000.000003 00000.000400 1 00000000235000', pixCopyPaste: '00020126...' },
  { id: 'b2', competence: '2026-09-01', dueOn: '2026-09-10', amount: 2350, status: 'vencida', paymentUrl: 'https://www.asaas.com/i/exemplo', bankSlipUrl: null, digitableLine: '23793.38128 60000.000003 00000.000400 1 00000000235000', pixCopyPaste: '00020126...' },
  { id: 'b3', competence: '2026-08-01', dueOn: '2026-08-10', amount: 2350, status: 'paga', paymentUrl: null, bankSlipUrl: null, digitableLine: null, pixCopyPaste: null },
  { id: 'b4', competence: '2026-07-01', dueOn: '2026-07-10', amount: 2350, status: 'paga', paymentUrl: null, bankSlipUrl: null, digitableLine: null, pixCopyPaste: null },
]

function doc(id: string, category: PortalDocument['category'], title: string, extra: Partial<PortalDocument> = {}): PortalDocument {
  return { id, contractId: 'c1', category, title, competence: null, dueOn: null, amount: null, mime: 'application/pdf', sizeBytes: 482_000, audience: ['inquilino'], publishedAt: '2026-09-01', createdAt: '2026-09-01', ...extra }
}
const documentos = [
  doc('d1', 'contrato', 'Contrato de locação assinado', { sizeBytes: 1_830_000 }),
  doc('d2', 'vistoria', 'Vistoria de entrada', { mime: 'image/jpeg', sizeBytes: 3_400_000 }),
  doc('d3', 'recibo', 'Recibo de agosto', { competence: '2026-08-01', amount: 2350 }),
]
const grupos = [
  { categoria: 'contrato' as const, docs: [documentos[0]!] },
  { categoria: 'vistoria' as const, docs: [documentos[1]!] },
  { categoria: 'recibo' as const, docs: [documentos[2]!] },
]
</script>

<template>
  <div class="mock">
    <h1 style="margin: 6px 0 18px; font-size: 30px">Meus contratos</h1>
    <ul style="list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); gap: 14px">
      <li v-for="c in contratos" :key="c.id"><PortalContratoCard :contrato="c" /></li>
    </ul>

    <hr style="margin: 48px 0; border: 0; border-top: 2px dashed var(--line-2)">

    <PortalContratoResumo :contrato="contratos[0]!" />
    <h2 style="margin: 34px 0 14px; font-size: 20px">Boletos do aluguel</h2>
    <ul style="list-style: none; margin: 0; padding: 0; display: grid; gap: 10px">
      <PortalBoletoItem :boleto="boletos[1]!" principal />
      <PortalBoletoItem :boleto="boletos[0]!" />
    </ul>
    <ul style="list-style: none; margin: 12px 0 0; padding: 0 12px; border: 1px solid var(--line); border-radius: 14px; background: #fff">
      <PortalBoletoItem v-for="b in boletos.slice(2)" :key="b.id" :boleto="b" historico />
    </ul>

    <h2 style="margin: 34px 0 14px; font-size: 20px">Documentos</h2>
    <div v-for="g in grupos" :key="g.categoria" style="margin-bottom: 18px">
      <h3 style="margin: 0 0 8px; font-size: 13px; color: var(--muted)">{{ PORTAL_DOC_LABELS[g.categoria] }}</h3>
      <ul style="list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 14px; background: #fff; overflow: hidden">
        <PortalDocumentoItem v-for="d in g.docs" :key="d.id" :doc="d" />
      </ul>
    </div>
    <PortalAjuda codigo="LOC-0142" />
  </div>
</template>


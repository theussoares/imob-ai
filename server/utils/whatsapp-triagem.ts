import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import {
  PASSOS_ATIVOS,
  TIPO_DO_LEAD,
  TRIAGEM_EXPIRA_MS,
  dentroDoHorarioComercial,
  passoDaTriagem,
  resumoDaTriagem,
  type MensagemDaTriagem,
} from '~~/shared/models/triagem'
import { nomeParaSaudacao } from '~~/shared/models/portal-lead'
import type { WhatsappAccountRecord } from '~~/server/mappers/whatsapp.mapper'
import type { Enviada, MensagemRecebida } from '~~/server/services/whatsapp/provider'
import { cloudApi } from '~~/server/services/whatsapp/cloud-api'
import { insertMessage, salvarTriagem, type ConversationState } from '~~/server/repositories/whatsapp.repository'
import { setLeadTypeIfUnknown } from '~~/server/repositories/lead.repository'
import { getTenantById } from '~~/server/repositories/tenant.repository'
import { registrarEventos } from '~~/server/utils/lead-crm'

type Client = SupabaseClient<Database>

export interface ContextoDaMensagem {
  /**
   * A conversa nasceu com esta mensagem. Não basta "primeira entrada ao
   * vivo": a conversa aberta pela imobiliária com um modelo (lead do portal,
   * gaveta do contato) e a que veio do histórico do app também não têm
   * entrada ao vivo — e o robô perguntaria "o que você procura?" a quem o
   * corretor acabou de escrever, ou a um cliente de meses.
   */
  conversaNova: boolean
  /** A conversa já sabe de qual imóvel veio (botão do site). */
  temImovel: boolean
  leadId: string | null
}

/** O texto da mensagem do robô como fica no histórico — com as opções, para quem lê depois saber o que foi oferecido. */
function textoNoHistorico(m: MensagemDaTriagem): string {
  if (m.tipo === 'texto') return m.corpo
  const opcoes = m.tipo === 'botoes' ? m.botoes.map((b) => b.titulo) : m.linhas.map((l) => l.titulo)
  return `${m.corpo}\n${opcoes.map((o) => `[${o}]`).join(' ')}`
}

/**
 * Conduz a triagem depois que a mensagem do contato foi gravada.
 *
 * Começa só em conversa nova, na primeira mensagem ao vivo, sem imóvel
 * identificado (quem veio do botão de um imóvel já disse o que quer — o
 * corretor tem mais a dizer que o robô) e sem resposta humana ainda.
 *
 * Nunca lança: a mensagem do cliente já está salva, e uma falha da triagem
 * não pode virar 500 no webhook — a Meta reenviaria, e o reenvio seria
 * ignorado pelo `wamid` de qualquer jeito.
 *
 * As mensagens do robô têm `origin = 'bot'` e não mexem em `last_direction`,
 * `first_response_at` nem na contagem de não lidas: para a caixa de entrada e
 * para o painel de desempenho, a conversa continua esperando uma PESSOA.
 */
export async function conduzirTriagem(
  service: Client,
  conta: WhatsappAccountRecord,
  state: ConversationState,
  m: MensagemRecebida,
  ctx: ContextoDaMensagem,
  agora = new Date(),
): Promise<void> {
  try {
    if (conta.triagem === 'desligada' || !conta.accessTokenEnc) return
    const t = state.triagem
    const ativa = t.passo !== null && PASSOS_ATIVOS.includes(t.passo)

    if (ativa && t.em && agora.getTime() - Date.parse(t.em) > TRIAGEM_EXPIRA_MS) {
      await salvarTriagem(service, conta.tenantId, state.id, t, { ...t, passo: 'interrompida' })
      return
    }
    const dentro = dentroDoHorarioComercial(agora)
    if (!ativa) {
      const deveComecar =
        t.passo === null &&
        ctx.conversaNova &&
        !ctx.temImovel &&
        !state.firstResponseAt &&
        (conta.triagem === 'sempre' || (conta.triagem === 'fora_do_horario' && !dentro))
      if (!deveComecar) return
    }

    const tenant = await getTenantById(service, conta.tenantId)
    if (!tenant) return
    const nome = nomeParaSaudacao(m.nomeDoPerfil ?? '')
    const r = passoDaTriagem(
      { passo: t.passo, tipo: t.tipo, faixa: t.faixa, tentativas: t.tentativas },
      { respostaId: m.respostaId ?? null, texto: m.texto },
      { nomeDaImobiliaria: tenant.name, nome: nome === 'cliente' ? null : nome, dentroDoHorario: dentro },
    )

    const antes = { passo: t.passo, tentativas: t.tentativas }
    if (!(await salvarTriagem(service, conta.tenantId, state.id, antes, r.estado))) return

    if (r.enviar) {
      const conexao = { phoneNumberId: conta.phoneNumberId, wabaId: conta.wabaId, accessToken: decifrar(conta.accessTokenEnc) }
      let enviada: Enviada
      try {
        enviada = await cloudApi().enviarInterativo(conexao, state.waId, r.enviar)
      } catch (e) {
        // A reserva já avançou o passo: sem isto, a próxima mensagem da pessoa
        // seria lida como resposta a uma pergunta que nunca chegou a ela.
        await salvarTriagem(service, conta.tenantId, state.id, r.estado, { ...r.estado, passo: 'interrompida' })
        throw e
      }
      await insertMessage(service, conta.tenantId, {
        conversationId: state.id,
        wamid: enviada.wamid,
        direction: 'out',
        origin: 'bot',
        type: r.enviar.tipo === 'texto' ? 'text' : 'interactive',
        body: textoNoHistorico(r.enviar),
        status: 'enviada',
        sentBy: null,
        occurredAt: new Date().toISOString(),
      })
    }

    if (r.concluida && ctx.leadId) {
      await registrarEventos(service, tenant, ctx.leadId, [{ kind: 'nota', body: resumoDaTriagem(r.concluida), meta: {} }], null)
      await setLeadTypeIfUnknown(service, conta.tenantId, ctx.leadId, TIPO_DO_LEAD[r.concluida.tipo])
    }
  } catch (e) {
    logWarn('whatsapp.triagem_falhou', { tenant: conta.tenantId, reason: errMessage(e) })
  }
}

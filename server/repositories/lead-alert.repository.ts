import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import type { Tenant } from '~~/shared/models/tenant'
import type { LeadDoAviso } from '~~/server/utils/email-templates'
import { LEAD_TYPE_LABELS, toLeadType } from '~~/shared/models/lead'
import { formatPropertyCode } from '~~/shared/utils/property-specs'

type Client = SupabaseClient<Database>

/** Aceita o suficiente para não mandar para lixo digitado no painel. */
const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/

/**
 * Para quem vai o aviso de lead desta imobiliária.
 *
 * Duas fontes, somadas:
 *  - quem entra no painel (`tenant_members`) com e-mail CONFIRMADO. Convite
 *    pendente fica de fora: o endereço foi digitado por outra pessoa e ninguém
 *    provou que é dono dele — e o aviso carrega nome e telefone de um terceiro;
 *  - o `tenant.email`, o e-mail de contato que a própria imobiliária cadastrou.
 *    Sem ele, uma imobiliária cujo único membro é alguém da plataforma não
 *    receberia aviso nenhum — que é o cenário provável de um cliente recém
 *    implantado.
 *
 * `getUserById` um a um, e não `listUsers()` como em `listMembers`: o
 * `listUsers` devolve só a primeira página (50 usuários). Com a plataforma
 * passando disso, o membro da página 2 sumiria do aviso em silêncio — e aviso
 * que some em silêncio é o defeito que esta função existe para consertar. São
 * dois ou três membros por tenant; N chamadas aqui custam nada.
 *
 * Service role porque o e-mail vive no schema `auth`. Sem RLS para ajudar, o
 * `eq('tenant_id')` é a única coisa que impede o aviso da OLMI de ir para o
 * membro de outra imobiliária.
 */
export async function destinatariosDoAviso(service: Client, tenant: Tenant): Promise<string[]> {
  const { data: rows, error } = await service
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenant.id)
  if (error) throw error

  const emails: string[] = []
  for (const r of rows ?? []) {
    const { data } = await service.auth.admin.getUserById(r.user_id)
    const u = data?.user
    if (u?.email && u.email_confirmed_at) emails.push(u.email)
  }
  if (tenant.email) emails.push(tenant.email)

  const vistos = new Set<string>()
  return emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL_RE.test(e) && !vistos.has(e) && vistos.add(e))
}

export interface LeadParado extends LeadDoAviso {
  tenantId: string
  createdAt: string
}

/**
 * Leads que chegaram pelo site e ninguém tocou: etapa `novo` e `updated_at`
 * mais antigo que `paradoAntesDe`.
 *
 * `updated_at` e não `created_at` como sinal de "ninguém mexeu": qualquer
 * edição no painel (mudar etapa, anotar, agendar retorno) passa pelo trigger e
 * move a data. Usar só a etapa faria o lead anotado ("liguei, não atendeu")
 * continuar cobrando a imobiliária todo dia como se estivesse abandonado.
 *
 * `recebidoDesde` corta a cauda: um lead de três meses atrás que nunca saiu de
 * `novo` foi abandonado de propósito, e cobrar por ele todo dia ensina a
 * imobiliária a ignorar o lembrete — inclusive o do lead de ontem.
 *
 * ⚠️ É a ÚNICA leitura desta base que atravessa tenants, e é deliberado: quem
 * chama é o cron diário, que não tem tenant de requisição. Cada linha volta com
 * `tenantId`, e o envio agrupa por ele. Nunca exponha isto num endpoint que
 * tenha tenant — lá o certo é filtrar por `tenant_id` como em todo o resto.
 *
 * Cadastro manual fica de fora: quem cadastrou já está falando com a pessoa.
 */
export async function listarLeadsParados(
  service: Client,
  janela: { recebidoDesde: string; paradoAntesDe: string },
): Promise<LeadParado[]> {
  const { data, error } = await service
    .from('leads')
    .select('tenant_id, name, phone, message, lead_type, source, created_at, updated_at, properties(code, title)')
    .eq('stage', 'novo')
    .gte('created_at', janela.recebidoDesde)
    .lt('updated_at', janela.paradoAntesDe)
    .order('created_at', { ascending: true })
  if (error) throw error

  return (data ?? [])
    .filter((r) => r.source !== 'manual' && r.phone && r.name)
    .map((r) => {
      const imovel = (r as unknown as { properties: { code: string; title: string } | null }).properties
      return {
        tenantId: r.tenant_id,
        createdAt: r.created_at,
        nome: r.name!,
        telefone: r.phone!,
        mensagem: r.message,
        tipo: LEAD_TYPE_LABELS[toLeadType(r.lead_type)],
        imovel: imovel ? { codigo: formatPropertyCode(imovel.code), titulo: imovel.title } : null,
      }
    })
}

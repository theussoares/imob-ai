import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/shared/types/database.types'
import { validarSenha } from '~~/layers/gestao/domain/auth'
import { buscarMembroAtivoPorEmail, buscarMembroPorUsuario } from '~~/server/repositories/gestao-member.repository'
import { registrarEvento } from '~~/server/repositories/gestao-evento.repository'
import { chaveDeFalha } from '~~/server/utils/gestao-otp'
import { exigirLimiteLogin, registrarFalhaLogin } from '~~/server/utils/gestao-auth'

type Client = SupabaseClient<Database>

/**
 * Recuperação de senha do /gestao.
 *
 * Mesmo desenho do `/api/painel/recuperar-senha` do /admin (link do Supabase, e-mail com o nome da imobiliária,
 * resposta sempre igual), com três diferenças deliberadas:
 * - a senha é trocada PELO SERVIDOR (`verifyOtp` + `updateUserById`): o gestão não tem client do Supabase no
 *   navegador, e o token nunca chega a um script de terceiro nem a uma sessão do navegador;
 * - o link leva à NOSSA página e só o envio do formulário gasta o token (a prévia do WhatsApp e o antivírus do
 *   e-mail abrem links: ver `auth-link.ts`);
 * - trocar a senha NÃO entra: encerra todas as sessões e o próximo login passa pela senha E pelo código do
 *   2º fator. Quem tem só acesso ao e-mail não vira sessão do painel.
 */

export const ERRO_LINK_INVALIDO = 'Este link expirou ou já foi usado. Peça um novo na tela de login.'

/** Pedidos de link por conta e por IP, na mesma janela e com os mesmos tetos do login (`FALHAS_POR_*`). */
const chavesDeRecuperacao = (pepper: string, email: string, ip: string | null) => ({
  conta: chaveDeFalha(pepper, 'recuperar-conta', email),
  ip: ip ? chaveDeFalha(pepper, 'recuperar-ip', ip) : null,
})

export interface DepsSolicitar {
  db: Client
  tenant: { id: string; slug: string; name: string }
  email: string
  ip: string | null
  pepper: string
  agora: number
  /** Origem pública da imobiliária (do banco, nunca de header: ver `portalOrigin`). */
  origem: string
  enviar: (link: string) => Promise<void>
}

/**
 * Sempre resolve igual, exista a conta ou não: dizer «este e-mail não é da equipe» faria desta tela um
 * verificador de quem trabalha na imobiliária. O limite (429) vale para todo mundo, então também não revela nada.
 */
export async function solicitarRecuperacao(d: DepsSolicitar): Promise<void> {
  const chaves = chavesDeRecuperacao(d.pepper, d.email, d.ip)
  await exigirLimiteLogin(d.db, d.tenant.id, chaves, d.agora)
  // Conta o PEDIDO, não a falha: é o que impede de usar a tela para encher a caixa de e-mail de alguém.
  await registrarFalhaLogin(d.db, d.tenant.id, chaves, d.agora)

  const membro = await buscarMembroAtivoPorEmail(d.db, d.tenant.id, d.email)
  if (!membro) {
    logWarn('gestao.recuperacao_ignorada', { tenant: d.tenant.slug, motivo: 'nao_e_membro' })
    return
  }

  const destino = `${d.origem}/gestao/redefinir-senha`
  const { data, error } = await d.db.auth.admin.generateLink({ type: 'recovery', email: d.email, options: { redirectTo: destino } })
  const hash = data?.properties?.hashed_token
  if (error || !hash) {
    logError('gestao.recuperacao_link_falhou', { tenant: d.tenant.slug, reason: error?.message })
    return
  }
  // Sem `linkDeAcesso`: o `action_link` antigo seria GASTO pela prévia; aqui só vale o `token_hash` para a nossa página.
  const url = new URL(destino)
  url.searchParams.set('token_hash', hash)
  try {
    await d.enviar(url.toString())
  } catch (e) {
    logWarn('gestao.recuperacao_envio_falhou', { tenant: d.tenant.slug, reason: errMessage(e) })
  }
}

export interface DepsRedefinir {
  db: Client
  /** Client com a anon key e sem sessão: o mesmo do login (`clienteDeLogin`). */
  cliente: Client
  tenant: { id: string; slug: string }
  tokenHash: string
  senha: string
  ip: string | null
  pepper: string
  agora: number
}

export type ResultadoRedefinir = { ok: true } | { ok: false; status: 422; erro: string; motivo: 'link' | 'senha' }

export async function redefinirSenha(d: DepsRedefinir): Promise<ResultadoRedefinir> {
  // Só o IP: o token é de 256 bits e a conta ainda não é conhecida antes de verificar. Cada falha gasta cota.
  const chaves = { conta: chaveDeFalha(d.pepper, 'redefinir-ip', d.ip ?? 'sem-ip'), ip: null }
  await exigirLimiteLogin(d.db, d.tenant.id, chaves, d.agora)

  const falha = async (): Promise<ResultadoRedefinir> => {
    await registrarFalhaLogin(d.db, d.tenant.id, chaves, d.agora)
    return { ok: false, status: 422, erro: ERRO_LINK_INVALIDO, motivo: 'link' }
  }

  // A regra da senha vem ANTES de gastar o token: senha fraca não pode queimar o link da pessoa.
  // (O e-mail e o nome entram na regra, então a checagem final repete com eles depois de saber quem é.)
  if (!d.senha || d.senha.length > 200 || !validarSenha(d.senha).ok) return { ok: false, status: 422, erro: 'A senha não cumpre os requisitos.', motivo: 'senha' }

  const { data, error } = await d.cliente.auth.verifyOtp({ token_hash: d.tokenHash, type: 'recovery' })
  const user = data?.user
  if (error || !user || !data.session) return falha()

  const encerrar = () => d.db.auth.admin.signOut(data.session!.access_token, 'global').catch(() => {})

  // O token é do Supabase, não deste tenant: conta que não é membro DAQUI (de outra imobiliária, do /admin) não troca nada.
  const membro = await buscarMembroPorUsuario(d.db, d.tenant.id, user.id)
  if (!membro) {
    await encerrar()
    return falha()
  }
  if (!validarSenha(d.senha, { email: user.email ?? '', nome: membro.nome }).ok) {
    // O token já foi gasto pelo verifyOtp: a pessoa precisa pedir outro. Por isso a tela valida a regra antes de enviar.
    await encerrar()
    return { ok: false, status: 422, erro: 'A senha não cumpre os requisitos. Peça um novo link e tente de novo.', motivo: 'senha' }
  }

  const { error: erroTroca } = await d.db.auth.admin.updateUserById(user.id, { password: d.senha })
  // Qualquer sessão aberta (inclusive a que o verifyOtp acabou de criar) sai: a senha mudou, quem tinha a antiga não segue dentro.
  await encerrar()
  if (erroTroca) {
    logError('gestao.redefinir_falhou', { tenant: d.tenant.slug, reason: erroTroca.message })
    return { ok: false, status: 422, erro: 'Não foi possível salvar a nova senha. Peça um novo link.', motivo: 'link' }
  }

  await registrarEvento(d.db, d.tenant.id, { atorUserId: user.id, atorNome: membro.nome, acao: 'membro.senha_redefinida', alvoTipo: 'membro', alvoId: membro.id })
  return { ok: true }
}

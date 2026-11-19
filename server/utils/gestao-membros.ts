import type { Perfil } from '~~/layers/gestao/domain/types'
import { DEFINICOES_PERMISSAO, alterarPermissao, matrizPadrao, type ResultadoMatriz } from '~~/layers/gestao/domain/permissions'
import { validarConfiguracoes, type ResultadoConfig } from '~~/layers/gestao/domain/configuracoes'
import { ehUuid } from '~~/shared/utils/uuid'

/**
 * Regras de quem mexe em quem no «Usuários e permissões», puras. A permissão de
 * entrada (`convidar`, `admin`) é checada no endpoint; aqui ficam as travas que
 * a matriz não expressa. Cada uma devolve a frase do erro, ou `null` se pode.
 */

const ULTIMO_DONO = 'A imobiliária precisa de pelo menos um Dono ativo.'

/** O perfil de quem convida é teto: sem isto o Jurídico se promoveria convidando um e-mail dele como Dono. */
export function regraConvite(convidante: Perfil, alvo: Perfil): string | null {
  if (alvo === 'dono' && convidante !== 'dono') return 'Só o Dono pode convidar outro Dono.'
  return null
}

interface Pessoa {
  userId: string | null
  perfil: Perfil
}

export function regraAlterarMembro(o: {
  ator: { userId: string; perfil: Perfil }
  alvo: Pessoa
  novoPerfil: Perfil
  donosAtivos: number
}): string | null {
  // Mudar o próprio perfil é como o último Dono se tranca fora: o pedido certo é outro Dono fazer.
  if (o.alvo.userId === o.ator.userId) return 'Você não pode mudar o seu próprio perfil.'
  if ((o.alvo.perfil === 'dono' || o.novoPerfil === 'dono') && o.ator.perfil !== 'dono') {
    return 'Só o Dono concede ou retira o perfil Dono.'
  }
  if (o.alvo.perfil === 'dono' && o.novoPerfil !== 'dono' && o.alvo.userId && o.donosAtivos <= 1) return ULTIMO_DONO
  return null
}

export function regraRemoverMembro(o: { ator: { userId: string; perfil: Perfil }; alvo: Pessoa; donosAtivos: number }): string | null {
  if (o.alvo.userId === o.ator.userId) return 'Você não pode remover o seu próprio acesso.'
  if (o.alvo.perfil === 'dono' && o.ator.perfil !== 'dono') return 'Só o Dono remove outro Dono.'
  // Convite pendente de Dono não administra nada; revogá-lo nunca tranca a imobiliária.
  if (o.alvo.perfil === 'dono' && o.alvo.userId && o.donosAtivos <= 1) return ULTIMO_DONO
  return null
}

// --- Payloads das telas de usuários, permissões e configurações ---------------

const PERFIS: readonly Perfil[] = ['corretor', 'recepcao', 'juridico', 'dono']
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Matriz inteira vinda da tela → matriz validada célula a célula pela MESMA
 * função que a tela usa (`alterarPermissao`): estado que a chave não admite e as
 * travas do Dono recusam aqui também. O botão desabilitado da tela não é barreira.
 */
export function validarMatrizPedido(v: unknown): ResultadoMatriz {
  if (!objeto(v)) return { ok: false, erro: 'Envie a matriz de permissões.' }
  let m = matrizPadrao()
  for (const def of DEFINICOES_PERMISSAO) {
    const linha = v[def.chave]
    for (const perfil of PERFIS) {
      const valor = objeto(linha) ? linha[perfil] : undefined
      if (valor !== 'sim' && valor !== 'proprio' && valor !== 'nao') {
        return { ok: false, erro: `Falta o valor de «${def.rotulo}» para ${perfil}.` }
      }
      const r = alterarPermissao(m, def.chave, perfil, valor)
      if (!r.ok) return r
      m = r.matriz
    }
  }
  return { ok: true, matriz: m }
}

/** Configurações vindas da tela, validadas por `validarConfiguracoes` do domínio. */
export function validarConfigPedido(v: unknown): ResultadoConfig {
  if (!objeto(v) || !objeto(v.imobiliaria)) return { ok: false, erro: 'Envie as configurações.' }
  const im = v.imobiliaria
  const texto = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')
  return validarConfiguracoes({
    imobiliaria: { nome: texto(im.nome, 120), cnpj: texto(im.cnpj, 20), email: texto(im.email, 160), telefone: texto(im.telefone, 20) },
    comissaoPct: v.comissaoPct as number,
    taxaLocacaoPct: v.taxaLocacaoPct as number,
    multaAtrasoPct: v.multaAtrasoPct as number | undefined,
    jurosMesPct: v.jurosMesPct as number | undefined,
  })
}

/**
 * Perfil e corretor de um convite ou de uma alteração. Corretor exige o cadastro
 * (`brokers.id`, conferido no tenant pelo endpoint); os outros perfis não levam
 * corretor — sem isso, um Dono "ligado" a um corretor veria só os processos dele.
 */
export function perfilECorretorDoPedido(v: Record<string, unknown>): { perfil: Perfil; brokerId: string | null } {
  const perfil = v.perfil
  if (typeof perfil !== 'string' || !(PERFIS as string[]).includes(perfil)) {
    throw createError({ statusCode: 422, statusMessage: 'Escolha um perfil.' })
  }
  if (perfil !== 'corretor') return { perfil: perfil as Perfil, brokerId: null }
  const brokerId = typeof v.brokerId === 'string' ? v.brokerId.trim() : ''
  if (!ehUuid(brokerId)) throw createError({ statusCode: 422, statusMessage: 'Escolha o corretor cadastrado desta pessoa.' })
  return { perfil: 'corretor', brokerId }
}

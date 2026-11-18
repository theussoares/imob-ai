import type { MatrizPermissoes, PermValor } from '~~/layers/gestao/domain/types'
import { DEFINICOES_PERMISSAO, matrizPadrao, permissaoFixa } from '~~/layers/gestao/domain/permissions'
import { configuracoesPadrao, validarConfiguracoes, type ConfiguracoesGestao } from '~~/layers/gestao/domain/configuracoes'

const PERFIS = ['corretor', 'recepcao', 'juridico', 'dono'] as const

const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Matriz gravada → matriz utilizável, célula a célula.
 *
 * O jsonb não tem schema no banco, e a matriz é o que decide o que cada perfil
 * pode: um valor estranho ali não pode virar permissão. Célula ausente ou fora
 * dos estados que a chave admite (`DEFINICOES_PERMISSAO`) cai no padrão; chave
 * desconhecida some. As travas do Dono são forçadas na leitura também — se
 * alguém tirasse `admin` do Dono direto no banco, ninguém mais abriria a tela
 * para devolver.
 *
 * O padrão como base resolve ainda a chave nova que entrar depois: tenant com
 * matriz salva antes dela recebe o padrão daquela chave em vez de `undefined`.
 */
export function matrizDoBanco(salva: unknown): MatrizPermissoes {
  const m = matrizPadrao()
  if (!objeto(salva)) return m
  for (const def of DEFINICOES_PERMISSAO) {
    const linha = salva[def.chave]
    if (!objeto(linha)) continue
    for (const perfil of PERFIS) {
      const v = linha[perfil]
      if (typeof v === 'string' && (def.estados as string[]).includes(v)) m[def.chave][perfil] = v as PermValor
      if (permissaoFixa(def.chave, perfil)) m[def.chave][perfil] = 'sim'
    }
  }
  return m
}

/** Config gravada → config válida; qualquer coisa que não passe em `validarConfiguracoes` volta ao padrão inteiro. */
export function configDoBanco(salva: unknown, nomePadrao?: string): ConfiguracoesGestao {
  const padrao = configuracoesPadrao(nomePadrao)
  if (!objeto(salva) || !objeto(salva.imobiliaria)) return padrao
  const im = salva.imobiliaria
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')
  const r = validarConfiguracoes({
    imobiliaria: { nome: texto(im.nome), cnpj: texto(im.cnpj), email: texto(im.email), telefone: texto(im.telefone) },
    comissaoPct: salva.comissaoPct as number,
    taxaLocacaoPct: salva.taxaLocacaoPct as number,
    multaAtrasoPct: salva.multaAtrasoPct as number | undefined,
    jurosMesPct: salva.jurosMesPct as number | undefined,
  })
  return r.ok ? r.config : padrao
}

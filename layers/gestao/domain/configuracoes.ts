/**
 * Configurações da imobiliária no painel de gestão: dados cadastrais e dois padrões que
 * entram em contratos novos (percentual de comissão da venda e taxa de administração da
 * locação).
 *
 * Padrão, não regra: contrato já aberto guarda o percentual que tinha. Mudar aqui não
 * reescreve ninguém — senão alterar a taxa de hoje refaria o repasse de um aluguel que já
 * foi pago.
 */

import { ENCARGOS_PADRAO, type EncargosConfig } from './cobranca.ts'

export interface ConfiguracoesGestao {
  imobiliaria: { nome: string; cnpj: string; email: string; telefone: string }
  /** % de comissão sobre o valor de uma venda nova, 0..100 */
  comissaoPct: number
  /** % de taxa da imobiliária sobre o aluguel de um contrato novo, 0..100 */
  taxaLocacaoPct: number
  /** Multa por atraso do aluguel, % do valor (única). Ausente = padrão (2%). Padrão a confirmar com o cliente. */
  multaAtrasoPct?: number
  /** Juros por mês de atraso, %, pro rata por dia. Ausente = padrão (1%). */
  jurosMesPct?: number
}

/** Multa e juros em vigor: o configurado ou, se nunca configurado, o padrão. */
export const encargosDaConfig = (c: Pick<ConfiguracoesGestao, 'multaAtrasoPct' | 'jurosMesPct'>): EncargosConfig => ({
  multaPct: c.multaAtrasoPct ?? ENCARGOS_PADRAO.multaPct,
  jurosMesPct: c.jurosMesPct ?? ENCARGOS_PADRAO.jurosMesPct,
})

/**
 * `nome` é o do tenant atual (o servidor e a tela passam). Antes o padrão era uma string fixa de um cliente
 * («OLMI Imóveis»), que aparecia em Configurações de qualquer imobiliária que nunca salvou o formulário.
 */
export function configuracoesPadrao(nome = 'Imobiliária'): ConfiguracoesGestao {
  return {
    imobiliaria: { nome, cnpj: '', email: '', telefone: '' },
    comissaoPct: 5,
    taxaLocacaoPct: 10,
    multaAtrasoPct: ENCARGOS_PADRAO.multaPct,
    jurosMesPct: ENCARGOS_PADRAO.jurosMesPct,
  }
}

const soDigitos = (s: string) => s.replace(/\D/g, '')

/** CNPJ com os dígitos verificadores corretos. Vazio é aceito (campo opcional no demo). */
export function cnpjValido(cnpj: string): boolean {
  const d = soDigitos(cnpj)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = [...base].reduce((t, n, i) => t + Number(n) * pesos[i]!, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(d.slice(0, 12))
  return d1 === Number(d[12]) && dv(d.slice(0, 12) + d1) === Number(d[13])
}

export type ResultadoConfig = { ok: true; config: ConfiguracoesGestao } | { ok: false; erro: string }

const pctValido = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100

export type CampoConfig = 'nome' | 'cnpj' | 'telefone' | 'email' | 'comissaoPct' | 'taxaLocacaoPct' | 'multaAtrasoPct' | 'jurosMesPct'

/** Todos os erros por campo, na ordem da tela (a primeira chave recebe o foco). */
export function errosConfiguracoes(c: ConfiguracoesGestao): Partial<Record<CampoConfig, string>> {
  const e: Partial<Record<CampoConfig, string>> = {}
  const im = c.imobiliaria
  if (!im.nome.trim()) e.nome = 'Informe o nome da imobiliária.'
  if (im.cnpj.trim() && !cnpjValido(im.cnpj)) e.cnpj = 'O CNPJ não é válido.'
  if (im.telefone.trim() && ![10, 11].includes(soDigitos(im.telefone).length)) e.telefone = 'O telefone precisa de DDD e 8 ou 9 dígitos.'
  if (im.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(im.email.trim())) e.email = 'O e-mail não é válido.'
  if (!pctValido(c.comissaoPct)) e.comissaoPct = 'A comissão padrão deve ficar entre 0 e 100%.'
  if (!pctValido(c.taxaLocacaoPct)) e.taxaLocacaoPct = 'A taxa da locação deve ficar entre 0 e 100%.'
  // Ausente (config salva antes de existirem) vale o padrão; presente tem de ser 0..100.
  if (!pctValido(c.multaAtrasoPct ?? ENCARGOS_PADRAO.multaPct)) e.multaAtrasoPct = 'A multa por atraso deve ficar entre 0 e 100%.'
  if (!pctValido(c.jurosMesPct ?? ENCARGOS_PADRAO.jurosMesPct)) e.jurosMesPct = 'Os juros ao mês devem ficar entre 0 e 100%.'
  return e
}

/** Valida e normaliza (aparar espaços). O primeiro erro volta numa frase pronta para a tela. */
export function validarConfiguracoes(c: ConfiguracoesGestao): ResultadoConfig {
  const primeiro = Object.values(errosConfiguracoes(c))[0]
  if (primeiro) return { ok: false, erro: primeiro }
  const im = {
    nome: c.imobiliaria.nome.trim(),
    cnpj: c.imobiliaria.cnpj.trim(),
    email: c.imobiliaria.email.trim(),
    telefone: c.imobiliaria.telefone.trim(),
  }
  return {
    ok: true,
    config: {
      imobiliaria: im,
      comissaoPct: c.comissaoPct,
      taxaLocacaoPct: c.taxaLocacaoPct,
      multaAtrasoPct: c.multaAtrasoPct ?? ENCARGOS_PADRAO.multaPct,
      jurosMesPct: c.jurosMesPct ?? ENCARGOS_PADRAO.jurosMesPct,
    },
  }
}

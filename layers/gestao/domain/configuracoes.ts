/**
 * Configurações da imobiliária no painel de gestão: dados cadastrais e dois padrões que
 * entram em contratos novos (percentual de comissão da venda e taxa de administração da
 * locação).
 *
 * Padrão, não regra: contrato já aberto guarda o percentual que tinha. Mudar aqui não
 * reescreve ninguém — senão alterar a taxa de hoje refaria o repasse de um aluguel que já
 * foi pago.
 */

export interface ConfiguracoesGestao {
  imobiliaria: { nome: string; cnpj: string; email: string; telefone: string }
  /** % de comissão sobre o valor de uma venda nova, 0..100 */
  comissaoPct: number
  /** % de taxa da imobiliária sobre o aluguel de um contrato novo, 0..100 */
  taxaLocacaoPct: number
}

export function configuracoesPadrao(): ConfiguracoesGestao {
  return {
    imobiliaria: { nome: 'OLMI Imóveis', cnpj: '', email: '', telefone: '' },
    comissaoPct: 5,
    taxaLocacaoPct: 10,
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

/** Valida e normaliza (aparar espaços). O primeiro erro volta numa frase pronta para a tela. */
export function validarConfiguracoes(c: ConfiguracoesGestao): ResultadoConfig {
  const im = {
    nome: c.imobiliaria.nome.trim(),
    cnpj: c.imobiliaria.cnpj.trim(),
    email: c.imobiliaria.email.trim(),
    telefone: c.imobiliaria.telefone.trim(),
  }
  if (!im.nome) return { ok: false, erro: 'Informe o nome da imobiliária.' }
  if (im.cnpj && !cnpjValido(im.cnpj)) return { ok: false, erro: 'O CNPJ não é válido.' }
  if (im.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(im.email)) return { ok: false, erro: 'O e-mail não é válido.' }
  if (im.telefone && ![10, 11].includes(soDigitos(im.telefone).length)) {
    return { ok: false, erro: 'O telefone precisa de DDD e 8 ou 9 dígitos.' }
  }
  if (!pctValido(c.comissaoPct)) return { ok: false, erro: 'A comissão padrão deve ficar entre 0 e 100%.' }
  if (!pctValido(c.taxaLocacaoPct)) return { ok: false, erro: 'A taxa da locação deve ficar entre 0 e 100%.' }
  return { ok: true, config: { imobiliaria: im, comissaoPct: c.comissaoPct, taxaLocacaoPct: c.taxaLocacaoPct } }
}

import { onlyDigits } from '~~/shared/utils/phone'

/**
 * CPF e CNPJ por dígito verificador.
 *
 * O boleto exige o documento do pagador, e o provedor recusa o que não fecha
 * o dígito. Conferir aqui transforma "o boleto não saiu" (descoberto no dia
 * da cobrança) em "CPF inválido" no cadastro, com o cliente ainda na frente.
 *
 * Sequências repetidas (111.111.111-11) fecham o dígito e mesmo assim não
 * existem: recusadas à parte.
 */
export function tipoDeDocumento(valor: string | null | undefined): 'cpf' | 'cnpj' | null {
  const d = onlyDigits(valor ?? '')
  if (d.length === 11 && cpfValido(d)) return 'cpf'
  if (d.length === 14 && cnpjValido(d)) return 'cnpj'
  return null
}

function cpfValido(d: string): boolean {
  if (/^(\d)\1{10}$/.test(d)) return false
  const dv = (base: string, pesoInicial: number) => {
    let soma = 0
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10])
}

function cnpjValido(d: string): boolean {
  if (/^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = [...base].reduce((acc, c, i) => acc + Number(c) * pesos[i]!, 0)
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(d.slice(0, 12)) === Number(d[12]) && dv(d.slice(0, 13)) === Number(d[13])
}

/** 123.456.789-09 / 12.345.678/0001-95; devolve o que veio quando não é documento válido. */
export function formatarDocumento(valor: string | null | undefined): string {
  const d = onlyDigits(valor ?? '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return valor ?? ''
}

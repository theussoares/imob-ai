import { onlyDigits } from '~~/shared/utils/phone'
import { tipoDeDocumento } from '~~/shared/utils/cpf-cnpj'
import { ehUuid } from '~~/shared/utils/uuid'

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

/**
 * A chave Pix tem o formato que o tipo dela promete?
 *
 * Antes só se conferia "não vazia": "123" foi salvo como chave CPF e o contrato
 * apareceu como "pronto para cobrança e repasse". O erro só apareceria no dia
 * do primeiro repasse, com o dinheiro do proprietário parado.
 *
 * Os formatos são os do DICT (BACEN): CPF/CNPJ com dígito verificador, e-mail,
 * telefone com DDI (+55 e DDD: 12 ou 13 dígitos; aceitamos também sem o 55,
 * que é como as pessoas digitam) e chave aleatória, que é um uuid.
 */
export function chavePixValida(tipo: TipoChavePix, chave: string | null | undefined): boolean {
  const v = (chave ?? '').trim()
  if (!v) return false
  switch (tipo) {
    case 'cpf':
      return tipoDeDocumento(v) === 'cpf'
    case 'cnpj':
      return tipoDeDocumento(v) === 'cnpj'
    case 'email':
      return v.length <= 77 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)
    case 'telefone': {
      if (/[a-z]/i.test(v)) return false
      const d = onlyDigits(v)
      const semDdi = d.length >= 12 && d.startsWith('55') ? d.slice(2) : d
      return /^[1-9]{2}9?\d{8}$/.test(semDdi)
    }
    case 'aleatoria':
      return ehUuid(v)
  }
  return false
}

export const EXEMPLO_CHAVE_PIX: Record<TipoChavePix, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  email: 'nome@exemplo.com',
  telefone: '+55 (67) 99123-4567',
  aleatoria: '123e4567-e89b-12d3-a456-426614174000',
}

/** Para a mensagem de erro: "não é um CPF válido". */
export const ROTULO_CHAVE_PIX: Record<TipoChavePix, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'e-mail',
  telefone: 'telefone com DDD',
  aleatoria: 'chave aleatória (formato 123e4567-e89b-…)',
}

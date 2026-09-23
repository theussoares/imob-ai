import { describe, expect, test } from 'vitest'
import { canonicalNeighborhood } from '~~/shared/utils/neighborhood'

/**
 * As seis grafias reais de "Bela Vista da Lagoa" numa única imobiliária, como
 * estavam no banco em 22/09. Não é exemplo inventado — é o que o cadastro
 * manual produz quando nada o alinha.
 */
const BELA_VISTA_REAL = [
  'Bela Vista da Lagoa',
  'Bela vista da Lagoa',
  'Bela Vista da lagoa ',
  'Bela Vista da Lagoa ',
  'Bela vista da Lagoa ',
  'Bela vista da lagoa ',
]

describe('o bairro novo se alinha ao que já existe', () => {
  test('qualquer variação de caixa e espaço vira a grafia cadastrada', () => {
    const existentes = ['Bela Vista da Lagoa']
    for (const variacao of BELA_VISTA_REAL) {
      expect(canonicalNeighborhood(variacao, existentes), variacao).toBe('Bela Vista da Lagoa')
    }
  })

  // O caso que fragmenta de verdade: as seis, uma a uma, convergindo para a
  // primeira. É o que faz o acervo se limpar sozinho conforme os imóveis são
  // editados, sem ninguém corrigir nada à mão.
  test('as seis grafias reais convergem para uma só', () => {
    const canonizadas = BELA_VISTA_REAL.map((v) =>
      canonicalNeighborhood(v, [BELA_VISTA_REAL[0]!]),
    )
    expect(new Set(canonizadas).size).toBe(1)
  })

  test('a grafia cadastrada também é limpa antes de voltar', () => {
    expect(canonicalNeighborhood('mais parque', ['Mais Parque  '])).toBe('Mais Parque')
  })
})

describe('bairro que não existe ainda', () => {
  test('entra limpo, do jeito que foi digitado', () => {
    expect(canonicalNeighborhood('  Vila  piloto ', [])).toBe('Vila piloto')
  })

  test('vazio vira null, não string vazia', () => {
    // `neighborhood` é `""` em produção, não null — e foi isso que já fez o
    // card renderizar o alfinete sozinho, sem texto (ver PropertyCard.vue).
    expect(canonicalNeighborhood('', ['Centro'])).toBeNull()
    expect(canonicalNeighborhood('   ', ['Centro'])).toBeNull()
    expect(canonicalNeighborhood(null, ['Centro'])).toBeNull()
    expect(canonicalNeighborhood(undefined, ['Centro'])).toBeNull()
  })
})

describe('o que NÃO se junta, de propósito', () => {
  /**
   * "Jardim dos Ipês 2" é um bairro que existe de verdade, separado do "Jardim
   * dos Ipês". Juntar os dois por parecença apagaria uma distinção real do
   * município — pior que a fragmentação que esta função veio resolver.
   *
   * Quem evita o caso é a lista de sugestões do formulário, que mostra o que já
   * existe antes de a pessoa digitar.
   */
  test('bairro numerado continua distinto', () => {
    expect(canonicalNeighborhood('Jardim dos Ipês 2', ['Jardim dos Ipês'])).toBe('Jardim dos Ipês 2')
  })

  test('erro de digitação que muda a leitura também continua distinto', () => {
    // "Ipes3" (sem espaço) está no banco hoje. O servidor não tem como saber
    // que quis dizer "Ipês" — e chutar juntaria bairros errados.
    expect(canonicalNeighborhood('Jardim dos Ipes3', ['Jardim dos Ipês'])).toBe('Jardim dos Ipes3')
  })

  test('acento não separa: é a mesma leitura', () => {
    expect(canonicalNeighborhood('Jardim dos Ipes', ['Jardim dos Ipês'])).toBe('Jardim dos Ipês')
  })
})

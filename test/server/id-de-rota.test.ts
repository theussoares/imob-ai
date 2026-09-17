import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { idDeRota } from '~~/server/utils/validate'

/**
 * Nenhum id de rota chega ao banco sem ter forma de uuid.
 *
 * O bug: `if (!id) throw 400` pega o id AUSENTE e deixa passar o MALFORMADO.
 * Como todo id do sistema é `uuid` no banco, `/api/admin/contracts/abc` chegava
 * em `.eq('id','abc')`, o Postgres devolvia 22P02, o repositório dava
 * `throw error` e a resposta era **500**.
 *
 * ⚠️ A revisão do PR #26 achou isto duas vezes: a primeira no download, e a
 * segunda porque a correção ficou só lá — os outros dezoito endpoints seguiram
 * como estavam. É o motivo de existir uma varredura aqui e não só um teste do
 * caso que já foi corrigido: a regra tem que valer para o endpoint que ainda
 * não foi escrito.
 */

const API = join(process.cwd(), 'server', 'api')

function arquivosTs(dir: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivosTs(caminho))
    else if (nome.endsWith('.ts')) saida.push(caminho)
  }
  return saida
}

/**
 * `[code]` é o código do imóvel, escolhido pela imobiliária — texto, não uuid.
 * É o único parâmetro de rota que não é id de tabela.
 */
const NAO_E_ID = /getRouterParam\(event, 'code'\)/

describe('idDeRota', () => {
  test('devolve o uuid limpo', () => {
    expect(idDeRota('  0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6 ')).toBe(
      '0f5f4d2e-1c3a-4b5d-8e9f-a1b2c3d4e5f6',
    )
  })

  test('recusa ausente e malformado com 400', () => {
    for (const ruim of [undefined, null, '', 'abc', '../x']) {
      expect(() => idDeRota(ruim), String(ruim)).toThrow(
        expect.objectContaining({ statusCode: 400 }),
      )
    }
  })

  test('o rótulo entra na mensagem, para rota com dois ids', () => {
    const erro = (() => {
      try {
        idDeRota('abc', 'ID da parte')
      } catch (e) {
        return e as { statusMessage?: string }
      }
    })()
    expect(erro?.statusMessage).toBe('ID da parte inválido.')
  })
})

describe('varredura: todo endpoint com id de rota confere a forma', () => {
  const COM_PARAM = arquivosTs(API).filter((f) => {
    const fonte = readFileSync(f, 'utf8')
    return fonte.includes('getRouterParam(') && !NAO_E_ID.test(fonte)
  })

  test('a varredura está achando os endpoints', () => {
    // Se a pasta mudar de lugar, este arquivo passaria vazio e mudo.
    expect(COM_PARAM.length).toBeGreaterThan(15)
  })

  for (const caminho of COM_PARAM) {
    const rel = caminho.slice(caminho.indexOf('server/api'))
    test(rel, () => {
      const fonte = readFileSync(caminho, 'utf8')
      const confere = fonte.includes('idDeRota(') || fonte.includes('ehUuid(')
      expect(confere, `${rel}: id de rota vai ao banco sem conferir a forma`).toBe(true)
    })
  }

  test('o portal responde 404, o painel 400', () => {
    // A diferença é deliberada: no painel quem chama é membro autenticado e
    // "isso não é um id" ajuda; no portal nada pode distinguir um id de outro,
    // então id inválido responde igual a id que não existe.
    for (const caminho of COM_PARAM) {
      const fonte = readFileSync(caminho, 'utf8')
      const rel = caminho.slice(caminho.indexOf('server/api'))
      if (!rel.includes('server/api/portal/')) continue
      expect(fonte.includes('ehUuid('), `${rel} deveria usar ehUuid + 404`).toBe(true)
      expect(fonte.includes('idDeRota('), `${rel} não pode responder 400`).toBe(false)
    }
  })
})

import { describe, expect, test } from 'vitest'
import {
  INTERVALO_MINIMO_MS,
  criarVerificadorDeAtualizacao,
} from '~~/app/utils/pwa-update-check'

// A ameaça: o app instalado fica em memória no celular e só conferia versão
// nova ao abrir do zero — quem voltava a ele dias depois seguia na versão
// velha, sem aviso. Os gatilhos novos disparam demais (trocar de app várias
// vezes num minuto), e cada disparo é um GET do sw.js.

function montar(opts: { online?: boolean; falha?: boolean } = {}) {
  let t = 1_000_000
  let chamadas = 0
  const verificar = criarVerificadorDeAtualizacao({
    atualizar: async () => {
      chamadas++
      if (opts.falha) throw new Error('rede')
    },
    online: () => opts.online ?? true,
    agora: () => t,
  })
  return {
    verificar,
    avancar: (ms: number) => (t += ms),
    chamadas: () => chamadas,
  }
}

describe('criarVerificadorDeAtualizacao', () => {
  test('não repete a pergunta que o registro acabou de fazer', async () => {
    const v = montar()
    expect(await v.verificar()).toBe(false)
    expect(v.chamadas()).toBe(0)
  })

  test('voltar ao app depois do intervalo pergunta de novo', async () => {
    const v = montar()
    v.avancar(INTERVALO_MINIMO_MS)
    expect(await v.verificar()).toBe(true)
    expect(v.chamadas()).toBe(1)
  })

  test('trocar de app várias vezes num minuto gera uma pergunta só', async () => {
    const v = montar()
    v.avancar(INTERVALO_MINIMO_MS)
    await v.verificar()
    for (let i = 0; i < 5; i++) {
      v.avancar(5_000)
      await v.verificar()
    }
    expect(v.chamadas()).toBe(1)
  })

  test('duas chamadas simultâneas não disparam duas perguntas', async () => {
    const v = montar()
    v.avancar(INTERVALO_MINIMO_MS)
    await Promise.all([v.verificar(), v.verificar()])
    expect(v.chamadas()).toBe(1)
  })

  test('sem rede não pergunta', async () => {
    const v = montar({ online: false })
    v.avancar(INTERVALO_MINIMO_MS)
    expect(await v.verificar()).toBe(false)
    expect(v.chamadas()).toBe(0)
  })

  test('falha de rede é engolida, e a próxima volta tenta de novo', async () => {
    const v = montar({ falha: true })
    v.avancar(INTERVALO_MINIMO_MS)
    await expect(v.verificar()).resolves.toBe(false)
    v.avancar(INTERVALO_MINIMO_MS)
    await v.verificar()
    expect(v.chamadas()).toBe(2)
  })
})

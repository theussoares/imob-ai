import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import {
  FORMATOS_DE_GRAVACAO,
  WHATSAPP_ENVIO,
  WHATSAPP_MIDIA_MIMES,
  caminhoDaMidia,
  formatoDeGravacao,
  mimeDoCaminho,
} from '~~/shared/models/whatsapp'

/**
 * Gravação de áudio pelo microfone.
 *
 * O risco é gravar num formato que a Meta recusa — o áudio subiria, sairia
 * "enviado" e chegaria como falha minutos depois. WebM (o padrão do Chrome) e
 * opus dentro de mp4 são os dois casos que parecem funcionar e não funcionam.
 */

describe('formato por navegador', () => {
  const navegador = (suportados: string[]) => (m: string) => suportados.includes(m)

  test('Firefox: ogg/opus, o formato de nota de voz do WhatsApp', () => {
    expect(formatoDeGravacao(navegador(['audio/ogg;codecs=opus', 'audio/webm;codecs=opus']))?.ext).toBe('ogg')
  })

  test('Safari e Chrome 126+: mp4 com AAC explícito', () => {
    expect(formatoDeGravacao(navegador(['audio/mp4;codecs=mp4a.40.2', 'audio/webm']))?.mime).toBe('audio/mp4')
  })

  test('só WebM, ou mp4 sem garantir AAC: sem gravação — melhor que um áudio que não chega', () => {
    expect(formatoDeGravacao(navegador(['audio/webm;codecs=opus', 'audio/webm']))).toBeNull()
    expect(formatoDeGravacao(navegador(['audio/mp4']))).toBeNull()
  })

  test('todo formato de gravação é aceito no envio, no bucket, e volta pelo caminho', () => {
    for (const f of FORMATOS_DE_GRAVACAO) {
      expect(WHATSAPP_ENVIO[f.mime]?.tipo).toBe('audio')
      expect(WHATSAPP_MIDIA_MIMES).toContain(f.mime)
      expect(mimeDoCaminho(caminhoDaMidia('t', 'c', 'out-x', f.mime))).toBe(f.mime)
    }
  })
})

describe('microfone só no painel', () => {
  const config = readFileSync(join(process.cwd(), 'nuxt.config.ts'), 'utf8')

  test('o painel libera o microfone para a própria origem; o site continua sem', () => {
    const painel = config.slice(config.indexOf('const CABECALHOS_DO_PAINEL'))
    expect(painel).toMatch(/'Permissions-Policy': 'geolocation=\(\), microphone=\(self\), camera=\(\)'/)
    const seguranca = config.slice(config.indexOf('const CABECALHOS_DE_SEGURANCA'), config.indexOf('const CABECALHOS_DO_PAINEL'))
    expect(seguranca).toMatch(/microphone=\(\)/)
  })

  test('o microfone é solto ao terminar ou cancelar', () => {
    const src = readFileSync(join(process.cwd(), 'app/composables/useGravadorDeAudio.ts'), 'utf8')
    expect(src).toContain('getTracks().forEach((t) => t.stop())')
    expect(src).toContain('onBeforeUnmount(cancelar)')
  })
})

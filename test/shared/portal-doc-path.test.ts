import { describe, expect, test } from 'vitest'
import {
  extensionOf,
  isAllowedDocExtension,
  isPortalDocPathFor,
  portalDocPath,
} from '~~/shared/utils/portal-doc-path'

/**
 * O caminho do arquivo no bucket privado.
 *
 * `isPortalDocPathFor` é a guarda que as policies de storage NÃO conseguem
 * fazer. Elas impedem que um membro suba arquivo na pasta de outra imobiliária;
 * elas não dizem nada sobre a coluna `storage_path`, que é texto livre. Uma
 * linha apontando para o arquivo de outro tenant é, para o banco, uma linha
 * válida — e `portal_can_read_doc_path` passaria a casar com aquele objeto.
 */

const SLUG = 'olmi'
const CONTRATO = 'c1'

describe('montagem do path', () => {
  test('segue o formato que as policies esperam: slug na primeira pasta', () => {
    // As policies da 0028 leem `(storage.foldername(name))[1]`. Mudar a posição
    // do slug desliga as quatro de uma vez.
    expect(portalDocPath(SLUG, CONTRATO, 'abc-123', 'PDF')).toBe('olmi/c1/abc-123.pdf')
  })
})

describe('extensão', () => {
  test.each([
    ['contrato.pdf', 'pdf'],
    ['VISTORIA.PDF', 'pdf'],
    ['foto.jpeg', 'jpeg'],
    ['sem-extensao', ''],
  ])('%s → %s', (nome, esperado) => {
    expect(extensionOf(nome)).toBe(esperado)
  })

  test.each(['pdf', 'jpg', 'png', 'webp', 'heic'])('%s é aceito', (ext) => {
    expect(isAllowedDocExtension(ext)).toBe(true)
  })

  test.each(['exe', 'html', 'svg', 'js', ''])('%s é recusado', (ext) => {
    // SVG entra na lista dos recusados de propósito: é XML com script, e o
    // bucket é servido para o navegador do cliente.
    expect(isAllowedDocExtension(ext)).toBe(false)
  })
})

describe('a guarda entre imobiliárias', () => {
  test('path do próprio contrato passa', () => {
    expect(isPortalDocPathFor('olmi/c1/abc-123.pdf', SLUG, CONTRATO)).toBe(true)
  })

  test('path de OUTRA imobiliária é recusado', () => {
    // O caso que importa: membro da olmi cadastrando documento que aponta para
    // o arquivo da tatiane, publicando para si mesmo e baixando pelo portal.
    expect(isPortalDocPathFor('tatiane/c1/abc-123.pdf', SLUG, CONTRATO)).toBe(false)
  })

  test('path de outro CONTRATO da mesma imobiliária é recusado', () => {
    // Mesmo dentro de uma imobiliária o vínculo é por contrato: quem é parte do
    // contrato A não é, por isso, parte do contrato B.
    expect(isPortalDocPathFor('olmi/c2/abc-123.pdf', SLUG, CONTRATO)).toBe(false)
  })

  test.each([
    ['olmi/c1/../../outro/arquivo.pdf', 'travessia de diretório'],
    ['olmi/c1/sub/arquivo.pdf', 'pasta a mais'],
    ['olmi/arquivo.pdf', 'pasta a menos'],
    ['/olmi/c1/arquivo.pdf', 'barra à esquerda'],
    ['olmi/c1/arquivo.exe', 'extensão não permitida'],
    ['olmi/c1/arquivo', 'sem extensão'],
    ['olmi/c1/.pdf', 'só extensão'],
    ['olmi/c1/nome com espaço.pdf', 'espaço no nome'],
    ['', 'vazio'],
  ])('%s é recusado (%s)', (path) => {
    expect(isPortalDocPathFor(path, SLUG, CONTRATO)).toBe(false)
  })

  test('slug ou contrato vazio não libera nada', () => {
    expect(isPortalDocPathFor('olmi/c1/abc.pdf', '', CONTRATO)).toBe(false)
    expect(isPortalDocPathFor('olmi/c1/abc.pdf', SLUG, '')).toBe(false)
  })
})

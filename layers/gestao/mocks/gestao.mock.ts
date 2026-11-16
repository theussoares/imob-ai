import { defineMock } from 'mocker-nuxt/utils'
import { CORRETORES, documentosSeedCompleto, processosSeed, USUARIOS } from '../domain/seed.ts'
import { matrizPadrao } from '../domain/permissions.ts'

/**
 * Seeds do demo. Só GET: o `mocker-nuxt` 1.0.6 não guarda estado, então as
 * mutações (abrir processo, apagar documento…) ficam no store do cliente
 * (`useGestaoStore`), que parte destes dados. Ver spec, tabela de decisões.
 */
const get = (name: string, route: string, body: unknown) =>
  defineMock({ name, route, method: 'GET', strategy: 'static', response: { status: 200, body } })

export default [
  get('gestao.processos', '/api/gestao/processos', { data: processosSeed() }),
  get('gestao.documentos', '/api/gestao/documentos', { data: documentosSeedCompleto() }),
  get('gestao.corretores', '/api/gestao/corretores', { data: CORRETORES }),
  get('gestao.usuarios', '/api/gestao/usuarios', { data: USUARIOS }),
  get('gestao.permissoes', '/api/gestao/permissoes', { data: matrizPadrao() }),
]

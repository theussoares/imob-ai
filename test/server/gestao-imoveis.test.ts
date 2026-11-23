import { describe, expect, test } from 'vitest'
import { matrizPadrao } from '~~/layers/gestao/domain/permissions'
import type { Locacao, Perfil } from '~~/layers/gestao/domain/types'
import {
  adicionarFotosImovel,
  atualizarImovel,
  criarImovel,
  definirCapaImovel,
  definirDestaqueImovel,
  excluirImovel,
  listarImoveis,
  moverFotoImovel,
  mudarStatus,
  obterImovel,
  proximoCodigo,
  removerFotoImovel,
  type ContextoImoveis,
} from '~~/server/utils/gestao-imoveis'
import { fakeSupabase, hadEq, touched } from '../helpers/fake-supabase'

/**
 * Cadastro de imóveis do gestão (F5). O que este arquivo existe para impedir:
 *
 * - corretor A ler ou mexer no imóvel do corretor B pelo id (tem de ser 404, não 403:
 *   403 confirmaria que o id existe);
 * - o corpo da requisição decidir tenant ou corretor vendedor de quem não pode;
 * - qualquer query de imóvel/foto sem `tenant_id` — a service_role ignora RLS, então
 *   o filtro é a única barreira entre as imobiliárias.
 */

const TENANT = 't1'
const IMOVEL_A = '11111111-1111-4111-8111-111111111111' // vendedor: corretor b1
const IMOVEL_B = '22222222-2222-4222-8222-222222222222' // vendedor: corretor b2
const FOTO_1 = '33333333-3333-4333-8333-333333333331'
const FOTO_2 = '33333333-3333-4333-8333-333333333332'

const imagem = (id: string, position: number, isCover: boolean) => ({ id, url: `https://x/${id}.webp`, url_sm: null, alt: null, position, is_cover: isCover })

function row(over: Record<string, unknown> = {}) {
  return {
    id: IMOVEL_A,
    tenant_id: TENANT,
    code: 'IM-0001',
    title: 'Casa no Centro',
    type: 'casa',
    purpose: 'venda',
    price: 350000,
    neighborhood: 'Centro',
    city: 'Três Lagoas',
    state: 'MS',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking: 2,
    area: 180,
    high_standard: false,
    description: null,
    features: [],
    status: 'active',
    featured: false,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    location: null,
    address_zip: null,
    address_street: null,
    address_number: null,
    broker_id: 'b1',
    owner_name: 'Helena',
    owner_phone: null,
    updated_by: 'u-secreto',
    property_images: [],
    ...over,
  }
}

const corretorB = { id: 'b1', tenant_id: TENANT, name: 'Carlos', active: true, phone: '67999990000', email: 'c@x.com' }

type Res = Parameters<typeof fakeSupabase>[0]

function montar(perfil: Perfil, results: Res, over: Partial<ContextoImoveis> = {}, locacoes: Locacao[] = []) {
  const { client, calls } = fakeSupabase(results)
  const eventos: string[] = []
  const estado = { cache: 0, subidas: 0 }
  const ctx: ContextoImoveis = {
    membro: { userId: 'u1', nome: 'Fulano', perfil, brokerId: perfil === 'corretor' ? 'b1' : null },
    tenant: { id: TENANT, slug: 'acme' },
    matriz: matrizPadrao(),
    db: client,
    registrar: async (acao, alvoId) => void eventos.push(`${acao}:${alvoId}`),
    invalidarCache: async () => void (estado.cache += 1),
    armazenarFoto: async () => ({ url: `https://cdn/acme/${++estado.subidas}.webp`, urlSm: `https://cdn/acme/${estado.subidas}@sm.webp` }),
    locacoesDoImovel: async () => locacoes,
    ...over,
  }
  return { ctx, calls, eventos, estado }
}

const status = async (p: Promise<unknown>) => p.then(() => 200, (e: { statusCode?: number }) => e.statusCode)

const corpo = (over: Record<string, unknown> = {}) => ({
  title: 'Sobrado Novo', type: 'casa', purpose: 'venda', price: 400000, neighborhood: 'Centro', city: 'Três Lagoas', state: 'MS',
  bedrooms: 3, suites: 1, bathrooms: 2, parking: 1, area: 150, ownerName: 'Maria', ownerPhone: '', brokerId: 'b1', ...over,
})

describe('listar', () => {
  test('corretor vê todos os imóveis do tenant: sem filtro de corretor, com tenant e limite de 200', async () => {
    const { ctx, calls } = montar('corretor', { properties: { data: [row(), row({ id: IMOVEL_B, broker_id: 'b2' })], error: null }, brokers: { data: [corretorB], error: null } })
    expect((await listarImoveis(ctx)).map((i) => i.id)).toEqual([IMOVEL_A, IMOVEL_B])
    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'broker_id')).toBe(false)
    expect(calls.find((c) => c.method === 'limit')?.args[0]).toBe(200)
  })

  test('o que o corretor não captou sai sem a referência interna; o dele sai inteiro', async () => {
    const { ctx } = montar('corretor', { properties: { data: [row({ location: 'Bloco 2' }), row({ id: IMOVEL_B, broker_id: 'b2', location: 'Bloco 9' })], error: null }, brokers: { data: [corretorB], error: null } })
    const r = await listarImoveis(ctx)
    expect(r.find((i) => i.id === IMOVEL_A)?.location).toBe('Bloco 2')
    expect(r.find((i) => i.id === IMOVEL_B)).toMatchObject({ location: null, ownerName: 'Helena' })
  })

  test('corretor sem vínculo com cadastro de corretor também vê a lista (só não cria nem edita)', async () => {
    const { ctx } = montar('corretor', { properties: { data: [row()], error: null }, brokers: { data: [corretorB], error: null } }, { membro: { userId: 'u1', nome: 'F', perfil: 'corretor', brokerId: null } })
    expect(await listarImoveis(ctx)).toHaveLength(1)
  })

  test('dono vê todos: sem filtro de corretor', async () => {
    const { ctx, calls } = montar('dono', { properties: { data: [row(), row({ id: IMOVEL_B, broker_id: 'b2' })], error: null } })
    expect(await listarImoveis(ctx)).toHaveLength(2)
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'broker_id')).toBe(false)
  })

  test('o payload não carrega coluna interna do banco (updated_by, broker, tenantId)', async () => {
    const { ctx } = montar('dono', { properties: { data: [row()], error: null }, brokers: { data: [corretorB], error: null } })
    const [i] = await listarImoveis(ctx)
    const json = JSON.stringify(i)
    expect(json).not.toContain('u-secreto')
    expect(json).not.toContain('67999990000')
    for (const k of ['updatedBy', 'broker', 'tenantId']) expect(i).not.toHaveProperty(k)
  })
})

describe('Review Focus 1 — corretor A lê o imóvel do corretor B, mas não escreve nele', () => {
  const outro = () => ({ properties: { data: row({ id: IMOVEL_B, broker_id: 'b2' }), error: null } })

  test('GET → abre, sem a referência interna', async () => {
    const i = await obterImovel(montar('corretor', outro()).ctx, IMOVEL_B)
    expect(i).toMatchObject({ id: IMOVEL_B, brokerId: 'b2', location: null })
  })
  test('PUT → 403 e nada é gravado', async () => {
    const { ctx, calls } = montar('corretor', outro())
    expect(await status(atualizarImovel(ctx, IMOVEL_B, corpo()))).toBe(403)
    expect(calls.some((c) => c.method === 'update')).toBe(false)
  })
  test('DELETE → 403 e nada é apagado', async () => {
    const { ctx, calls } = montar('corretor', outro())
    expect(await status(excluirImovel(ctx, IMOVEL_B))).toBe(403)
    expect(calls.some((c) => c.method === 'delete')).toBe(false)
  })
  test('status → 403', async () => expect(await status(mudarStatus(montar('corretor', outro()).ctx, IMOVEL_B, 'draft'))).toBe(403))
  test('destaque → 403', async () => expect(await status(definirDestaqueImovel(montar('corretor', outro()).ctx, IMOVEL_B, true))).toBe(403))
  test('foto (adicionar, capa, mover, remover) → 403 e nenhuma foto é tocada', async () => {
    const png = `data:image/webp;base64,${Buffer.from('RIFF\0\0\0\0WEBPxxxx', 'latin1').toString('base64')}`
    const casos = [
      (c: ContextoImoveis) => adicionarFotosImovel(c, IMOVEL_B, { fotos: [{ url: png, urlSm: null, alt: null }] }),
      (c: ContextoImoveis) => definirCapaImovel(c, IMOVEL_B, FOTO_1),
      (c: ContextoImoveis) => moverFotoImovel(c, IMOVEL_B, FOTO_1, 'cima'),
      (c: ContextoImoveis) => removerFotoImovel(c, IMOVEL_B, FOTO_1),
    ]
    for (const caso of casos) {
      const { ctx, calls, estado } = montar('corretor', outro())
      expect(await status(caso(ctx))).toBe(403)
      expect(touched(calls, 'property_images')).toBe(false)
      expect(estado.subidas).toBe(0)
    }
  })
  test('o mesmo imóvel, para quem vê todos (recepção), abre normalmente', async () => {
    const { ctx } = montar('recepcao', outro())
    expect((await obterImovel(ctx, IMOVEL_B)).brokerId).toBe('b2')
  })
  test('imóvel que não existe no tenant → 404, com o tenant na query', async () => {
    const { ctx, calls } = montar('dono', { properties: { data: null, error: null } })
    expect(await status(obterImovel(ctx, IMOVEL_A))).toBe(404)
    expect(calls.find((c) => c.method === 'eq' && c.args[0] === 'tenant_id')?.args[1]).toBe(TENANT)
  })
})

describe('corretor com vínculo vazio', () => {
  test("brokerId '' não casa com imóvel antigo sem corretor: lê, mas não edita (403)", async () => {
    const { ctx } = montar('corretor', { properties: { data: row({ broker_id: null }), error: null } }, { membro: { userId: 'u1', nome: 'F', perfil: 'corretor', brokerId: '' } })
    expect((await obterImovel(ctx, IMOVEL_A)).id).toBe(IMOVEL_A)
    expect(await status(atualizarImovel(ctx, IMOVEL_A, corpo()))).toBe(403)
  })
})

describe('criar', () => {
  const fila = (): Res => ({
    // 1ª leitura: getBroker (objeto); 2ª: embed de corretores da releitura do imóvel (lista)
    brokers: [{ data: { ...corretorB }, error: null }, { data: [corretorB], error: null }],
    properties: [
      { data: [{ id: 'x', code: 'NC-0231', title: 'Outro', location: null }], error: null }, // identidades
      { data: row(), error: null }, // insert
      { data: row(), error: null }, // releitura
    ],
  })
  const inserido = (calls: ReturnType<typeof montar>['calls']) => calls.find((c) => c.table === 'properties' && c.method === 'insert')?.args[0] as Record<string, unknown>

  test('corretor: vendedor é ELE, mesmo que o corpo peça outro; tenant do contexto, mesmo que o corpo mande outro', async () => {
    const { ctx, calls, eventos, estado } = montar('corretor', fila())
    await criarImovel(ctx, corpo({ brokerId: 'b2', tenantId: 'tenant-de-outro', tenant_id: 'tenant-de-outro', code: 'HACK-1' }))
    const ins = inserido(calls)
    expect(ins.broker_id).toBe('b1')
    expect(ins.tenant_id).toBe(TENANT)
    expect(ins.code).toBe('IM-0232') // gerado: maior sufixo (231) + 1; o `code` do corpo é ignorado
    expect(ins.updated_by).toBe('u1')
    expect(eventos).toEqual([`imovel.criar:${IMOVEL_A}`])
    expect(estado.cache).toBe(1)
  })

  test('dono escolhe o corretor, que precisa ser do tenant (consulta brokers com tenant_id)', async () => {
    const { ctx, calls } = montar('dono', fila())
    await criarImovel(ctx, corpo({ brokerId: 'b1' }))
    expect(calls.filter((c) => c.table === 'brokers').some((c) => c.method === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT)).toBe(true)
    expect(inserido(calls).broker_id).toBe('b1')
  })

  test('corretor de outro tenant (não achado no tenant) → 422, nada gravado', async () => {
    const f = fila()
    f.brokers = [{ data: null, error: null }]
    const { ctx, calls } = montar('dono', f)
    expect(await status(criarImovel(ctx, corpo({ brokerId: 'de-outro-tenant' })))).toBe(422)
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  test('corretor inativo como vendedor → 422', async () => {
    const f = fila()
    f.brokers = [{ data: { ...corretorB, active: false }, error: null }]
    expect(await status(criarImovel(montar('dono', f).ctx, corpo()))).toBe(422)
  })

  test('perfil sem permissão de criar → 403 antes de qualquer consulta', async () => {
    const { ctx, calls } = montar('juridico', fila())
    ctx.matriz.criar.juridico = 'nao'
    expect(await status(criarImovel(ctx, corpo()))).toBe(403)
    expect(calls).toEqual([])
  })

  test('corretor sem cadastro de corretor vinculado → 403', async () => {
    const { ctx } = montar('corretor', fila(), { membro: { userId: 'u1', nome: 'F', perfil: 'corretor', brokerId: null } })
    expect(await status(criarImovel(ctx, corpo()))).toBe(403)
  })

  test('validação do domínio vira 422 (preço, UF) e corpo malformado também — sem 500', async () => {
    expect(await status(criarImovel(montar('dono', fila()).ctx, corpo({ price: 0 })))).toBe(422)
    expect(await status(criarImovel(montar('dono', fila()).ctx, corpo({ state: 'Mato Grosso' })))).toBe(422)
    expect(await status(criarImovel(montar('dono', fila()).ctx, corpo({ title: 123 })))).toBe(422)
    expect(await status(criarImovel(montar('dono', fila()).ctx, 'texto'))).toBe(422)
    expect(await status(criarImovel(montar('dono', fila()).ctx, corpo({ features: 'piscina' })))).toBe(422)
  })

  test('mesmo título e endereço de outro imóvel → 409 e nada é inserido', async () => {
    const f = fila()
    f.properties = [{ data: [{ id: 'x', code: 'NC-1', title: 'sobrado novo', location: null }], error: null }]
    const { ctx, calls } = montar('dono', f)
    expect(await status(criarImovel(ctx, corpo()))).toBe(409)
    expect(calls.some((c) => c.method === 'insert')).toBe(false)
  })

  test('corrida no código (23505): tenta de novo pulando o número ocupado', async () => {
    const f = fila()
    f.properties = [
      { data: [{ id: 'x', code: 'IM-0005', title: 'Outro', location: null }], error: null },
      { data: null, error: { code: '23505' } },
      { data: row(), error: null },
      { data: row(), error: null },
    ]
    const { ctx, calls } = montar('dono', f)
    await criarImovel(ctx, corpo())
    const codigos = calls.filter((c) => c.method === 'insert' && c.table === 'properties').map((c) => (c.args[0] as { code: string }).code)
    expect(codigos).toEqual(['IM-0006', 'IM-0007'])
  })

  test('proximoCodigo: sem imóveis começa em IM-0001; ignora código sem número', () => {
    expect(proximoCodigo([])).toBe('IM-0001')
    expect(proximoCodigo(['sem-numero', 'NC-0231', 'IM-12'])).toBe('IM-0232')
  })
})

describe('atualizar', () => {
  const fila = (extra: Res = {}): Res => ({
    brokers: [{ data: [corretorB], error: null }, { data: [corretorB], error: null }], // embed na leitura e na releitura
    properties: [
      { data: row(), error: null }, // carregarVisivel
      { data: [{ id: IMOVEL_A, code: 'IM-0001', title: 'Casa no Centro', location: null }], error: null }, // identidades
      { data: [{ id: IMOVEL_A }], error: null }, // update ... select('id')
      { data: row({ title: 'Sobrado Novo' }), error: null }, // releitura
    ],
    ...extra,
  })
  const atualizado = (calls: ReturnType<typeof montar>['calls']) => calls.find((c) => c.table === 'properties' && c.method === 'update')?.args[0] as Record<string, unknown>

  test('corretor edita o dele; trocar o vendedor pelo corpo é descartado (continua b1)', async () => {
    const { ctx, calls, eventos } = montar('corretor', fila())
    await atualizarImovel(ctx, IMOVEL_A, corpo({ brokerId: 'b2' }))
    expect(atualizado(calls).broker_id).toBe('b1')
    expect(atualizado(calls).tenant_id).toBe(TENANT)
    expect(eventos).toEqual([`imovel.editar:${IMOVEL_A}`])
  })

  test('não toca nas fotos: nenhuma chamada a property_images (um upload concorrente não perde foto)', async () => {
    const { ctx, calls } = montar('dono', fila())
    await atualizarImovel(ctx, IMOVEL_A, corpo())
    expect(touched(calls, 'property_images')).toBe(false)
  })

  test('recepção troca o corretor vendedor, e o novo id é conferido no tenant', async () => {
    const { ctx, calls } = montar('recepcao', fila({ brokers: [{ data: [corretorB], error: null }, { data: { ...corretorB, id: 'b9' }, error: null }, { data: [corretorB], error: null }] }))
    await atualizarImovel(ctx, IMOVEL_A, corpo({ brokerId: 'b9' }))
    expect(atualizado(calls).broker_id).toBe('b9')
    expect(hadEq(calls, 'brokers', 'tenant_id')).toBe(true)
  })

  test('jurídico edita (a matriz de «editar» não o barra: o domínio decide)', async () => {
    const { ctx } = montar('juridico', fila())
    await expect(atualizarImovel(ctx, IMOVEL_A, corpo())).resolves.toMatchObject({ id: IMOVEL_A })
  })

  test('título igual ao de OUTRO imóvel → 409; ao dele mesmo, não acusa', async () => {
    const f = fila()
    ;(f.properties as unknown[])[1] = { data: [{ id: IMOVEL_B, code: 'IM-2', title: 'Sobrado Novo', location: null }], error: null }
    expect(await status(atualizarImovel(montar('dono', f).ctx, IMOVEL_A, corpo()))).toBe(409)
    expect(await status(atualizarImovel(montar('dono', fila()).ctx, IMOVEL_A, corpo({ title: 'Casa no Centro' })))).toBe(200)
  })

  test('trava de concorrência: expectedUpdatedAt vira condição do update e a versão velha dá 409', async () => {
    const f = fila()
    ;(f.properties as unknown[])[2] = { data: [], error: null } // 0 linhas: versão mudou
    ;(f.properties as unknown[])[3] = { data: { id: IMOVEL_A }, error: null } // ainda existe → conflito, não 404
    const { ctx, calls } = montar('dono', f)
    expect(await status(atualizarImovel(ctx, IMOVEL_A, corpo({ expectedUpdatedAt: '2026-11-01T10:00:00.000Z' })))).toBe(409)
    expect(calls.some((c) => c.method === 'eq' && c.args[0] === 'updated_at')).toBe(true)
  })
})

describe('status e destaque', () => {
  test('status inválido → 422 sem ler o banco', async () => {
    const { ctx, calls } = montar('dono', {})
    expect(await status(mudarStatus(ctx, IMOVEL_A, 'publicado'))).toBe(422)
    expect(calls).toEqual([])
  })

  test('mudar status: update com tenant e imóvel, quem editou, cache e evento', async () => {
    const { ctx, calls, eventos, estado } = montar('recepcao', { properties: [{ data: row(), error: null }, { data: null, error: null }, { data: row({ status: 'draft' }), error: null }] })
    const r = await mudarStatus(ctx, IMOVEL_A, 'draft')
    expect(r.status).toBe('draft')
    expect(calls.find((c) => c.method === 'update')?.args[0]).toEqual({ status: 'draft', updated_by: 'u1' })
    expect(hadEq(calls, 'properties', 'tenant_id')).toBe(true)
    expect(eventos).toEqual([`imovel.status:${IMOVEL_A}`])
    expect(estado.cache).toBe(1)
  })

  test('destaque exige booleano', async () => expect(await status(definirDestaqueImovel(montar('dono', {}).ctx, IMOVEL_A, 'sim'))).toBe(422))
})

describe('excluir', () => {
  const fila = (id = IMOVEL_A, broker = 'b1'): Res => ({ properties: [{ data: row({ id, broker_id: broker }), error: null }, { data: null, error: null }] })

  test('corretor exclui o dele; tenant e id no delete; evento e cache', async () => {
    const { ctx, calls, eventos, estado } = montar('corretor', fila())
    await excluirImovel(ctx, IMOVEL_A)
    const del = calls.findIndex((c) => c.method === 'delete')
    expect(del).toBeGreaterThan(-1)
    expect(calls.slice(del).filter((c) => c.method === 'eq').map((c) => c.args[0])).toEqual(['tenant_id', 'id'])
    expect(eventos).toEqual([`imovel.excluir:${IMOVEL_A}`])
    expect(estado.cache).toBe(1)
  })

  test('recepção e jurídico enxergam mas não excluem → 403', async () => {
    for (const p of ['recepcao', 'juridico'] as const) {
      const { ctx, calls } = montar(p, fila())
      expect(await status(excluirImovel(ctx, IMOVEL_A))).toBe(403)
      expect(calls.some((c) => c.method === 'delete')).toBe(false)
    }
  })

  test('dono exclui imóvel de qualquer corretor', async () => {
    await expect(excluirImovel(montar('dono', fila(IMOVEL_B, 'b2')).ctx, IMOVEL_B)).resolves.toEqual({ ok: true })
  })

  test('locação em andamento bloqueia → 409; encerrada ou arquivada, não', async () => {
    const loc = (o: Partial<Locacao>) => ({ imovelId: IMOVEL_A, status: 'Vigente', arquivado: false, ...o }) as Locacao
    const bloqueada = montar('dono', fila(), {}, [loc({})])
    expect(await status(excluirImovel(bloqueada.ctx, IMOVEL_A))).toBe(409)
    expect(bloqueada.calls.some((c) => c.method === 'delete')).toBe(false)
    const livre = montar('dono', fila(), {}, [loc({ status: 'Encerrada' }), loc({ arquivado: true })])
    await expect(excluirImovel(livre.ctx, IMOVEL_A)).resolves.toEqual({ ok: true })
  })

  test('a consulta de locação é feita com o id do imóvel já validado no tenant', async () => {
    const pedidos: string[] = []
    const { ctx } = montar('dono', fila(), { locacoesDoImovel: async (id) => (pedidos.push(id), []) })
    await excluirImovel(ctx, IMOVEL_A)
    expect(pedidos).toEqual([IMOVEL_A])
  })

  test('vínculo em outra tabela (23503) vira 409 legível, não 500', async () => {
    const f = fila()
    ;(f.properties as unknown[])[1] = { data: null, error: { code: '23503' } }
    expect(await status(excluirImovel(montar('dono', f).ctx, IMOVEL_A))).toBe(409)
  })
})

describe('fotos', () => {
  const webp = (extra = 'x') => `data:image/webp;base64,${Buffer.from(`RIFF\0\0\0\0WEBP${extra}`, 'latin1').toString('base64')}`
  const comFotos = (n: number) => row({ property_images: Array.from({ length: n }, (_, i) => imagem(i === 0 ? FOTO_1 : i === 1 ? FOTO_2 : `f${i}`, i, i === 0)) })

  test('adicionar: sobe duas versões, grava com property_id, a primeira vira capa', async () => {
    const { ctx, calls, estado, eventos } = montar('corretor', { properties: [{ data: row(), error: null }, { data: { id: IMOVEL_A }, error: null }, { data: row(), error: null }] })
    await adicionarFotosImovel(ctx, IMOVEL_A, { fotos: [{ url: webp(), urlSm: webp('s'), alt: ' vista ' }] })
    expect(estado.subidas).toBe(1)
    const ins = calls.find((c) => c.table === 'property_images' && c.method === 'insert')!.args[0] as Record<string, unknown>[]
    expect(ins).toEqual([{ property_id: IMOVEL_A, url: 'https://cdn/acme/1.webp', url_sm: 'https://cdn/acme/1@sm.webp', alt: 'vista', position: 0, is_cover: true }])
    expect(eventos).toEqual([`imovel.fotos:${IMOVEL_A}`])
  })

  test('com fotos já existentes a nova entra no fim e não é capa', async () => {
    const { ctx, calls } = montar('dono', { properties: [{ data: comFotos(2), error: null }, { data: { id: IMOVEL_A }, error: null }, { data: row(), error: null }] })
    await adicionarFotosImovel(ctx, IMOVEL_A, { fotos: [{ url: webp(), urlSm: null, alt: null }] })
    const [n] = calls.find((c) => c.table === 'property_images' && c.method === 'insert')!.args[0] as { position: number; is_cover: boolean }[]
    expect(n).toMatchObject({ position: 2, is_cover: false })
  })

  test('arquivo que não é imagem de verdade (SVG com cabeçalho de jpeg) → 422 e NADA vai ao Storage', async () => {
    const falso = `data:image/jpeg;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`
    const { ctx, estado, calls } = montar('dono', { properties: { data: row(), error: null } })
    expect(await status(adicionarFotosImovel(ctx, IMOVEL_A, { fotos: [{ url: webp(), urlSm: null, alt: null }, { url: falso, urlSm: null, alt: null }] }))).toBe(422)
    expect(estado.subidas).toBe(0) // o lote é validado inteiro antes de subir a primeira
    expect(touched(calls, 'property_images')).toBe(false)
  })

  test('mais fotos que o teto do imóvel → 422 sem subir', async () => {
    const { ctx, estado } = montar('dono', { properties: { data: comFotos(19), error: null } })
    expect(await status(adicionarFotosImovel(ctx, IMOVEL_A, { fotos: [{ url: webp(), urlSm: null, alt: null }, { url: webp('b'), urlSm: null, alt: null }] }))).toBe(422)
    expect(estado.subidas).toBe(0)
  })

  test('mais de 4 por envio e corpo sem lista → 422', async () => {
    const f = { url: webp(), urlSm: null, alt: null }
    expect(await status(adicionarFotosImovel(montar('dono', { properties: { data: row(), error: null } }).ctx, IMOVEL_A, { fotos: [f, f, f, f, f] }))).toBe(422)
    expect(await status(adicionarFotosImovel(montar('dono', { properties: { data: row(), error: null } }).ctx, IMOVEL_A, {}))).toBe(422)
  })

  test('capa: regrava só is_cover/position, filtrando por property_id', async () => {
    const { ctx, calls } = montar('dono', { properties: [{ data: comFotos(2), error: null }, { data: { id: IMOVEL_A }, error: null }, { data: row(), error: null }] })
    await definirCapaImovel(ctx, IMOVEL_A, FOTO_2)
    const ups = calls.filter((c) => c.table === 'property_images' && c.method === 'update').map((c) => c.args[0])
    expect(ups).toEqual([{ position: 0, is_cover: false }, { position: 1, is_cover: true }])
    expect(calls.filter((c) => c.table === 'property_images' && c.method === 'eq').some((c) => c.args[0] === 'property_id' && c.args[1] === IMOVEL_A)).toBe(true)
  })

  test('foto de OUTRO imóvel (id vem da URL) → 404, nenhuma imagem tocada', async () => {
    const { ctx, calls } = montar('dono', { properties: { data: comFotos(1), error: null } })
    expect(await status(removerFotoImovel(ctx, IMOVEL_A, '99999999-9999-4999-8999-999999999999'))).toBe(404)
    expect(await status(definirCapaImovel(ctx, IMOVEL_A, '99999999-9999-4999-8999-999999999999'))).toBe(404)
    expect(touched(calls, 'property_images')).toBe(false)
  })

  test('mover: direção inválida → 422; válida renumera', async () => {
    expect(await status(moverFotoImovel(montar('dono', {}).ctx, IMOVEL_A, FOTO_1, 'esquerda'))).toBe(422)
    const { ctx, calls } = montar('dono', { properties: [{ data: comFotos(2), error: null }, { data: { id: IMOVEL_A }, error: null }, { data: row(), error: null }] })
    await moverFotoImovel(ctx, IMOVEL_A, FOTO_1, 'baixo')
    const ups = calls.filter((c) => c.table === 'property_images' && c.method === 'update').map((c) => c.args[0])
    // a capa desceu: a outra foto é a 1ª e a antiga capa segue marcada como capa na 2ª posição
    expect(ups).toEqual([{ position: 0, is_cover: false }, { position: 1, is_cover: true }])
  })

  test('remover a capa promove a próxima', async () => {
    const { ctx, calls } = montar('dono', { properties: [{ data: comFotos(2), error: null }, { data: { id: IMOVEL_A }, error: null }, { data: { id: IMOVEL_A }, error: null }, { data: row(), error: null }] })
    await removerFotoImovel(ctx, IMOVEL_A, FOTO_1)
    expect(calls.some((c) => c.table === 'property_images' && c.method === 'delete')).toBe(true)
    const ups = calls.filter((c) => c.table === 'property_images' && c.method === 'update').map((c) => c.args[0])
    expect(ups).toEqual([{ position: 0, is_cover: true }])
  })
})

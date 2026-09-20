import { randomUUID } from 'node:crypto'
import { service } from './supabase'
import { DOCUMENTOS, type ChaveDoc } from './dados'

export interface Conta {
  userId: string
  email: string
  senha: string
}
export interface Cliente extends Conta {
  portalUserId: string
}
export interface Ambiente {
  slug: string
  tenantId: string
  contratoId: string
  membro: Conta
  inquilino: Cliente
  proprietario: Cliente
  fiador: Cliente
  documentos: Record<ChaveDoc, string>
}

/** Prefixo que a varredura procura. Mudar aqui sem mudar lá deixa lixo para sempre. */
const PREFIXO = 'e2e-'

/**
 * Senha de uso único, gerada pelo teste.
 *
 * É o que dispensa qualquer credencial humana: nada em `.env`, nada em
 * `storageState`, nada passando por conversa. A conta vive minutos e é apagada.
 */
function senhaDescartavel(): string {
  return `E2e!${randomUUID()}`
}

async function criarConta(email: string): Promise<Conta> {
  const senha = senhaDescartavel()
  const { data, error } = await service().auth.admin.createUser({
    email,
    password: senha,
    // Sem isto a conta nasce pendente de confirmação e o login recusa.
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`não criou a conta ${email}: ${error?.message}`)
  return { userId: data.user.id, email, senha }
}

/**
 * Cria o tenant descartável e tudo dentro dele.
 *
 * O tenant é próprio, e não a `demo`, por dois motivos: a `demo` é o que se mostra
 * ao cliente, e um teardown que falhe deixaria lixo numa base de demonstração; e
 * o `tenant_id` isola pelo mesmo mecanismo que o produto já garante, que é a
 * invariante número 1 do repositório.
 */
export async function criarAmbiente(): Promise<Ambiente> {
  const sb = service()
  const runId = randomUUID().slice(0, 8)
  const slug = `${PREFIXO}${runId}`

  const { data: tenant, error: erroTenant } = await sb
    .from('tenants')
    .insert({ slug, name: `E2E ${runId}` })
    .select('id')
    .single()
  if (erroTenant || !tenant) throw new Error(`não criou o tenant: ${erroTenant?.message}`)
  const tenantId = tenant.id as string

  // O portal precisa estar ligado, senão `requirePortalUser` devolve 403 antes
  // de qualquer asserção de audiência.
  const { error: erroFeature } = await sb
    .from('tenant_features')
    .insert({ tenant_id: tenantId, feature: 'portal', enabled: true })
  if (erroFeature) throw new Error(`não ligou o portal: ${erroFeature.message}`)

  // Membro do painel. O `role` é `owner` porque é quem pode tudo — o teste não
  // está medindo a diferença entre owner e admin.
  const membro = await criarConta(`membro-${runId}@e2e.invalid`)
  const { error: erroMembro } = await sb
    .from('tenant_members')
    .insert({ tenant_id: tenantId, user_id: membro.userId, role: 'owner' })
  if (erroMembro) throw new Error(`não vinculou o membro: ${erroMembro.message}`)

  const { data: contrato, error: erroContrato } = await sb
    .from('contracts')
    .insert({
      tenant_id: tenantId,
      code: `E2E-${runId}`,
      address_label: 'Rua de Teste, 1 — Centro',
      status: 'ativo',
    })
    .select('id')
    .single()
  if (erroContrato || !contrato) throw new Error(`não criou o contrato: ${erroContrato?.message}`)
  const contratoId = contrato.id as string

  async function criarCliente(papel: 'inquilino' | 'proprietario' | 'fiador'): Promise<Cliente> {
    const conta = await criarConta(`${papel}-${runId}@e2e.invalid`)
    const { data, error } = await sb
      .from('portal_users')
      .insert({
        tenant_id: tenantId,
        user_id: conta.userId,
        name: `${papel} ${runId}`,
        email: conta.email,
        // Nasce confirmado: o vínculo foi criado aqui, não veio de conta de
        // terceiro. É a mesma regra do caso 1 em `portal-invite.repository.ts`.
        access_confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`não criou o cliente ${papel}: ${error?.message}`)

    const { error: erroParte } = await sb
      .from('contract_parties')
      .insert({ contract_id: contratoId, portal_user_id: data.id, role: papel })
    if (erroParte) throw new Error(`não vinculou a parte ${papel}: ${erroParte.message}`)

    return { ...conta, portalUserId: data.id as string }
  }

  const inquilino = await criarCliente('inquilino')
  const proprietario = await criarCliente('proprietario')
  const fiador = await criarCliente('fiador')

  // Os documentos, com um arquivo real no bucket para a URL assinada ter o que
  // assinar. Um PDF mínimo basta: o teste mede quem pode baixar, não o conteúdo.
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')
  const documentos = {} as Record<ChaveDoc, string>

  for (const [chave, d] of Object.entries(DOCUMENTOS) as [ChaveDoc, (typeof DOCUMENTOS)[ChaveDoc]][]) {
    const caminho = `${slug}/${contratoId}/${chave}.pdf`
    const { error: erroUp } = await sb.storage
      .from('portal-docs')
      .upload(caminho, pdf, { contentType: 'application/pdf', upsert: true })
    if (erroUp) throw new Error(`não subiu ${chave}: ${erroUp.message}`)

    const { data, error } = await sb
      .from('portal_documents')
      .insert({
        tenant_id: tenantId,
        contract_id: contratoId,
        category: d.categoria,
        title: d.titulo,
        storage_path: caminho,
        audience: d.audiencia,
        published_at: d.publicado ? new Date().toISOString() : null,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`não gravou ${chave}: ${error?.message}`)
    documentos[chave] = data.id as string
  }

  return { slug, tenantId, contratoId, membro, inquilino, proprietario, fiador, documentos }
}

/**
 * Apaga o tenant e tudo que pendura nele.
 *
 * ⚠️ O cascade de `tenant_id` leva contratos, partes, documentos e trilha, mas
 * **não leva os objetos do bucket** — storage não participa de foreign key. Por
 * isso os arquivos saem antes, explicitamente. Confiar no cascade aqui deixaria
 * PDF órfão acumulando a cada execução.
 */
export async function apagarAmbiente(slug: string): Promise<void> {
  if (!slug.startsWith(PREFIXO)) {
    throw new Error(`recusando apagar "${slug}": não é tenant de teste`)
  }
  const sb = service()

  const { data: arquivos } = await sb.storage.from('portal-docs').list(slug, { limit: 1000 })
  for (const pasta of arquivos ?? []) {
    const { data: dentro } = await sb.storage
      .from('portal-docs')
      .list(`${slug}/${pasta.name}`, { limit: 1000 })
    const caminhos = (dentro ?? []).map((f) => `${slug}/${pasta.name}/${f.name}`)
    if (caminhos.length) await sb.storage.from('portal-docs').remove(caminhos)
  }

  const { data: tenant } = await sb.from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (!tenant) return

  // As contas do Auth não penduram em `tenant_id` — saem uma a uma, pelos
  // `user_id` que o tenant conhece, antes de o cascade apagar as linhas que os
  // apontam.
  const { data: clientes } = await sb.from('portal_users').select('user_id').eq('tenant_id', tenant.id)
  const { data: membros } = await sb.from('tenant_members').select('user_id').eq('tenant_id', tenant.id)
  for (const u of [...(clientes ?? []), ...(membros ?? [])]) {
    if (u.user_id) await sb.auth.admin.deleteUser(u.user_id)
  }

  await sb.from('tenants').delete().eq('id', tenant.id)
}

/**
 * Varre restos de execuções anteriores.
 *
 * A segunda rede, e a que importa: o teardown não roda quando alguém dá `Ctrl+C`
 * no meio, e uma única execução interrompida deixaria tenant órfão permanente no
 * banco dos clientes reais. Uma hora é folga suficiente para não atropelar uma
 * execução em curso em outra máquina.
 */
export async function varrerAmbientesAntigos(): Promise<number> {
  const limite = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data } = await service()
    .from('tenants')
    .select('slug')
    .like('slug', `${PREFIXO}%`)
    .lt('created_at', limite)

  for (const t of data ?? []) await apagarAmbiente(t.slug as string)
  return (data ?? []).length
}

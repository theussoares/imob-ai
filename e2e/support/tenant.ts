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
  if (erroMembro) {
    // A conta do Auth já existe neste ponto, e nenhuma linha aponta para ela
    // ainda — nem `tenant_members`, que acabou de falhar. `apagarAmbiente` só
    // encontra conta órfã pelos `user_id` de `portal_users`/`tenant_members`;
    // sem este cleanup ela ficaria para sempre, e nem a varredura por
    // `tenants` a acharia, porque o tenant em si é apagado por quem chamar
    // `apagarAmbiente` depois — a conta continuaria viva. É o segundo caminho
    // de vazamento descrito no comentário de `apagarAmbiente`, fechado aqui em
    // vez de só documentado.
    await sb.auth.admin.deleteUser(membro.userId)
    throw new Error(`não vinculou o membro: ${erroMembro.message}`)
  }

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
    if (error || !data) {
      // Mesmo raciocínio do membro acima: a conta nasceu, mas ainda nenhuma
      // linha em `portal_users` aponta para ela — sem apagar aqui, ela vaza
      // sem que nada no banco saiba que ela existiu.
      await sb.auth.admin.deleteUser(conta.userId)
      throw new Error(`não criou o cliente ${papel}: ${error?.message}`)
    }

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

  // Falhar aberto aqui é o pior lugar do arquivo para falhar: a remoção do
  // bucket já rodou (linhas acima). `error` descartado faz "a consulta falhou"
  // parecer "não há tenant" — a função dá `return`, quem chamou lê sucesso, e
  // `varrerAmbientesAntigos` incrementa `apagados` por um ambiente que não
  // apagou nada do banco. Ficam para trás a linha de `tenants` e as contas de
  // Auth, exatamente o estado que o resto desta função existe para evitar.
  const { data: tenant, error: erroBusca } = await sb
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (erroBusca) {
    throw new Error(`não consegui checar se o tenant "${slug}" existe: ${erroBusca.message}`)
  }
  if (!tenant) return

  // Confere que o bucket ficou mesmo vazio para este slug ANTES de apagar
  // qualquer coisa que dependa da linha de `tenants` existir — e é por isso
  // que essa linha morre por ÚLTIMA nesta função, nunca antes dela.
  //
  // A linha é o ÍNDICE que `varrerAmbientesAntigos` usa para achar sobra: ela
  // consulta só `public.tenants`, nunca lista `portal-docs` por prefixo — a
  // raiz do bucket guarda documento de quatro imobiliárias reais, e listar
  // tudo ali seria varredura ampla demais para um utilitário de teste
  // (alternativa descartada). Sem a linha, um arquivo que sobrou por falha de
  // rede, rate limit do Storage ou qualquer outro motivo no meio da remoção
  // acima fica invisível para sempre: nada mais no banco aponta para aquele
  // slug.
  //
  // Por isso: se sobrou pasta, lança erro aqui e para — sem tocar em conta de
  // Auth, sem apagar a linha. Um vazamento que a PRÓXIMA chamada a esta
  // função (manual ou pela varredura) ainda consegue achar é recuperável; um
  // vazamento sem tenant não é.
  const { data: restou, error: erroRestou } = await sb.storage
    .from('portal-docs')
    .list(slug, { limit: 1000 })
  if (erroRestou) {
    // Falhar ABERTO aqui reabriria o buraco que este bloco existe para
    // fechar: rede caindo e rate limit do Storage são os mesmos motivos
    // citados acima para a linha sobreviver, e um `list()` que erra não prova
    // que o bucket esvaziou — prova só que não dá para saber. "Não sei" tem
    // que contar como "não está vazio". Falhar fechado é barato: a linha
    // sobrevive e a próxima chamada tenta de novo; o custo do outro lado —
    // apagar a linha sem nunca ter confirmado — é exatamente o vazamento
    // indescobrível que a fix anterior fechou.
    throw new Error(`não consegui confirmar se o bucket esvaziou para "${slug}": ${erroRestou.message}`)
  }
  if ((restou ?? []).length > 0) {
    throw new Error(
      `bucket não ficou vazio para "${slug}" (${restou!.length} pasta(s) restante(s)) — ` +
        'mantendo a linha do tenant para a próxima chamada achar e tentar de novo',
    )
  }

  // As contas do Auth não penduram em `tenant_id` — saem uma a uma, pelos
  // `user_id` que o tenant conhece, antes de o cascade apagar as linhas que os
  // apontam.
  //
  // MESMA forma do vazamento do bucket acima, e o mesmo remédio. Antes, os dois
  // `select` caíam em `?? []` — o que transforma "a consulta falhou, não sei se
  // tem linha" em "não tem nenhuma linha" — e o retorno de `deleteUser` (que
  // não lança, devolve `{ error }`) era descartado sem ninguém olhar. Com as
  // duas coisas juntas, uma rede instável podia deixar a conta de Auth viva e,
  // mesmo assim, a função seguia até apagar a linha de `tenants` — o índice que
  // `varrerAmbientesAntigos` usa. Um vazamento que a PRÓXIMA chamada ainda acha
  // (porque a linha do tenant sobrevive) é recuperável; sem tenant, não há mais
  // nada no banco que aponte para aquela conta.
  const { data: clientes, error: erroClientes } = await sb
    .from('portal_users')
    .select('user_id')
    .eq('tenant_id', tenant.id)
  if (erroClientes) {
    throw new Error(
      `não consegui listar os clientes de "${slug}" para confirmar que as contas saem: ${erroClientes.message}`,
    )
  }
  const { data: membros, error: erroMembros } = await sb
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenant.id)
  if (erroMembros) {
    throw new Error(
      `não consegui listar os membros de "${slug}" para confirmar que as contas saem: ${erroMembros.message}`,
    )
  }

  for (const u of [...clientes, ...membros]) {
    if (!u.user_id) continue
    const { error: erroDelete } = await sb.auth.admin.deleteUser(u.user_id)
    // 404 conta como sucesso: é o estado de uma reexecução desta função depois
    // de uma falha parcial anterior (a conta já saiu, a linha de `tenants`
    // não chegou a sair). Qualquer outro erro para aqui, com a linha do
    // tenant intacta para a próxima chamada — manual ou da varredura —
    // tentar de novo.
    if (erroDelete && erroDelete.status !== 404) {
      throw new Error(`não apaguei a conta ${u.user_id} de "${slug}": ${erroDelete.message}`)
    }
  }

  // Último passo, e o índice de que `varrerAmbientesAntigos` depende (ver o
  // comentário acima). `supabase-js` não lança aqui, devolve `{ error }` — igual
  // ao `deleteUser` de cima, que já é tratado. Descartar este `error` faz FK,
  // timeout ou erro transitório passar como remoção bem-sucedida: `apagados++`
  // conta uma linha que continua no banco, e o log da varredura mente sobre o
  // que de fato saiu.
  const { error: erroDeleteTenant } = await sb.from('tenants').delete().eq('id', tenant.id)
  if (erroDeleteTenant) {
    throw new Error(`não apaguei a linha do tenant "${slug}": ${erroDeleteTenant.message}`)
  }
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
  // Esta é a ÚNICA rede quando o teardown de um spec não roda (`Ctrl+C`,
  // processo morto no meio). `data ?? []` descartando `error` transforma "não
  // sei se há órfão" em "não há órfão": o `for` abaixo não itera, a função
  // devolve `0`, e como `global-setup.ts` só loga quando `apagados > 0`, a
  // varredura inteira passa sem NENHUMA saída — um tenant órfão de ontem
  // continua no banco dos clientes reais e ninguém percebe que a rede de
  // proteção não rodou. Lança em vez de engolir, para não confundir "varri e
  // não achei nada" com "não consegui olhar".
  const { data, error: erroVarredura } = await service()
    .from('tenants')
    .select('slug')
    .like('slug', `${PREFIXO}%`)
    .lt('created_at', limite)
  if (erroVarredura) {
    throw new Error(`varredura não conseguiu listar tenants órfãos: ${erroVarredura.message}`)
  }

  // Um ambiente preso não pode travar a limpeza dos outros — é para isso que
  // a varredura existe. `apagarAmbiente` agora lança quando o bucket não
  // ficou vazio; sem o try/catch aqui, esse throw se propagaria pelo `for` e
  // abortaria a passada inteira no primeiro ambiente problemático. Como a
  // query acima não tem `.order()`, a ordem não é garantida — um único órfão
  // travado bloquearia a limpeza de TODOS os outros, em toda execução, para
  // sempre. O erro vai para o log (não é engolido); o retorno conta só o que
  // de fato saiu, então uma varredura parcial aparece como um número menor do
  // que o total de candidatos, nunca como sucesso silencioso.
  let apagados = 0
  for (const t of data ?? []) {
    const slug = t.slug as string
    try {
      await apagarAmbiente(slug)
      apagados++
    } catch (erro) {
      console.error(`varredura não conseguiu apagar "${slug}":`, erro)
    }
  }
  return apagados
}

/**
 * Troca um link de convite por tokens de sessão, do lado do servidor.
 *
 * Existe para a tela `definir-senha` ser exercitada de verdade sem depender de
 * e-mail nem da allowlist de Redirect URLs do Supabase — que é configuração fora
 * deste repositório e apontaria para o domínio do tenant, não para o localhost.
 *
 * `generateLink` devolve o `hashed_token`; `verifyOtp` o troca por sessão. Com os
 * dois tokens em mãos, a página é aberta no ramo `tipo === 'tokens'`, que é o
 * mesmo caminho do fluxo implícito real.
 *
 * O tipo é `recovery`, não `invite`: `criarAmbiente` já criou a conta de
 * inquilino/proprietário/fiador via `admin.createUser` (para o login com senha
 * de `audiencia.spec.ts` funcionar), e `generateLink({type:'invite'})` recusa
 * com "already registered" quando o e-mail já tem conta — é o mesmo motivo
 * documentado em `portal-invite.repository.ts` (`obterAcesso`). `recovery` é o
 * tipo certo para conta que já existe, e devolve o mesmo par de tokens no
 * fluxo implícito: a página não distingue de onde o token veio, só que
 * `tipo === 'tokens'`.
 */
export async function tokensDeConvite(
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  // Mesmo hábito do prefixo `e2e-` em `apagarAmbiente`: esta é a única função
  // de suporte que cria sessão REAL no Auth de produção para um e-mail
  // arbitrário, sem checagem nenhuma. Hoje só é chamada com `@e2e.invalid`,
  // mas nada além da disciplina de quem escreve o próximo teste impede um
  // e-mail de cliente de verdade passar aqui amanhã — e o filtro redundante é
  // exatamente o que esta branch já consagrou para `apagarAmbiente`: barreira
  // que não depende de ninguém lembrar.
  if (!email.endsWith('@e2e.invalid')) {
    throw new Error(`recusando gerar sessão para "${email}": não é e-mail de teste`)
  }

  const sb = service()
  const { data, error } = await sb.auth.admin.generateLink({ type: 'recovery', email })
  if (error || !data.properties?.hashed_token) {
    throw new Error(`não gerou o convite de ${email}: ${error?.message}`)
  }

  const { data: sessao, error: erroOtp } = await sb.auth.verifyOtp({
    type: 'recovery',
    token_hash: data.properties.hashed_token,
  })
  if (erroOtp || !sessao.session) {
    throw new Error(`não trocou o token de ${email}: ${erroOtp?.message}`)
  }

  return {
    accessToken: sessao.session.access_token,
    refreshToken: sessao.session.refresh_token,
  }
}

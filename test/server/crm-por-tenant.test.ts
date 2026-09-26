import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * O CRM (0049) é recurso por imobiliária (0054).
 *
 * O motivo: ele entrou na develop sem flag, e o release para a main o levaria
 * a todos os clientes em produção — quando é, por ora, só para demonstração.
 * Estas travas leem o fonte, como `area-cliente-por-tenant.test.ts`: o modo de
 * falha é um item de menu ou um `if` esquecido, que não quebra nada — só
 * mostra o recurso para quem não devia.
 */
function fonte(...partes: string[]): string {
  return readFileSync(join(process.cwd(), ...partes), 'utf8')
}

describe('CRM segue o recurso', () => {
  test('Agenda: marcada no menu e fechada por middleware', () => {
    const sidebar = fonte('app', 'components', 'AdminSidebar.vue')
    expect(sidebar).toMatch(/to: "\/admin\/agenda"[^}]*recurso: "crm"/)
    expect(sidebar).toMatch(/crm: crm\.value/)
    expect(fonte('app', 'pages', 'admin', 'agenda.vue')).toMatch(/middleware: \[[^\]]*"crm"/)
  })

  test('o formulário público só gira a roleta com o CRM ligado', () => {
    // Sem isto, uma imobiliária com `lead_distribution = 'roleta'` que perdeu o
    // recurso teria leads distribuídos sem a tela que mostra para quem foram.
    const post = fonte('server', 'api', 'leads.post.ts')
    expect(post).toMatch(/\(await crmAtivo\(tenant\.id\)\) \? await distribuirPelaRoleta/)
  })

  test('ficha do contato: linha do tempo, perda com motivo e roleta só com o recurso', () => {
    const leads = fonte('app', 'pages', 'admin', 'leads', 'index.vue')
    expect(leads).toMatch(/<AdminLeadTimeline v-if="temCrm"/)
    expect(leads).toMatch(/v-if="temCrm && losing"/)
    expect(fonte('app', 'pages', 'admin', 'corretores', 'index.vue')).toMatch(/v-if="temCrm" class="admin-card roleta"/)
  })

  test('a constraint da 0054 mantém os recursos que já existiam', () => {
    // Recriar a constraint sem um valor existente desliga aquele recurso de
    // toda imobiliária que paga — o aviso da 0045.
    const sql = fonte('supabase', 'migrations', '0054_recurso_crm.sql')
    expect(sql).toContain("check (feature in ('portal', 'about', 'ai', 'crm'))")
  })
})

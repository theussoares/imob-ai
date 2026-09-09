import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Recolhe arquivos órfãos do bucket property-images.
 *
 * Órfão aqui é só o que a função `orphan_property_images` (0028) devolve:
 * arquivo sem linha em property_images E mais velho que a carência. A carência
 * é o que separa "upload abandonado" de "cadastro em andamento" — os dois são
 * idênticos no banco, só o tempo os distingue. Ver o comentário da migration.
 *
 * As causas de órfão no salvamento e na exclusão já foram fechadas no servidor
 * (`replaceImages` e `deleteProperty`). Esta varredura existe para a única que
 * nenhum código de servidor alcança: quem escolhe as fotos — que sobem na hora —
 * e fecha a aba sem salvar.
 *
 * Agendada em 0029. Também pode ser chamada à mão para inspecionar sem apagar:
 *   POST /functions/v1/cleanup-orphan-images
 *   x-sweep-token: <segredo orphan_sweep_token do Vault>
 *   { "dryRun": true }
 */

const BUCKET = 'property-images'

/** O `remove()` do Storage aceita uma lista; 100 por vez evita request gigante. */
const BATCH = 100

/** Horas que um arquivo sem linha precisa ter para ser considerado abandonado. */
const DEFAULT_GRACE_HOURS = 24

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Publicada com `verify_jwt` desligado, então esta é a única tranca — e ela
  // vem antes de qualquer outra coisa. O segredo é conferido dentro do banco
  // (0029) para não precisar sair de lá.
  //
  // Não dá para comparar com o `SUPABASE_SERVICE_ROLE_KEY` do ambiente, que
  // seria o caminho óbvio: neste projeto o runtime recebe a chave no formato
  // novo (`sb_secret_…`) e o que se copia do painel é o JWT legado, então a
  // comparação nunca bate. Ver o comentário da migration.
  const { data: autorizado, error: authError } = await client.rpc('orphan_sweep_token_valid', {
    candidate: req.headers.get('x-sweep-token') ?? '',
  })
  if (authError || autorizado !== true) {
    return Response.json({ error: 'não autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dryRun === true
  const graceHours = Number(body?.graceHours ?? DEFAULT_GRACE_HOURS)

  const { data, error } = await client.rpc('orphan_property_images', { grace_hours: graceHours })
  if (error) {
    console.error(JSON.stringify({ level: 'error', event: 'sweep.query_failed', reason: error.message }))
    return Response.json({ error: error.message }, { status: 500 })
  }

  const paths = (data ?? []).map((row: { name: string }) => row.name)
  if (dryRun || !paths.length) {
    return Response.json({ found: paths.length, removed: 0, dryRun, paths: dryRun ? paths : undefined })
  }

  let removed = 0
  const failures: string[] = []
  for (let i = 0; i < paths.length; i += BATCH) {
    const lote = paths.slice(i, i + BATCH)
    const { error: rmError } = await client.storage.from(BUCKET).remove(lote)
    // Um lote que falha não derruba os outros: o que der para recolher, recolhe.
    // O que sobrar continua órfão e volta na varredura de amanhã.
    if (rmError) failures.push(rmError.message)
    else removed += lote.length
  }

  // Uma linha por execução: sem isso a varredura é invisível, e o dia em que ela
  // parar de rodar (ou passar a apagar demais) ninguém percebe.
  console.log(
    JSON.stringify({ level: 'info', event: 'sweep.done', found: paths.length, removed, failed: failures.length }),
  )

  return Response.json({ found: paths.length, removed, failures })
})

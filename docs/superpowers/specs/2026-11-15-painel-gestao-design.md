# Painel de gestão de contratos (layer `gestao`) — MVP de demonstração

Protótipo: artifact "OLMI Imóveis — Sistema de gestão" (claude.ai/artifact/Em4j4Ck4u1NA32HJGfwQPx).
Backlog: ClickUp, lista "Desenvolvimento (épicos e tarefas)" (52 itens).

## Motivo

A Olmi (tenant do Moradi) apresenta o sistema numa reunião em 16/11/2026. O
`/admin` atual é CRM de leads e catálogo; o fluxo de **contrato de venda em 8
etapas, com 4 perfis de permissão** não existe nele. O prazo é um dia, então o
entregável é a estrutura definitiva (layer, domínio, permissões) com telas
funcionando sobre dados de exemplo — não um backend.

## Escopo (fatia de hoje)

1. Acesso por convite (ver «Acesso e segurança»). O seletor de perfil sobrevive só como
   «Acesso rápido de demonstração», ligado por `NUXT_PUBLIC_GESTAO_DEMO`.
2. Layout: topo + menu lateral (mobile: menu horizontal), itens visíveis por permissão.
3. Lista de contratos de venda: cards, busca, filtro dos 13 status, "Novo processo".
4. Processo de venda: stepper de 8 etapas, mudança de status, aba de comissão
   (só jurídico/dono, regra 5% = 40/10/50 + adiantamentos).
5. Documentos: lista, envio, substituição, lixeira com restauração.
6. Dashboard, Imóveis, Locação, Financeiro, Consulta, Auditoria, Usuários,
   Configurações: item de menu presente, tela «em breve».

## Fora do escopo por decisão

- Persistência real (Supabase), RLS, Storage, e-mail/WhatsApp, SPC/Serasa.
- Locação (8 etapas próprias) e alertas 30/60/90.
- Backend real do acesso (Supabase Auth, tabela de OTP, envio de e-mail, Turnstile de verdade): hoje o fluxo é completo na tela, em modo demonstração.
- Flag por tenant em `tenant_features` (exige migration): hoje o gate é
  `runtimeConfig.public.gestaoEnabled` (env `NUXT_PUBLIC_GESTAO_ENABLED`).
  Ligar à `tenant_features` é o primeiro item pós-demo.

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Nuxt layer em `layers/gestao`, rotas `/gestao/**` | Páginas dentro de `app/pages/admin` | Isola do CRM atual; o painel pode virar produto/pacote separado sem mover código |
| Regra de negócio em módulos puros (`layers/gestao/domain`) | Lógica dentro dos componentes | Testável em Node puro (vitest do repo), e é o que migra para o servidor depois |
| `mocker-nuxt` serve os GETs de seed em `/api/gestao/*` | Fixtures importadas direto no client | A tela já chama `$fetch` de verdade; trocar o mock pela API real não muda componente |
| Mutações em store no cliente (`useGestaoStore`, persistido em localStorage) | Mocks de POST/PATCH | `mocker-nuxt` 1.0.6 não tem mock com estado (README: "sem mocks CRUD stateful") |
| `basePath: '/api/gestao'` no mocker | `/api` inteiro | Com `/api` o gateway interceptaria `/api/admin`, `/api/leads` etc. do app real |
| Estilo só com utilitários Tailwind (sem `<style scoped>`), tokens do app via `var(--brand)` etc. | CSS escopado por componente | Pedido do time; é o padrão do app. `@source` em `main.css` faz o Tailwind varrer `layers/` |
| Gate por env no MVP | `tenant_features` | Sem migration hoje; develop e produção dividem o banco |
| QA no navegador: fluxos escritos por Sonnet, executados por Haiku | Playwright | Playwright do repo cria tenant `e2e-*` no banco de produção; aqui só há mock |

## Regras de domínio copiadas do protótipo

- 13 status de venda; `Venda concluída`/`Venda cancelada` são finais (só leitura).
- Permissões: `sim | proprio | nao` por perfil e por chave (matriz em `permissions.ts`).
- Corretor só vê processos em que é o corretor (`verTodos = proprio`).
- Comissão: percentual sobre o valor, dividida vendedor 40 / captador 10 / imobiliária 50;
  adiantamento não pode passar do restante da parte.
- Documento apagado vai para a lixeira (quem e quando) e pode ser restaurado.

## Estrutura

```
layers/gestao/
  nuxt.config.ts        módulo mocker-nuxt, runtimeConfig
  domain/               tipos, permissões, status, etapas, comissão, seed (puro, testado)
  mocks/                *.mock.ts do mocker-nuxt (GET /api/gestao/*)
  app/
    layouts/gestao.vue
    middleware/gestao.ts   gate de flag + sessão + permissão de rota
    composables/           useGestaoSessao, useGestaoStore
    components/Gestao*.vue
    pages/gestao/**
  test/                 vitest (unidade) + qa/ (fluxos de QA no navegador)
```

## Acesso e segurança (pedido de 15/11)

Fluxo: **Dono ou Jurídico/financeiro convida por e-mail → convidado cria senha forte
(com captcha) → no login, e-mail + senha (com captcha) → código de 6 dígitos por e-mail
(2º fator) → sessão.** Nova permissão `convidar` (dono e jurídico); jurídico vê
«Usuários e permissões» mas não «Configurações».

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Convite com token de uso único, validade 72 h, perfil fixado no convite | Dono cria a conta já com senha | A senha nasceria conhecida por terceiro (spec de convite de 18/08); foi o caso da conta demo |
| Senha: ≥ 12 caracteres, maiúscula, minúscula, número, símbolo, sem e-mail/nome, fora de lista de senhas comuns; medidor de força | Só tamanho mínimo | Tamanho sozinho aceita `Senha123456` |
| Captcha atrás de um componente `GestaoCaptcha` (token por `v-model`); real = Cloudflare Turnstile | Chamar o provedor direto nas telas | Provedor trocável; no demo é um desafio simulado, sem script de terceiro. Turnstile real é script de terceiro: exige revisar `privacidade.vue` (CLAUDE.md, seção LGPD) |
| 2º fator por código de 6 dígitos no e-mail: validade 10 min, 5 tentativas, reenvio após 60 s, uso único, guardado só como hash | TOTP (app autenticador) | Pedido do cliente: e-mail. TOTP fica como evolução (Supabase MFA já suporta) |
| Bloqueio por 5 códigos errados expira sozinho: 15 min (produção) e 5 min no demo (`public.gestaoDemo`); a mensagem diz em quantos minutos tentar; ao vencer, as tentativas zeram; código certo também zera | Bloqueio sem prazo, ou o mesmo 15 min no demo | Sem prazo trava a conta para sempre; 15 min num QA/apresentação impede testar o código certo (visto no QA de 15/11) |
| Mensagens de erro genéricas no login («e-mail ou senha incorretos») | Dizer qual campo errou | Não revela se o e-mail tem conta |
| No demo o código aparece numa faixa «Demonstração» | Enviar e-mail de verdade | Não há provedor de e-mail no demo; a faixa só existe com `GESTAO_DEMO` |

Backend real (pós-demo, nada disto existe hoje): reaproveitar `server/api/admin/members.post.ts`
(convite via `auth.admin.generateLink`), `server/utils/mailer.ts` (envio do código) e
`server/utils/rate-limit.ts` (limite por IP e por conta). Tabela `gestao_otp` com
`user_id`, `code_hash`, `expires_at`, `attempts`, RLS fechada e `revoke all from anon`;
comparação do hash em tempo constante; tudo escopado por `tenant_id` do servidor.

## Anotações da reunião com o cliente (15/11)

Cruzadas com o protótipo e com o checklist impresso da Olmi.

| Anotação | Situação |
|---|---|
| Corretor vê só o seu; recepção e jurídico veem os próprios acessos e os de todos os corretores; dono vê tudo | Já na matriz de permissões (`verTodos`) |
| Corretor preenche o formulário primeiro e pode anexar o contrato (opcional) | Entra hoje: modal «Novo processo» com telefone, e-mail e PDF opcional |
| Recepção vê e edita; jurídico arquiva; dono tudo | Já na matriz. **Jurídico só arquiva, não deleta** (decidido em 15/11: excluir de verdade perderia histórico e auditoria; a nota «arquivar/deletar» da reunião fica como arquivar) |
| Docs do vendedor/comprador: RG, CPF, CNH, telefone, e-mail, certidão de casamento ou nascimento, comprovante de residência | Entra hoje (etapas 2 e 3, com cadastro de CPF/telefone/e-mail) |
| Imóvel: matrícula atualizada ou matrícula-mãe (exige projeto/prancha), valor venal, docs do proprietário (= vendedor), água e luz | Entra hoje (etapa 4, `matriculaMae`) |
| Checklist: valor de venda, de avaliação, financiado, ganho de capital, entrada (FGTS, recurso próprio, bem) | Entra hoje (`avaliacao`, `ganhoCapital`, `bem`/`valorBem`) |
| Comissão 5% = 40/10/50, adiantamento «ou ao fim de contrato», checkbox de pagamento com comprovante, comissão final a receber | Entra hoje (`momento`, `pago`, `comprovante`; pago exige comprovante) |
| Conferência final: 4 caixas, responsável e data | Entra hoje (`ConferenciaFinal`) |
| Locação: aviso de fim de contrato e de aluguel, garantias, laudos de entrada/saída, repasse | Fora do MVP de hoje (menu «em breve»); primeiro item depois do demo |
| Menu lateral com uma aba por tipo de contrato, card com nome e status | Já é assim (venda hoje, locação em breve) |
| Busca SPC/Serasa dentro do sistema | Fora de hoje: tela «em breve», permissão `consulta` já modelada; exige contrato com o provedor |
| Inspirações: Mobz, Azana, Imoviu | Sem acesso a esses produtos aqui; a UI segue o protótipo aprovado |

## Ajustes pós-revisão (15/11)

| Decisão | Alternativa descartada | Motivo |
| --- | --- | --- |
| Etapas 1 a 5 só concluem com dados e arquivos (`pendenciasEtapa`); telefone e e-mail seguem opcionais **na abertura** e obrigatórios para concluir as etapas 2 e 3 | Tornar os dois obrigatórios no «Novo processo» | O corretor abre o processo na hora da proposta, ainda sem o contato; a exigência cai onde o contato é necessário |
| Estado do item de documento derivado do arquivo (`Documento.requisito`) | Checkbox por item | Checkbox sem arquivo era afirmação sem prova: a etapa 2 foi concluída vazia |
| Documentos das pessoas: RG ou CNH, certidão de nascimento ou casamento, comprovante de residência; CPF vira campo | CPF como arquivo | Pedido do cliente: não se pede o papel do CPF |
| Aba «Comissão» some para quem não tem `valores` | Aba com cadeado | Não precisa avisar que existe algo escondido |

Divergências do protótipo fechadas no mesmo dia: etapa 1 editável com contrato preliminar, «Ganho de
capital» como lista, observações do jurídico (etapa 7), cancelar venda na etapa 8 e arquivar contrato
com a tela «Arquivados» (restaurar devolve o contrato; arquivar só vale para contrato encerrado).

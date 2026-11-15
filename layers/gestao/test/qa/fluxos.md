# Fluxos de QA do painel de gestão (navegador + mocker-nuxt)

Escritos por Sonnet, executados por Haiku. Cada fluxo é uma sequência curta com
resultado esperado verificável. O executor NÃO corrige código: só reporta
PASSOU/FALHOU por passo, com o texto observado quando falhar.

## Preparação

- App em `http://localhost:3000` subido com `pnpm dev:gestao` (mocks ligados).
- Sempre começar em `/gestao/login` com o localStorage limpo:
  `localStorage.clear()` e em seguida **navegar de novo** para `/gestao/login`
  (nunca limpar e clicar no mesmo script: a navegação corta o script).
- Seletores: `data-testid` (ex.: `[data-testid=perfil-corretor]`). Preferir
  `javascript_tool` (`document.querySelector(...).click()`) e `read_page`/
  `get_page_text` a screenshots. Esperar ~500 ms após cada clique.
- Perfis: `perfil-corretor` (Carlos Mendes, corretor c1), `perfil-recepcao`
  (Marina Alves), `perfil-juridico` (Paulo Ribeiro), `perfil-dono` (Helena Duarte).
- Dados de exemplo: 6 processos. Do Carlos (c1): V-2026-0142 e V-2026-0155.
  Finais: V-2026-0133 (concluída) e V-2026-0147 (cancelada).

## F1 — Login e menu por perfil

1. Em `/gestao/login`, o botão `entrar` está desabilitado e diz «Escolha um perfil».
2. Escolher `perfil-corretor` → botão diz «Entrar como Corretor»; clicar.
3. URL vira `/gestao/vendas`; topo mostra «Carlos Mendes» e «Corretor».
4. Menu (`nav a`) tem exatamente: Dashboard, Imóveis, Contratos de venda,
   Contratos de locação. NÃO tem Financeiro, Usuários, Configurações.
5. «Trocar perfil» → volta a `/gestao/login`; entrar como `perfil-dono` → menu com 10 itens.
6. Acessar direto `/gestao/financeiro` como corretor → redireciona para `/gestao/vendas`.
7. Acessar `/gestao/imoveis` → mostra `em-breve`.

## F2 — Lista de contratos (visibilidade)

1. Como corretor: cards `card-processo` = 2 (0142 e 0155); nenhum `data-processo-id`
   de outro corretor.
2. Como recepção: 6 cards.
3. `novo-processo` aparece para corretor, recepção, jurídico e dono (todos têm `criar`).

## F3 — Busca e filtro

1. Como dono: digitar «marta» em `busca` → 1 card (0142). Digitar «MARTA» → igual.
2. Digitar «larissa» → 1 card (0155). Digitar «zzz» → `vazio` visível com «Limpar busca»;
   clicar → volta a 6 cards.
3. Selecionar em `filtro-status` «Venda concluída» → 1 card (0133), chip «Venda concluída».
4. «Venda cancelada» + busca «orquídeas» → 1 card (0147).

## F4 — Novo processo

1. Como corretor, clicar `novo-processo` → `modal-novo-processo` abre; corretor vem
   preenchido e travado (Carlos Mendes).
2. Enviar vazio → mensagem «Informe o imóvel.» (modal continua aberto).
3. Preencher imóvel «Casa de teste», vendedor «Ana», comprador «Bruno» → enviar:
   toast de sucesso, navega para `/gestao/vendas/V-2026-0159`.
4. Voltar à lista → 3 cards; o novo (0159) tem chip «Em negociação».
5. Recarregar a página → o processo continua (persistência no localStorage).
6. «Restaurar dados» (topo) → volta a 2 cards do corretor; 0159 some.

## F5 — Processo: etapas e status

1. Como dono, abrir `/gestao/vendas/V-2026-0151`. `stepper` mostra 8 etapas; etapa 3
   é a atual; texto «2 de 8 etapas concluídas».
2. Clicar `concluir-etapa` → «3 de 8», etapa atual vira 4, histórico ganha
   «Concluiu a etapa 3».
3. Trocar `select-status` para «Proposta aprovada» → chip muda; histórico registra.
4. Em **V-2026-0158** (não use o 0151: o F6 precisa dele ativo), selecionar «Venda cancelada» →
   abre confirmação; cancelar o diálogo → status não muda; repetir e confirmar → chip «Venda
   cancelada», `select-status` desabilitado e `concluir-etapa` desabilitado OU ausente.
5. Abrir `/gestao/vendas/V-2026-0133` (concluída) → tudo só leitura.

## F6 — Comissão e permissão de valores

1. Como dono ou jurídico, em V-2026-0142: `aba-comissao` ativa; `comissao-total` mostra
   R$ 5.000,00; partes 2.000 / 500 / 2.500; restante R$ 0,00.
2. Em V-2026-0151 (valor 480.000): total R$ 24.000,00; adiantado da parte do vendedor 6.000.
3. Registrar adiantamento acima do restante (ex.: R$ 99.999,00 ao captador, checkbox «Pago»
   DESMARCADO — marcado sem comprovante dá outro erro, «Anexe o comprovante…») → erro
   «não pode passar do que resta»; nada é gravado.
4. Registrar R$ 1.000,00 ao captador → aparece na lista; restante do total diminui 1.000.
5. Remover o adiantamento → pede confirmação; confirmar → some.
6. Como recepção e corretor: aba de comissão trancada, texto «Só jurídico e dono»;
   nenhum valor de comissão no HTML (`get_page_text` não contém «R$ 24.000,00»).

## F7 — Isolamento do corretor

1. Como corretor (Carlos), abrir `/gestao/vendas/V-2026-0151` (é da Juliana) →
   `nao-encontrado`, sem nome de vendedor/comprador na página.
2. Abrir `/gestao/documentos?processo=V-2026-0151` → nenhum documento daquele processo.

## F8 — Documentos

1. Como dono, `/gestao/documentos`: abas `aba-documentos`, `aba-lixeira`, `aba-sem-pdf`.
   `documento-item` com os 7 documentos ativos; lixeira com 1 («Recibo de adiantamento»).
2. Chip `chip-categoria` «Venda» → só documentos de categoria venda. «Todas» volta.
3. Busca «matrícula» em `busca-documento` → 1 item.
4. `apagar` em «RG do vendedor.pdf» → confirmação; confirmar → sai de Documentos,
   aparece na Lixeira com «Helena Duarte» e a data.
5. Na Lixeira, `restaurar` → volta para Documentos.
6. `enviar-documento` → `modal-enviar`; enviar sem arquivo → erro; com `.exe` → erro
   «Use PDF, JPG, PNG ou WEBP»; com PDF válido ligado a V-2026-0142 → item no topo.
7. Como corretor: `aba-lixeira` e botão `apagar` NÃO existem.

## F9 — Navegação processo ↔ documentos

1. Em um processo, «Documentos do processo →» abre `/gestao/documentos?processo=ID&de=processo`
   filtrado; `voltar` diz «Voltar ao processo V-…» e leva de volta.
2. Na lista, «Ver todos os documentos» abre `?de=lista`; `voltar` volta à lista.

## F10 — Responsivo e acessibilidade (smoke)

1. Viewport 375×812 (`resize_window` preset mobile): sem rolagem horizontal da página
   (`document.documentElement.scrollWidth <= innerWidth`); menu vira faixa horizontal.
2. Todos os botões e links visíveis têm altura ≥ 44 px (reportar os que não têm).
3. Tab percorre login → radio → botão entrar com foco visível; Esc fecha modais.
4. Voltar o viewport para desktop (`preset desktop`) ao terminar.

## F11 — Convite, senha forte, captcha e 2º fator

Pré-condição: login com o atalho de demonstração como `perfil-dono` ou `perfil-juridico`
(o fluxo completo de senha é testado nos passos 5 em diante).

1. Como dono, menu «Usuários e permissões» → `/gestao/usuarios`. Como jurídico o item também
   aparece; como recepção e corretor NÃO (acessar a URL redireciona para `/gestao/vendas`).
2. Em `convite-email` digitar «novo@olmi.exemplo», `convite-perfil` = Corretor, clicar
   `convite-criar` → aparece `convite-link` com `/gestao/convite/<token>` e botão copiar.
   E-mail repetido de conta existente ou e-mail inválido → mensagem de erro, sem convite.
3. Como jurídico: a opção de perfil «Dono» NÃO existe em `convite-perfil`.
4. Trocar perfil (sair), abrir o link do convite: mostra o e-mail e o perfil. Senha «abc» →
   `criar-conta` desabilitado e lista de requisitos com falhas; senha «Senha123456» ou que
   contenha «novo» → recusada; senha forte válida (ex. `Corretor#Moradi2026!`) + confirmação
   igual + `captcha` resolvido → `criar-conta` habilita; criar → vai ao login com
   `aviso-conta-criada`.
5. Reabrir o mesmo link → mensagem de convite já usado. Link com token inventado → mensagem de
   convite inválido.
6. Login com e-mail e senha corretos, sem resolver `captcha` → `entrar-senha` desabilitado.
   Resolver captcha, senha ERRADA → «E-mail ou senha incorretos» (a mesma frase para e-mail
   que não existe).
7. Senha certa → `/gestao/verificar`. Abrir `/gestao/verificar` direto, sem ter passado pela
   senha, volta para `/gestao/login`.
8. Em modo demo a `faixa-demo` mostra o código de 6 dígitos. Digitar código errado → erro; após
   5 erros → bloqueado. Código certo (em nova tentativa) → entra em `/gestao/vendas` com o nome
   do usuário no topo. `reenviar` fica desabilitado por ~60 s.
9. Recarregar a página logado → continua logado. «Trocar perfil» → volta ao login.

## Formato do relatório

Tabela `Fluxo | Passo | PASSOU/FALHOU | Observado (só se falhou)` + lista final
de falhas com URL e perfil. Não propor correção.

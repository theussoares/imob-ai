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
7. Acessar `/gestao/imoveis` → mostra a lista de imóveis (`imovel-lista`).

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
2. `concluir-etapa` está DESABILITADO e `pendencias-etapa` lista o que falta (telefone e
   e-mail da compradora, 2 documentos). Para concluir de verdade, ver o F12.
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
6. Como recepção e corretor: NÃO existe `aba-comissao` nem texto sobre comissão (nem cadeado);
   nenhum valor de comissão no HTML (`get_page_text` não contém «R$ 24.000,00»).

## F7 — Isolamento do corretor

1. Como corretor (Carlos), abrir `/gestao/vendas/V-2026-0151` (é da Juliana) →
   `nao-encontrado`, sem nome de vendedor/comprador na página.
2. Abrir `/gestao/documentos?processo=V-2026-0151` → nenhum documento daquele processo.

## F8 — Documentos

1. Como dono, `/gestao/documentos`: abas `aba-documentos`, `aba-lixeira`, `aba-sem-pdf`.
   `documento-item` com os documentos ativos (os 7 avulsos mais os arquivos dos itens de checklist
   dos processos de exemplo); lixeira com 1 («Recibo de adiantamento»).
2. Chip `chip-categoria` «Venda» → só documentos de categoria venda. «Todas» volta.
3. Busca «matrícula» em `busca-documento` → só itens cujo nome ou processo contém «matrícula».
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

## F12 — Etapas 2 a 5: dados, arquivos e conclusão

Como dono, em `/gestao/vendas/V-2026-0155` (etapa 1). Botão `requisito-exemplo` = «Anexar exemplo»
(só no modo demonstração, equivale a enviar um PDF).

1. `concluir-etapa` na etapa 1 → vai à etapa 2. `concluir-etapa` fica desabilitado e
   `pendencias-etapa` cita telefone, e-mail e «Faltam 3 documentos».
2. A lista `requisitos` tem exatamente: RG ou CNH, Certidão de nascimento ou de casamento,
   Comprovante de residência (NÃO há CPF como arquivo), cada um «Pendente», com `requisito-enviar`.
3. Preencher `pessoa-telefone` «(11) 98765-4321» e `pessoa-email`, `pessoa-salvar` → some a
   pendência de contato; botão continua desabilitado (faltam arquivos).
4. `requisito-exemplo` nos três itens → todos «Enviado»; `concluir-etapa` habilita; clicar →
   etapa 3, progresso «2 de 8», histórico com «Enviou o documento: …» (3x) e «Concluiu a etapa 2».
5. Etapa 3: mesma exigência para o comprador. Etapa 4: `valor-venal` e a lista (Matrícula atualizada,
   Comprovante do valor venal, Comprovante de água e luz); marcar `matricula-mae` e salvar troca a
   matrícula por «Matrícula-mãe» + «Projeto/prancha do imóvel».
6. Em `/gestao/vendas/V-2026-0158` (etapa 5): `fin-resumo` mostra valor da venda, soma das fontes e
   diferença; «As fontes de pagamento fecham com o valor da venda.»; a lista «Itens para conferir»
   tem Proposta (Enviado), Simulação (Enviado) e Comprovante da entrada (Pendente, com
   `requisito-enviar`). Enviar o que falta e `concluir-etapa` conclui.
7. Mudar a forma para «À vista», ZERAR a entrada e o FGTS e salvar: a lista fica só com a proposta (com entrada maior que zero o comprovante da entrada continua sendo exigido: é regra, não defeito).
8. `requisito-conferir` aparece só para recepção e dono (permissão conferir), nunca para corretor.
9. Corretor sem permissão de envio não vê `requisito-enviar`; processo encerrado não mostra
   nenhum botão de envio ou conferência.

## F13 — Abertura editável, ganho de capital, observações, cancelar e arquivar

1. Como dono, em `/gestao/vendas/V-2026-0155`, etapa 1 (clicar a 1ª do stepper): campos `abertura-*`
   preenchidos. Trocar `abertura-imovel`, marcar `abertura-preliminar` → aparece
   `abertura-preliminar-arquivo`; `abertura-preliminar-exemplo` anexa o PDF; `abertura-salvar` →
   título da página vira o novo imóvel e o histórico ganha «Atualizou os dados da abertura».
   Como corretor, `abertura-corretor` vem travado com a frase «você é sempre o vendedor».
2. Etapa 5: `fin-ganho-capital` é uma lista (Isento / Há ganho de capital / Ainda não analisado);
   com «Há ganho de capital» aparece `fin-ganho-aviso`.
3. Etapa 7 (jurídico ou dono): `obs-juridico` + `obs-salvar` gravam e registram no histórico;
   recepção e corretor veem o campo desabilitado e sem botão.
4. Etapa 8: `cancelar-venda` pede confirmação; confirmar → «Venda cancelada», somente consulta.
5. Em processo encerrado (ex.: V-2026-0133) como jurídico ou dono, `arquivar-contrato` pede
   confirmação, volta à lista e o card some. Recepção e corretor não veem o botão.
6. «Arquivados» (menu: jurídico, dono e recepção, como no protótipo; corretor não vê): só jurídico e dono têm `restaurar-contrato`; restaurar
   devolve o card à lista. Sem arquivados: `arquivados-vazio`.

## F14 — Contratos de locação (8 etapas)

Dados: 4 locações. Do Carlos (c1): L-2026-0004 (Em abertura) e L-2026-0001 (Ativa, contrato
R$ 2.500, taxa 10%, cobrança 2026-10 paga com repasse pendente). L-2026-0003 (c2, etapa 5) e
L-2026-0002 (c3, Encerrada). Menu «Contratos de locação» = `/gestao/locacao`.

1. Corretor em `/gestao/locacao`: `card-locacao` = 2. Abrir direto `/gestao/locacao/L-2026-0003`
   → `nao-encontrado`. Recepção vê 4 cards.
2. `nova-locacao`: sem locador → erro «Informe o locador.»; preenchido abre `/gestao/locacao/L-AAAA-0005`
   na etapa 1; o corretor logado fica travado no select.
3. Dono em L-2026-0003 (etapa 5): `concluir-etapa` desabilitado e `pendencias-etapa` pede garantia e
   arquivo. Salvar garantia + `requisito-exemplo` → habilita; concluir → etapa 6.
4. Etapa 6: data, responsável, `vistoria-exemplo`, salvar; concluir → etapa 7.
5. Etapa 7: valor 3000, início e fim (fim depois do início), salvar; concluir → etapa 8, status «Ativa».
   Dia de vencimento 29 → toast «O dia de vencimento deve ficar entre 1 e 28.»
6. Voltar à etapa 7: gerar cobrança da mesma competência duas vezes → segunda recusada.
   `pagar-exemplo` → «Paga» e «Repasse R$ 2.700,00 · pendente»; `repassar-exemplo` → «feito».
7. Etapa 8: `encerrar` com repasse pendente ou sem vistoria de saída → recusa; com tudo certo →
   `aviso-final` e nenhum campo editável. `renovar` antes de encerrar: `fim` +12 meses.
8. Dono/jurídico: `arquivar` só em locação encerrada; ela sai da lista e aparece em «Arquivados»
   (com «Restaurar contrato»).
9. Recepção na etapa 7 de L-2026-0001: `etapa-sem-valores` e nenhum «R$» na tela.
10. Stepper mostra os nomes da locação (Garantia, Vistoria, Contrato e financeiro…).
11. Avisos (seed ancorado em «hoje»): `card-locacao` da L-2026-0001 mostra `aviso-card` «Vencido: Aluguel de
    AAAA-MM em atraso há 3 dias. (+1)». Na tela da locação, `avisos-locacao` lista 2 `aviso`: o vencido
    (aluguel) e «Atenção: O contrato termina em 45 dias.». Pagar a cobrança em atraso (etapa 7) remove o aviso
    de aluguel. Recepção vê os mesmos avisos e nenhum «R$». Locação encerrada ou arquivada não avisa.

## F15 — Financeiro, Dashboard e Histórico (só leitura)

1. Dono em `/gestao/financeiro`: indicadores de vendas e de locações com «R$». O filtro de competência vale só
   para as locações (vendas não têm competência); trocar o mês muda cobranças e repasses.
2. Recepção e corretor: menu «Financeiro» ausente; URL direta volta ao Dashboard. Jurídico: vê os valores.
3. Dashboard (`/gestao`): contagens, itens parados há 7+ dias e avisos da locação, limitado a 6 linhas.
   Recepção vê tudo isso sem nenhum «R$».
4. `/gestao/auditoria`: eventos de vendas e locações, filtro por pessoa e por contrato; limpar filtro volta à lista inteira.

## F16 — Usuários e permissões, Configurações e Consulta cadastral

1. Dono em `/gestao/usuarios`: a matriz de permissões aparece; mudar uma célula vale na hora e sobrevive a recarregar
   a página (inclusive a rota que ficou fechada). `admin` e `convidar` do Dono não editam.
2. Outros perfis não veem a matriz.
3. `/gestao/config` (só Dono): CNPJ inválido, e-mail inválido, telefone sem DDD e percentual fora de 0–100 recusam
   com mensagem; salvar válido mostra o aviso. Venda e locação NOVAS usam os percentuais salvos; as já abertas não mudam.
4. `/gestao/consulta`: faixa «Resultado simulado» sempre visível. CPF inválido ou sem finalidade recusa.
   Consulta válida mostra resultado, limpa o campo do documento e entra no histórico com documento MASCARADO
   (`529.***.***-25`); o localStorage não guarda o CPF inteiro. Mesmo documento dá sempre o mesmo resultado.

## F17 — Imóveis (espelho do catálogo)

1. Dono ou recepção em `/gestao/imoveis`: 5 imóveis (`imovel-card`), cada um com selo do anúncio («No site») e da
   situação («Em locação» ou «Disponível»). Corretor Carlos (c1): só 2 (im-101 e im-104).
2. Corretor abrindo `/gestao/imoveis/im-102` (de outro corretor) pela URL volta para `/gestao/imoveis`.
3. Busca sem acento e sem caixa (`barracao`, `otavio`); filtros de anúncio, situação e finalidade combinam.
4. `imovel-novo` → salvar vazio mostra «Informe o título do imóvel.». Como corretor, `imovel-corretor` fica
   desabilitado com ele mesmo; como dono/recepção/jurídico, dá para escolher. O texto `imovel-contato-site` diz
   que o contato do site é o WhatsApp da imobiliária.
5. Preencher título, tipo, finalidade, preço, bairro, cidade, UF, área, quartos e proprietário → salva e abre
   `/gestao/imoveis/<id>` (im-106). Validações: preço 0, CEP de 7 dígitos, suítes acima dos quartos e UF de 1 letra
   mostram a mensagem do domínio; tipo Terreno esconde quartos/suítes/banheiros/vagas.
6. Editar e salvar sem mudar o título não acusa duplicado; usar título e referência de outro imóvel acusa.
7. `imovel-status-rapido` → «Rascunho» persiste ao recarregar; destaque e demais campos salvam.
8. Fotos: enviar 3 (`imovel-foto-input`) → 3 `imovel-foto`, uma só `imovel-foto-capa`; a 7ª é recusada
   («no máximo 6 fotos»); tornar capa, mover e remover a capa promove a primeira restante.
9. Excluir (`imovel-excluir`, confirmar): corretor exclui o dele sem locação; dono em im-101 (locação em andamento)
   é recusado com «Este imóvel tem locação em andamento…»; recepção/jurídico não veem o botão.
10. Nova locação e Abertura da locação listam só imóveis de aluguel (im-102 de venda não aparece na Nova locação).
11. Tudo persiste ao recarregar; «Restaurar demonstração» volta aos 5 imóveis de exemplo.

## Formato do relatório

Tabela `Fluxo | Passo | PASSOU/FALHOU | Observado (só se falhou)` + lista final
de falhas com URL e perfil. Não propor correção.

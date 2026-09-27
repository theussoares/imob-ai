# Chat de roteiro na landing da Moradi

**Data:** 2026-09-27

## Motivo

As duas referências analisadas em 27/09 — Kenlo (home) e Universal Software
(`/planos`) — têm o mesmo recurso no canto inferior direito: um botão fechado
com avatar e um balão que aparece sozinho depois de alguns segundos
("Quer impulsionar sua imobiliária…?", "Ficou com alguma dúvida sobre os
planos?"). Clicando, abre um chat que **não é IA**: é um roteiro de botões que
leva ao comercial.

A landing da Moradi já responde tudo isso — preço, teste, domínio —, mas em
seções que o visitante precisa rolar até achar. O chat encurta o caminho entre
a dúvida e o WhatsApp, que é o único canal de venda (não há cadastro
self-service, ver a spec da landing de 24/09).

## Escopo

- `app/components/MoradiChat.vue`: botão fechado, balão de convite e painel.
- `app/utils/moradi-roteiro.ts`: o roteiro (nós, respostas, botões) e os
  preços, que a landing passa a importar daqui.
- `test/app/moradi-roteiro.test.ts`.

## Fora do escopo, por decisão

| Fora | Por quê |
|---|---|
| **Resposta por LLM** | endpoint público pagando por mensagem, prompt injection e o risco de a IA "inventar" preço ou prazo. O roteiro mostra primeiro o que as pessoas perguntam; a IA entra depois, com esse dado |
| **Campo de texto livre** | sem LLM, texto livre é uma caixa que não responde. E seria dado de pessoa novo, que pede revisão da política de privacidade |
| **Nome e persona da IA** | a identidade ("Ipê", "Morá" etc.) ainda está em aberto. O chat fala como a Moradi até lá |
| **Foto de pessoa no avatar** | Kenlo e Universal usam foto de mulher num robô de botões. Aqui o avatar é a marca: quem responde de verdade está do outro lado do WhatsApp |
| **"Online agora"** | o roteiro está sempre disponível, mas uma pessoa não. Dizer que alguém está online seria uma promessa que ninguém cumpre às 23h |
| **Lembrar que o balão foi fechado** | exigiria `localStorage` ou cookie. A política afirma que o site não grava cookie; o custo de o balão reaparecer após recarregar a página é baixo |

## Decisões

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Preços em `moradi-roteiro.ts`, importados pela landing | preço digitado de novo no texto do chat | dois lugares com R$ 149 ficam divergentes na primeira mudança de preço; o teste confere que o texto do chat bate com a constante |
| Balão depois de 8 s **ou** ao chegar em `#planos`, o que vier primeiro, e uma vez só | só por tempo | a Universal troca o texto conforme a página; aqui é a mesma ideia por seção: em Planos, a dúvida é "qual é o meu?" |
| Toda folha do roteiro termina em ação (WhatsApp, demo ou seção) | resposta que só informa | chat que responde e para é um beco sem saída; o teste falha se algum nó não tiver saída |
| `aria-live` na conversa e Esc fecha, com o foco devolvido ao botão | painel sem gestão de foco | o painel fica sobre o conteúdo; teclado e leitor de tela precisam entrar e sair dele |

## Privacidade

Nenhum dado novo: o chat não tem campo de texto, não grava nada e só monta
links `wa.me`, que a landing já usa. A política não muda.

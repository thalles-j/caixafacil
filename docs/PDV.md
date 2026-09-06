# PDV físico e operação sem rede

## Cupons e gaveta

O cupom é não fiscal. A configuração da loja define bobina de 58 ou 80 mm,
razão social opcional e exibição de operador e forma de pagamento. O OWNER
salva essas preferências no endpoint de configurações do próprio tenant.

O botão de impressora térmica usa Web Serial em contexto seguro (HTTPS ou
localhost), com seleção explícita de uma porta compatível. O terminal deve
selecionar a velocidade configurada no equipamento. USB que não exponha uma
porta serial e navegadores sem Web Serial usam “Imprimir / salvar PDF”. Não
há serviço de impressão remoto nem recursos de rede no cupom HTML; ele também
funciona durante a interrupção de rede. Ajuste bobina e margens no diálogo do
driver. A impressão serial translitera acentos para ASCII para não depender
da página de códigos de cada modelo.

A opção de gaveta envia `ESC p 0 50 250` para o conector de gaveta da própria
impressora (pino 2, pulso de 100 ms e repouso de 500 ms). O conector não é
tratado como dispositivo separado. O fallback HTML depende do driver para
abrir a gaveta. Confirme compatibilidade elétrica e comandos no manual do
modelo. Impressão e pulso exigem ação explícita; reconectar a rede não imprime
nem abre a gaveta automaticamente. Erro serial permite tentar o botão HTML,
sem repetir automaticamente um cupom que possa já ter sido impresso.

Referências: [Web Serial, documentação Chrome](https://developer.chrome.com/docs/capabilities/serial)
e [comando ESC p, Epson](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html).

## Vendas offline

Com a sessão autenticada ainda aberta em memória, catálogo carregado e caixa
já aberto, o terminal registra vendas e emite cupons sem conexão. Fiado exige
um cliente já cadastrado. Abertura/fechamento de caixa, relatórios, configurações
e cadastro de cliente exigem rede. Reabrir o aplicativo sem rede não cria nem
restaura autenticação; depois de recarregar, entre com a mesma conta e o mesmo
operador quando a conexão voltar. As vendas já gravadas sobrevivem ao reinício.

A fila IndexedDB confirma o registro somente após concluir a transação local,
com durabilidade estrita. Se faltar espaço ou o armazenamento for bloqueado,
a operação falha e o carrinho deve permanecer aberto. Cada registro possui um
UUID imutável, tenant, ator, itens, cliente por identificador, sessão de caixa
e instante original. Tokens e senhas nunca são gravados nessa fila.

A sincronização automática ocorre na reconexão e tenta novamente a cada
30 segundos enquanto a mesma identidade está autenticada e desbloqueada.
O indicador permanece visível e informa online, offline, sincronização e
quantidade de pendências. O servidor valida a identidade esperada no payload,
deduplica por tenant/UUID e rejeita o reuso do UUID com conteúdo divergente.
Uma resposta perdida mantém a venda local e a tentativa seguinte reutiliza
o mesmo UUID. Vendas só saem da fila depois de confirmação do servidor.

**Conflitos:** não permitir estoque negativo mantém a restrição existente no
banco. Estoque insuficiente, item removido ou sessão de caixa encerrada deixam
a venda pendente; o responsável deve corrigir o estoque/reabrir a sessão e
tentar novamente. Uma rejeição interrompe o lote para manter a ordem original.
Nenhuma venda é apagada, reatribuída a outro operador ou movida para outro caixa
automaticamente. O cupom offline informa que aguarda sincronização. Não feche
o caixa com vendas pendentes no terminal. Não limpe dados do navegador até
confirmar todas as vendas no servidor. O armazenamento é local à origem e ao
perfil do navegador; apagar o perfil ou falha física do disco pode perder a fila.

O isolamento local por tenant e ator evita sincronização cruzada; IndexedDB não
é um cofre contra pessoas com acesso ao perfil/DevTools da máquina. Use um
perfil de sistema protegido em terminais compartilhados. O backend continua
autoritativo e aplica autenticação e RLS na sincronização.

## Cancelamentos e devoluções

OWNER e OPERATOR podem consultar as vendas do caixa aberto na tela de Vendas.
O cancelamento total e a devolução parcial exigem motivo e a digitação do UUID
da venda. A API bloqueia quantidade acima do saldo e venda de outro tenant. Na
mesma transação, ela recompõe estoque, reduz a entrada ou dívida e registra
ator, papel, motivo, item e quantidade na auditoria. Venda fiado com valor já
recebido precisa ter o recebimento tratado antes do cancelamento; o sistema não
apaga uma quitação silenciosamente.

Referência de persistência: [Indexed Database API 3.0, W3C](https://www.w3.org/TR/IndexedDB/).

## Roteiro de aceite em ambiente de teste

1. Entre como operador A do tenant A, abra o caixa, carregue catálogo e cliente
   e configure estoque suficiente. Anote a quantidade de vendas no servidor.
2. Desative a rede pelo DevTools ou desconecte o equipamento. Verifique o
   indicador “Offline”. Complete duas vendas (inclua uma à vista e uma fiado).
   Verifique duas pendências e imprima os cupons pelo HTML; em hardware compatível,
   teste também Web Serial, bobinas de 58/80 mm e o pulso da gaveta.
3. Restaure a conexão. Aguarde a fila zerar. Confirme exatamente duas novas vendas,
   estoque, saldo de fiado, caixa e operador originais no servidor.
4. Repita simulando perda da resposta HTTP após commit no servidor. Reconecte
   novamente: o UUID repetido deve confirmar a mesma venda, sem nova baixa.
5. Com nova venda pendente, recarregue a página. Reconecte/autentique o mesmo
   operador: a fila reaparece e sincroniza. Com operador B ou tenant B, a venda
   de A não aparece na fila de B e não é enviada sob a identidade de B.
6. Trave a sessão com pendências e reconecte: não deve haver envio. Destrave com
   o mesmo operador e confirme retomada sem perda do carrinho.
7. Cause estoque insuficiente em outro terminal antes de sincronizar ou encerre
   o caixa. A venda permanece pendente, há indicação de erro e não há efeito
   financeiro parcial. Corrija o estoque/reabra o caixa e tente novamente.
8. Simule `QuotaExceededError`/IndexedDB bloqueado: não deve exibir venda concluída
   nem limpar o carrinho. Teste razão social com `<img onerror=...>`: o cupom
   deve mostrar texto literal, sem executar script ou inserir comandos ESC/POS.

Testes automatizados cobrem persistência após reconexão do IndexedDB, isolamento
tenant/ator, lock/troca de identidade, retries com UUID constante, conflito e
falha de gravação. Hardware físico e o roteiro completo exigem homologação no
modelo de impressora e no ambiente de teste; não são simulados como aprovados.

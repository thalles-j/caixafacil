# Privacidade de clientes no CaixaFácil

Atualizado em 5 de setembro de 2026.

## Implementação

- Termos de Uso (`/termos`) e Política de Privacidade (`/privacidade`) são rascunhos técnicos. **Revisão jurídica obrigatória antes de publicar os textos como definitivos**. Completar identificação do fornecedor/controladores, canal de privacidade, bases legais por finalidade, subprocessadores, transferências e prazos de retenção.
- Consentimento de cobrança via WhatsApp é opcional e versionado. O operador apresenta o texto ao titular e marca uma caixa inicialmente desmarcada somente após sua manifestação expressa. A API armazena timestamp do servidor, versão e identidade autenticada de quem registrou. A auditoria existente registra concessão/revogação e preparação da cobrança sem guardar telefone ou mensagem.
- `POST /api/privacy/customers/:id/whatsapp-charge` valida consentimento atual e telefone dentro da transação do tenant, calcula o saldo pendente no servidor e prepara o link. A abertura do WhatsApp permite ao operador conferir e enviar a mensagem; a API não faz envio automático. Nenhum link é preparado sem autorização. Revogação impede novas preparações; uma mensagem já enviada ou link copiado não pode ser retirado de outro serviço.
- `POST /api/privacy/customers/:id/whatsapp-consent` recebe `granted` e `version`. A revogação é aceita sem exigir a versão atual. Alterar o telefone invalida a autorização anterior por trigger no banco. Cliente anonimizado não pode receber novo consentimento.
- `DELETE /api/privacy/customers/:id/personal-data` exige OWNER e `confirmationId` igual ao identificador do cliente. Atualiza o cadastro, vendas e movimentações vinculadas e grava auditoria na mesma transação. Remove nome, telefone, e-mail e observações; substitui descrições livres de vendas/movimentações ligadas ao cliente. Não exclui valores, quantidades, datas ou vínculos usados nos relatórios. O cadastro recebe o nome genérico “Cliente anonimizado” e permanece sem dados de contato.
- As novas colunas pertencem a `customers`, cuja RLS forçada continua vigente. Consultas usam o `business_id` revalidado pelo servidor e o UUID da entidade; IDs enviados pelo cliente não selecionam outro tenant. Operador pode registrar/revogar consentimento e preparar cobrança, mas não anonimizar.

## Limites e operação

Esta funcionalidade remove identificadores diretos dos campos vinculados conhecidos; não constitui certificação de anonimização irreversível ou de conformidade integral. Datas, contexto da compra e cópias externas podem permitir identificação indireta. O controlador deve analisar necessidade, bases legais e retenção aplicável antes de atender cada pedido; a manutenção de registros financeiros não determina, por si, uma obrigação legal universal.

O solicitante pede atendimento ao estabelecimento, que confirma sua identidade e registra a ação. Não copiar nome/telefone em motivos de auditoria, descrições de itens, observações de caixa ou campos sem vínculo com o cliente: esses campos não permitem localizar automaticamente todos os dados de uma pessoa. Solicitações referentes a esses campos precisam de análise manual do controlador.

Backups físicos do provedor, arquivos exportados anteriormente, impressos, mensagens enviadas e dispositivos desconectados exigem procedimento de retenção/eliminação próprio. O backup lógico exporta somente o negócio ativo e registra esse escopo no arquivo. Backups novos contêm os registros já anonimizados. Um tombstone segregado e imutável guarda somente negócio, UUID técnico do cliente e data da anonimização; ele não integra o backup lógico nem o apagamento dos dados operacionais e impede que uma restauração antiga recupere PII. Consentimentos importados também são sempre invalidados. A equipe deve verificar essa regra em seu ciclo de restauração antes de produção.

## Validação

Os testes de handlers verificam bloqueio sem consentimento/versão atual, revogação, cálculo de saldo pelo servidor, recusa de OPERATOR na anonimização e isolamento por tenant em IDs manipulados. O cenário de anonimização compara valores antes/depois e verifica limpeza de descrições vinculadas. Rodar também contra PostgreSQL de teste com RLS para comprovar as restrições no banco real.

## Fontes oficiais para revisão

- [Lei nº 13.709/2018 — texto compilado](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm): manifestação demonstrável e revogação do consentimento; direitos dos titulares e hipóteses de conservação devem ser avaliados por finalidade.
- [ANPD — Direitos dos Titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares): acesso, correção, eliminação e revogação, com as exceções legais pertinentes.

Os textos das telas são propostas de produto e não transcrição das fontes ou parecer jurídico.

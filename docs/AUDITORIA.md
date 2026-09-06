# Auditoria atual do CaixaFácil

Atualizada em 6 de setembro de 2026. Este documento descreve a arquitetura atual;
ele substitui a auditoria histórica feita quando o projeto ainda era somente
frontend.

## Arquitetura

- Monorepo npm com workspaces independentes em `frontend/` e `backend/`.
- Frontend React 19, TypeScript, Vite, Tailwind e React Router.
- Backend Express/TypeScript com autenticação JWT, access token em memória e
  refresh token em cookie HTTP-only.
- PostgreSQL serverless no Neon, com schema Prisma, migrations SQL e RLS
  forçada. O tenant operacional é `business_id`; `user_id` identifica o login
  e permanece nas tabelas operacionais apenas para compatibilidade da migração.
- Um login OWNER administra até três negócios por `business_memberships`. O
  limite fica centralizado em `MAX_BUSINESSES_PER_OWNER` e protegido também
  por uma função e um trigger nomeados no banco.
- Catálogo, configurações, clientes, vendas, itens, fiado, despesas fixas,
  sessões de caixa e movimentações persistidos no banco. `localStorage` mantém
  somente cache de interface e preferência de tema; o servidor é autoritativo.

## Funcionalidades verificadas

- Cadastro, login, logout, troca e recuperação de senha com token de uso único.
- Papéis OWNER e OPERATOR por estabelecimento. O dono gerencia credenciais e
  ativações; o operador acessa catálogo, caixa, clientes e vendas do caixa aberto,
  inclusive devoluções confirmadas, sem relatórios,
  configurações, backup ou administração da conta.
- Painel `/admin` protegido por papel, com gestão de contas de clientes,
  alteração de nome, redefinição de senha, suspensão, exclusão, estatísticas
  agregadas e log de auditoria. Ações sensíveis exigem redigitar o nome alvo.
- Onboarding para produtos, serviços ou ambos.
- Tela “Meus negócios” com criação, onboarding independente, troca imediata,
  renomeação, arquivamento confirmado pelo nome e resumos diário/mensal.
- Visão consolidada com seleção dos negócios, indicadores financeiros e
  extrato diário, semanal ou mensal calculado pelo backend.
- Catálogo com categorias, estoque, código de barras, ordenação e paginação.
- Caixa, vendas à vista/fiado, baixa de estoque, clientes e fechamento corrigível.
- Cupom não fiscal ESC/POS em 58/80 mm, pulso de gaveta, fallback HTML/PDF,
  fila offline idempotente e estorno total ou parcial com recomposição atômica.
- Entradas, saídas, gorjetas, pendências identificáveis, contas fixas e fiado.
- Cobrança de fiado por WhatsApp somente com consentimento explícito vigente;
  anonimização de clientes preserva os agregados financeiros.
- Relatórios e histórico, backup lógico completo da conta e restauração atômica.
- Testes automatizados, TypeScript/lint e CI em `.github/workflows/`.
- Seed de demonstração atualizada para o modelo multi-negócio: três negócios e
  um operador por OWNER, dados históricos, consentimentos LGPD e eventos de
  auditoria com `business_id`, ator, papel, alvo e detalhes sem dados sensíveis.

## Segurança e operação

- Senhas são armazenadas somente como hash; a política exige no mínimo sete
  caracteres, uma maiúscula e um caractere especial.
- Rotas sensíveis possuem rate limit, respostas de autenticação não ficam em
  cache e a API envia cabeçalhos de segurança.
- Sessões de estabelecimento travam após o período configurado de inatividade;
  o desbloqueio exige a senha do ator e preserva o carrinho local.
- Logs JSON correlacionados e Sentry usam lista positiva sem corpos, tokens ou
  dados pessoais. O monitor externo de `/api/health` possui alerta simulado.
- O health check confirma também a conexão com o PostgreSQL. Rotas ausentes,
  JSON malformado, payload excessivo, UUIDs e períodos inválidos retornam JSON
  com códigos HTTP 404, 400 ou 413, sem devolver detalhes internos do erro.
- O backup é validado por formato, versão e proprietário antes de substituir os
  dados, dentro de uma transação.
- Frontend e backend podem ser hospedados em origens diferentes com CORS
  explícito, HTTPS e refresh cookie `SameSite=None; Secure`.
- O papel admin não altera as policies RLS e não é aceito nas rotas de negócio;
  consultas administrativas são limitadas a metadados e agregações definidas.
- Administradores gerenciam o próprio nome e senha em uma rota exclusiva; as
  rotas de conta dos tenants rejeitam o papel admin para evitar caminhos de
  alteração sem confirmação e auditoria.
- O servidor revalida em toda requisição autenticada se o ator possui vínculo
  OWNER ou OPERATOR ativo com o `business_id` do token. Somente depois define
  `app.current_business_id` com `SET LOCAL`; IDs enviados pelo cliente nunca
  configuram o tenant diretamente.
- OPERATOR pertence a um único negócio, não recebe lista nem totais de outros
  negócios e não pode trocar o contexto ativo. Chaves estrangeiras compostas
  por `business_id` bloqueiam referências entre negócios do mesmo dono.
- O cache do frontend e a fila offline usam `business_id` na identidade. Ao
  trocar de negócio, o estado visível é limpo antes de carregar o novo tenant.

## Dependências externas e limites conhecidos

- Produção exige configurar Neon, segredos JWT e um webhook/provedor de e-mail.
- A entrega real do alerta de uptime exige URL pública e segredos no GitHub;
  execute `workflow_dispatch` com `simulate_failure` antes do deploy.
- Frequências semanal/mensal são preferências persistidas; disparo automático
  requer um agendador externo. O botão “Enviar agora” faz envio real pelo backend.
- Leitura por câmera usa `BarcodeDetector` quando o navegador oferece suporte;
  há fallback para digitação e leitores USB/Bluetooth.
- Open Finance foi retirado da interface até haver escolha de provedor,
  consentimento do usuário e tratamento regulatório; não há simulação ativa.
- A exportação é um backup lógico somente do negócio ativo, identificado por
  `scope: active-business`; a restauração exige o mesmo proprietário e substitui
  apenas esse negócio. Backups físicos continuam responsabilidade do provedor.
- Relatórios usam a data local de São Paulo de cada venda ou movimentação. Uma
  sessão que atravessa a virada do mês não entra inteira em um mês: cada
  movimentação usa `occurred_at`, e cada venda usa `sold_at`.

## Validação recomendada antes do deploy

```bash
npm ci
npm run prisma:validate --workspace backend
npm run lint
npm test
npm run build
```

Depois, aplique o schema no Neon, valide `/api/health`, teste CORS/cookie entre
as URLs públicas e execute um ciclo de exportação/restauração em conta de teste.
Consulte `docs/PDV.md`, `docs/LGPD.md` e `docs/OBSERVABILIDADE.md` para os roteiros
de homologação que dependem de hardware e serviços externos.

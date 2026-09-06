# Auditoria atual do CaixaFácil

Atualizada em 16 de agosto de 2026. Este documento descreve a arquitetura atual;
ele substitui a auditoria histórica feita quando o projeto ainda era somente
frontend.

## Arquitetura

- Monorepo npm com workspaces independentes em `frontend/` e `backend/`.
- Frontend React 19, TypeScript, Vite, Tailwind e React Router.
- Backend Express/TypeScript com autenticação JWT, access token em memória e
  refresh token em cookie HTTP-only.
- PostgreSQL serverless no Neon, com schema Prisma, migration SQL, isolamento
  por `user_id`, RLS forçada e transações por tenant.
- Catálogo, configurações, clientes, vendas, itens, fiado, despesas fixas,
  sessões de caixa e movimentações persistidos no banco. `localStorage` mantém
  somente cache de interface e preferência de tema; o servidor é autoritativo.

## Funcionalidades verificadas

- Cadastro, login, logout, troca e recuperação de senha com token de uso único.
- Painel `/admin` protegido por papel, com gestão de contas de clientes,
  alteração de nome, redefinição de senha, suspensão, exclusão, estatísticas
  agregadas e log de auditoria. Ações sensíveis exigem redigitar o nome alvo.
- Onboarding para produtos, serviços ou ambos.
- Catálogo com categorias, estoque, código de barras, ordenação e paginação.
- Caixa, vendas à vista/fiado, baixa de estoque, clientes e fechamento corrigível.
- Entradas, saídas, gorjetas, pendências identificáveis, contas fixas e fiado.
- Cobrança de fiado por WhatsApp quando o cliente possui telefone válido.
- Relatórios e histórico, backup lógico completo da conta e restauração atômica.
- Testes automatizados, TypeScript/lint e CI em `.github/workflows/`.

## Segurança e operação

- Senhas são armazenadas somente como hash; a política exige no mínimo sete
  caracteres, uma maiúscula e um caractere especial.
- Rotas sensíveis possuem rate limit, respostas de autenticação não ficam em
  cache e a API envia cabeçalhos de segurança.
- O backup é validado por formato, versão e proprietário antes de substituir os
  dados, dentro de uma transação.
- Frontend e backend podem ser hospedados em origens diferentes com CORS
  explícito, HTTPS e refresh cookie `SameSite=None; Secure`.
- O papel admin não altera as policies RLS e não é aceito nas rotas de negócio;
  consultas administrativas são limitadas a metadados e agregações definidas.
- Administradores gerenciam o próprio nome e senha em uma rota exclusiva; as
  rotas de conta dos tenants rejeitam o papel admin para evitar caminhos de
  alteração sem confirmação e auditoria.

## Dependências externas e limites conhecidos

- Produção exige configurar Neon, segredos JWT e um webhook/provedor de e-mail.
- Frequências semanal/mensal são preferências persistidas; disparo automático
  requer um agendador externo. O botão “Enviar agora” faz envio real pelo backend.
- Leitura por câmera usa `BarcodeDetector` quando o navegador oferece suporte;
  há fallback para digitação e leitores USB/Bluetooth.
- Open Finance foi retirado da interface até haver escolha de provedor,
  consentimento do usuário e tratamento regulatório; não há simulação ativa.
- A exportação é um backup lógico dos dados da conta, não um snapshot físico de
  toda a instância Neon. Backups físicos continuam responsabilidade do provedor.

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

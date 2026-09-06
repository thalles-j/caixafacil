# CaixaFácil

Aplicação organizada como um monorepo npm, com frontend e backend independentes.

## Estrutura

```text
.
├── .claude/
├── .github/workflows/
├── backend/
│   ├── prisma/
│   │   ├── migrations/0001_init/migration.sql
│   │   ├── migrations/0002_admin_panel/migration.sql
│   │   ├── migrations/0003_admin_account_management/migration.sql
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── account/
│   │   ├── auth/
│   │   ├── business/
│   │   ├── email.ts
│   │   └── scripts/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   ├── AUDITORIA.md
│   └── RELATORIO_CENTRAL_DE_AJUDA.md
├── frontend/
│   ├── public/
│   ├── src/
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
├── package.json
└── package-lock.json
```

## Instalação

Uma única instalação na raiz prepara os dois workspaces:

```bash
npm install
```

Copie os exemplos de ambiente e preencha os segredos:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

O backend usa Neon Postgres. A URL pooled deve ficar em `DATABASE_URL`; uma
`DATABASE_URL_UNPOOLED` pode ser informada apenas para operações de schema.

## Desenvolvimento

```bash
npm run dev
```

Esse comando inicia os dois workspaces, com logs identificados e coloridos:

- `[FRONTEND]`: Vite em `http://localhost:5173`;
- `[BACKEND]`: API em `http://localhost:3000`.

Também é possível iniciar somente um lado com `npm run dev:frontend` ou
`npm run dev:backend`.

## Banco e Prisma

O modelo declarativo fica em `backend/prisma/schema.prisma`. A migration SQL
preserva recursos específicos do Postgres usados pelo projeto, como RLS,
triggers, views, índices parciais e extensões.

```bash
npm run db:schema
npm run db:seed
```

A seed é não destrutiva por padrão. Para recriar os dados de demonstração no
banco configurado, use explicitamente:

```bash
npm run db:seed -- --reset
```

Esse modo remove dados do banco apontado por `DATABASE_URL`; use somente em
desenvolvimento.

Cada uma das três contas de demonstração recebe um catálogo com 30 itens,
clientes, fiados em diferentes situações, despesas fixas, movimentações e mais
de 15 fechamentos. Também são criados dados históricos de janeiro a abril para
testar filtros, paginação e relatórios. As credenciais são:

- `thalles@gmail.com` / `Teste123@`;
- `gustavo@gmail.com` / `Teste123@`;
- `marco@gmail.com` / `Teste123@`.

O seed também cria três contas administrativas puras, sem catálogo, clientes,
vendas, fiado ou caixas de demonstração:

- `thalles@admin.com` / `Admin123@`;
- `gustavo@admin.com` / `Admin123@`;
- `marco@admin.com` / `Admin123@`.

Contas com papel `admin` entram em `/admin`. O painel lista somente metadados e
contagens agregadas das contas `client`; administradores não recebem acesso às
transações individuais dos tenants. Suspensões e exclusões são registradas em
`admin_audit_logs`, e a suspensão incrementa `token_version` para revogar as
sessões existentes.

No detalhe de cada cliente, o administrador pode alterar o nome, redefinir a
senha, ativar, suspender ou excluir a conta. Todas as ações exigem digitar o
nome exibido no modal, são confirmadas novamente pelo backend e deixam registro
de auditoria. O próprio admin altera seu nome e senha em `/admin/configuracoes`.

As operações autenticadas usam `withTenantTransaction` em
`backend/src/db.ts`, mantendo o tenant dentro da transação e garantindo as
políticas de RLS no pool do Neon.

## Recuperação de conta

Na tela de login, escolha **Esqueci minha senha** e informe o e-mail da conta.
O link gerado é válido por 30 minutos e só pode ser usado uma vez. Ao concluir
a troca, as sessões persistentes anteriores são revogadas.

Em desenvolvimento, a própria API devolve o token e a tela avança diretamente
para a definição da nova senha. Em produção, configure `FRONTEND_URL`,
`EMAIL_WEBHOOK_URL`, `EMAIL_WEBHOOK_TOKEN` e `EMAIL_FROM`. O webhook recebe
`{ from, to, subject, text, html? }` e deve encaminhar a mensagem pelo provedor
escolhido. Nunca habilite a devolução do token com `NODE_ENV=production`.

Antes de publicar esta versão, aplique o schema para criar os campos de
revogação de sessão:

```bash
npm run db:schema
```

## Validação

```bash
npm run lint
npm test
npm run build
npm run prisma:validate --workspace backend
```

Não há configuração de Docker local. O banco é remoto e gerenciado pelo fluxo
Prisma + Neon.

## Hospedagem separada

Frontend e backend não dependem de execução no mesmo servidor:

1. publique `backend/` como serviço Node, execute `npm run build --workspace backend`
   na raiz e inicie com `npm start --workspace backend`;
2. defina no backend `CORS_ORIGIN=https://seu-front.example`,
   `FRONTEND_URL=https://seu-front.example` e `REFRESH_COOKIE_SAME_SITE=none`;
3. gere o frontend com `VITE_API_URL=https://sua-api.example/api`;
4. mantenha HTTPS nas duas origens, exigido pelo cookie `SameSite=None; Secure`;
5. aplique `npm run db:schema` no deploy ou habilite
   `RUN_DB_MIGRATIONS_ON_STARTUP=true` quando a plataforma garantir apenas uma
   instância executando a migração.

## Suporte

A página pública `/suporte` pode ser acessada antes do login. Usuários com
sessão também encontram **Falar com o suporte** em Configurações. O formulário
usa o mesmo adaptador de e-mail da recuperação de conta, tem limite por IP e
encaminha a resposta para o endereço configurado em `SUPPORT_EMAIL`.

Defina também `VITE_SUPPORT_EMAIL` no frontend para exibir um link direto de
e-mail caso o provedor esteja temporariamente indisponível.

A API expõe `GET /api/health` para health checks. O frontend é um build estático
e não precisa acessar diretamente o PostgreSQL.

# Observabilidade e disponibilidade

Atualizado em 5 de setembro de 2026.

Backend e frontend aceitam DSNs separados do Sentry. Defina `SENTRY_DSN` e
`APP_RELEASE` na API; no build web, use `VITE_SENTRY_DSN` e
`VITE_APP_RELEASE`. A integração desativa coleta automática de PII e aplica uma
lista positiva: eventos retêm somente tipo do erro, localização de código sem
caminho absoluto, ambiente, release, `request_id` e `trace_id`. Corpos, cookies,
tokens, e-mails, telefones, mensagens e parâmetros de URL não entram nos logs.

A API gera uma linha JSON por requisição com método, template da rota, status,
duração e correlação. Ela aceita `X-Request-ID` apenas quando for UUID válido e
propaga `X-Request-ID`, `X-Trace-ID` e `traceparent`. Erros 5xx recebem um ID do
Sentry quando o DSN estiver configurado. O frontend usa a mesma correlação nas
requisições observadas.

O workflow `.github/workflows/uptime.yml` roda fora da aplicação a cada cinco
minutos e consulta `GET /api/health` três vezes. Para habilitá-lo, configure:

- variável `UPTIME_ENABLED=true`;
- variável `UPTIME_HEALTH_URL=https://sua-api.example/api/health`;
- segredos `UPTIME_ALERT_EMAIL`, `EMAIL_WEBHOOK_URL`,
  `EMAIL_WEBHOOK_TOKEN` e `EMAIL_FROM`.

O disparo manual possui `simulate_failure`; ele percorre o caminho real do
provedor e marca o assunto como simulação. Execute-o antes do deploy e confirme
o recebimento. Sem URL pública e credenciais do webhook, só é possível validar
localmente a lógica, não a entrega externa do alerta.

Os testes automatizados verificam remoção de dados sensíveis, correlação,
sucesso do health check, tentativas e alerta simulado. A retenção e os acessos
do projeto Sentry e do provedor de e-mail devem ser definidos pela operação.

type EmailMessage = {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(message: EmailMessage): Promise<void> {
  const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
  if (!webhookUrl) {
    throw Object.assign(new Error('O provedor de e-mail ainda não foi configurado.'), {
      status: 503,
      code: 'EMAIL_NOT_CONFIGURED',
    });
  }
  const parsedUrl = new URL(webhookUrl);
  if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
    throw Object.assign(new Error('EMAIL_WEBHOOK_URL precisa usar HTTPS em produção.'), { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(parsedUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.EMAIL_WEBHOOK_TOKEN
          ? { Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? 'CaixaFácil <noreply@localhost>',
        ...message,
      }),
    });
    if (!response.ok) {
      throw Object.assign(new Error('O provedor de e-mail recusou o envio.'), {
        status: 502,
        code: 'EMAIL_PROVIDER_ERROR',
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

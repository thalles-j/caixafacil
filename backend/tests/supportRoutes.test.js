import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('../src/email.ts', () => ({ sendEmail: mocks.sendEmail }));

import { contactSupportHandler } from '../src/support/routes.ts';

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

beforeEach(() => {
  mocks.sendEmail.mockReset();
  mocks.sendEmail.mockResolvedValue(undefined);
  process.env.SUPPORT_EMAIL = 'atendimento@example.com';
});

describe('contato com o suporte', () => {
  it('encaminha a mensagem com o e-mail de resposta', async () => {
    const res = response();
    await contactSupportHandler({
      body: {
        name: 'Ana',
        email: 'ANA@example.com',
        category: 'suspensao',
        message: 'Preciso revisar o acesso da minha conta.',
      },
    }, res, vi.fn());

    expect(res.statusCode).toBe(202);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'atendimento@example.com',
      replyTo: 'ana@example.com',
      subject: '[Suporte CaixaFácil] Conta suspensa',
    }));
  });

  it('rejeita e-mail e assunto inválidos sem tentar enviar', async () => {
    const invalidEmail = response();
    await contactSupportHandler({
      body: { name: 'Ana', email: 'invalido', category: 'acesso', message: 'Ajuda' },
    }, invalidEmail, vi.fn());
    expect(invalidEmail.statusCode).toBe(400);

    const invalidCategory = response();
    await contactSupportHandler({
      body: { name: 'Ana', email: 'ana@example.com', category: 'senha-no-corpo', message: 'Ajuda' },
    }, invalidCategory, vi.fn());
    expect(invalidCategory.statusCode).toBe(400);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('neutraliza o campo-armadilha usado por bots', async () => {
    const res = response();
    await contactSupportHandler({ body: { website: 'https://spam.example' } }, res, vi.fn());
    expect(res.statusCode).toBe(202);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});

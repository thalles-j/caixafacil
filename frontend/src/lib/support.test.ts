// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { contactSupportRequest } from './support';

afterEach(() => vi.restoreAllMocks());

describe('contactSupportRequest', () => {
  it('envia os dados ao endpoint público de suporte', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ message: 'Mensagem enviada.' }),
      { status: 202, headers: { 'Content-Type': 'application/json' } },
    ));
    const data = {
      name: 'Ana',
      email: 'ana@example.com',
      category: 'tecnico' as const,
      message: 'A página não abriu.',
    };

    await expect(contactSupportRequest(data)).resolves.toEqual({ message: 'Mensagem enviada.' });
    expect(fetchMock).toHaveBeenCalledWith('/api/support/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('expõe a mensagem segura devolvida pela API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ error: 'E-mail inválido.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(contactSupportRequest({
      name: 'Ana',
      email: 'invalido',
      category: 'acesso',
      message: 'Ajuda',
    })).rejects.toThrow('E-mail inválido.');
  });
});

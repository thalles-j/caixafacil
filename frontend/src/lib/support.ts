const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type SupportCategory = 'acesso' | 'suspensao' | 'financeiro' | 'dados' | 'tecnico' | 'outro';

export type SupportMessage = {
  name: string;
  email: string;
  category: SupportCategory;
  message: string;
  website?: string;
};

export async function contactSupportRequest(data: SupportMessage): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/support/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error ?? 'Não foi possível enviar sua mensagem.');
  }
  return body;
}

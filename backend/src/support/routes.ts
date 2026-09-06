import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendEmail } from '../email.js';
import { rateLimit } from '../security.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CATEGORY_LABELS = {
  acesso: 'Acesso à conta',
  suspensao: 'Conta suspensa',
  financeiro: 'Caixa e finanças',
  dados: 'Dados e segurança',
  tecnico: 'Problema técnico',
  outro: 'Outro assunto',
} as const;

type SupportCategory = keyof typeof CATEGORY_LABELS;
type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${field} é obrigatório.`), { status: 400 });
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw Object.assign(new Error(`${field} aceita no máximo ${maxLength} caracteres.`), { status: 400 });
  }
  return text;
}

export const supportRouter = Router();
const contactLimit = rateLimit('support-contact', 5, 60 * 60 * 1000);

export const contactSupportHandler: AsyncRoute = async (req, res) => {
  // Campo invisível para bots. A resposta neutra evita ensinar o filtro.
  if (typeof req.body?.website === 'string' && req.body.website.trim()) {
    return res.status(202).json({ message: 'Mensagem recebida. Retornaremos pelo e-mail informado.' });
  }

  const name = requiredText(req.body?.name, 'Nome', 100);
  const email = requiredText(req.body?.email, 'E-mail', 254).toLowerCase();
  const message = requiredText(req.body?.message, 'Mensagem', 2_000);
  const category = String(req.body?.category ?? '') as SupportCategory;

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  if (!(category in CATEGORY_LABELS)) {
    return res.status(400).json({ error: 'Assunto de suporte inválido.' });
  }

  const categoryLabel = CATEGORY_LABELS[category];
  const supportEmail = process.env.SUPPORT_EMAIL ?? 'suporte@caixafacil.app';
  await sendEmail({
    to: supportEmail,
    replyTo: email,
    subject: `[Suporte CaixaFácil] ${categoryLabel}`,
    text: [
      `Nome: ${name}`,
      `E-mail para retorno: ${email}`,
      `Assunto: ${categoryLabel}`,
      '',
      message,
    ].join('\n'),
  });

  return res.status(202).json({ message: 'Mensagem enviada. Retornaremos pelo e-mail informado.' });
};

supportRouter.post('/contact', contactLimit, asyncRoute(contactSupportHandler));

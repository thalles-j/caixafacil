import { describe, expect, it } from 'vitest';
import {
  ADMIN_BUSINESS_TABLES_TO_CLEAR, ADMIN_PASSWORD, ADMIN_USERS, DEMO_BUSINESSES,
  DEMO_USERS, OPERATOR_PASSWORD,
} from '../prisma/seedData.js';

describe('seed administrativo', () => {
  it('define as três contas admin com a senha solicitada', () => {
    expect(ADMIN_PASSWORD).toBe('Admin123@');
    expect(ADMIN_USERS).toEqual([
      { name: 'Thalles', email: 'thalles@admin.com', role: 'admin' },
      { name: 'Gustavo', email: 'gustavo@admin.com', role: 'admin' },
      { name: 'Marco', email: 'marco@admin.com', role: 'admin' },
    ]);
  });

  it('representa os três negócios e as credenciais de operador da demonstração rica', () => {
    expect(OPERATOR_PASSWORD).toBe('Operador123@');
    expect(DEMO_BUSINESSES).toHaveLength(3);
    expect(new Set(DEMO_BUSINESSES.map((business) => business.key)).size).toBe(3);
    expect(DEMO_BUSINESSES.every((business) => business.name && business.category && business.offering)).toBe(true);
  });

  it('não mistura e-mails admin com clientes e limpa todas as tabelas de demonstração', () => {
    expect(new Set([...ADMIN_USERS, ...DEMO_USERS].map((user) => user.email)).size).toBe(6);
    expect(ADMIN_BUSINESS_TABLES_TO_CLEAR).toEqual(expect.arrayContaining([
      'products', 'categories', 'customers', 'sales', 'sale_items', 'credit_sales', 'cash_sessions', 'transactions', 'fixed_expenses',
    ]));
  });
});

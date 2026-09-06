export const DEMO_PASSWORD = 'Teste123@';
export const ADMIN_PASSWORD = 'Admin123@';

export const DEMO_USERS = [
  { name: 'Thalles', email: 'thalles@gmail.com', factor: 1 },
  { name: 'Gustavo', email: 'gustavo@gmail.com', factor: 1.15 },
  { name: 'Marco', email: 'marco@gmail.com', factor: 0.9 },
];

export const ADMIN_USERS = [
  { name: 'Thalles', email: 'thalles@admin.com', role: 'admin' },
  { name: 'Gustavo', email: 'gustavo@admin.com', role: 'admin' },
  { name: 'Marco', email: 'marco@admin.com', role: 'admin' },
];

export const ADMIN_BUSINESS_TABLES_TO_CLEAR = [
  'transactions', 'credit_sales', 'sale_items', 'sales', 'cash_sessions',
  'fixed_expenses', 'products', 'categories', 'customers', 'business_settings',
];

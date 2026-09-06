import { describe, expect, it } from 'vitest';
import { postLoginPath } from './roles';

describe('redirecionamento após login', () => {
  it('leva administradores para /admin', () => expect(postLoginPath('admin')).toBe('/admin'));
  it('leva clientes para /dashboard', () => expect(postLoginPath('client')).toBe('/dashboard'));
});

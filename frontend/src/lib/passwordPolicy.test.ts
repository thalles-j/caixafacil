import { describe, expect, it } from 'vitest';
import { passwordPolicyError } from './passwordPolicy';

describe('política de senha', () => {
  it('aceita uma senha com sete caracteres, maiúscula e caractere especial', () => {
    expect(passwordPolicyError('Teste1@')).toBeNull();
    expect(passwordPolicyError('Teste123@')).toBeNull();
  });

  it('rejeita senha curta', () => {
    expect(passwordPolicyError('Tes1@')).toContain('7 caracteres');
  });

  it('rejeita senha sem maiúscula', () => {
    expect(passwordPolicyError('teste123@')).toContain('maiúscula');
  });

  it('rejeita senha sem caractere especial', () => {
    expect(passwordPolicyError('Teste123')).toContain('especial');
  });
});

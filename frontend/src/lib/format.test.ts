import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatDateInput,
  parseDateInput,
  parseMoney,
  sanitizeDateInput,
  sanitizeIntegerInput,
  sanitizeMoneyInput,
  todayISO,
} from './format';

describe('parseMoney', () => {
  it('remove o separador de milhar e converte a vírgula decimal', () => {
    expect(parseMoney('1.500,00')).toBe(1500);
  });

  it('aceita valores sem separador de milhar', () => {
    expect(parseMoney('150,50')).toBe(150.5);
  });

  it('aceita valores inteiros sem vírgula', () => {
    expect(parseMoney('150')).toBe(150);
  });

  it('retorna NaN para entradas inválidas', () => {
    expect(parseMoney('abc')).toBeNaN();
  });

  it('remove múltiplos separadores de milhar', () => {
    expect(parseMoney('1.234.567,89')).toBe(1234567.89);
  });
});

describe('datas em formulários brasileiros', () => {
  it('exibe e converte uma data sem depender do idioma do navegador', () => {
    expect(formatDateInput('2026-08-28')).toBe('28/08/2026');
    expect(parseDateInput('28/08/2026')).toBe('2026-08-28');
  });

  it('rejeita datas inexistentes', () => {
    expect(parseDateInput('31/02/2026')).toBeNull();
  });

  it('aplica a máscara durante a digitação', () => {
    expect(sanitizeDateInput('28082026')).toBe('28/08/2026');
  });
});

describe('sanitização de campos numéricos', () => {
  it('remove letras e limita valores monetários a duas casas decimais', () => {
    expect(sanitizeMoneyInput('R$ 1a.234,567x')).toBe('1234,56');
  });

  it('mantém somente números em quantidades inteiras', () => {
    expect(sanitizeIntegerInput('1e2 unidades')).toBe('12');
  });
});

describe('todayISO', () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    // força o horário de Brasília independente do fuso da máquina que roda o teste
    process.env.TZ = 'America/Sao_Paulo';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  it('retorna a data local correta durante o dia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T10:00:00-03:00'));
    expect(todayISO()).toBe('2026-08-03');
  });

  it('não vira o dia à noite mesmo já tendo virado em UTC (21h-23h59 BRT)', () => {
    // 2026-08-03T21:30 em Brasília (UTC-3) equivale a 2026-08-04T00:30 UTC —
    // toISOString().slice(0, 10) reportaria erroneamente "2026-08-04"
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T21:30:00-03:00'));
    expect(todayISO()).toBe('2026-08-03');
  });

  it('não vira o dia poucos minutos antes da meia-noite local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T23:59:00-03:00'));
    expect(todayISO()).toBe('2026-08-03');
  });

  it('vira o dia corretamente exatamente na meia-noite local', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-04T00:00:00-03:00'));
    expect(todayISO()).toBe('2026-08-04');
  });
});

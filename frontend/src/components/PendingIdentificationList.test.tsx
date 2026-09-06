// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PendingIdentificationList from './PendingIdentificationList';

const resolverPendenciaMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const configuracaoMock = vi.hoisted(() => ({ oferta: undefined as 'produtos' | 'servicos' | 'ambos' | undefined }));

vi.mock('../context/AppDataContext', () => ({
  useAppData: () => ({
    data: {
      config: configuracaoMock.oferta ? { oferta: configuracaoMock.oferta } : null,
      produtos: [
        {
          id: 'produto-1',
          type: 'product',
          nome: 'Café',
          precoVenda: 8,
          quantidade: 12,
        },
        {
          id: 'servico-1',
          type: 'service',
          nome: 'Entrega',
          precoVenda: 15,
          duracao: '30 min',
        },
      ],
    },
    resolverPendenciaNoBanco: resolverPendenciaMock,
  }),
}));

afterEach(() => {
  cleanup();
  resolverPendenciaMock.mockClear();
  configuracaoMock.oferta = undefined;
});

describe('PendingIdentificationList', () => {
  it('seleciona o produto concreto e o envia para abater a pendência', async () => {
    render(
      <PendingIdentificationList
        lancamentos={[
          {
            id: 'pendencia-1',
            data: '2026-08-15',
            tipo: 'entrada',
            descricao: 'Venda sem identificação',
            valor: 8,
            formaPagamento: 'dinheiro',
            tipoEntrada: 'produto',
            identificacaoPendente: true,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Selecionar produto' }), {
      target: { value: 'produto-1' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Unidades do produto' }), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abater pendência' }));

    expect(screen.getByRole('heading', { name: 'Confirmar abatimento' })).toBeTruthy();
    expect(screen.getByText('Valor do catálogo')).toBeTruthy();
    expect(resolverPendenciaMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e abater' }));

    await waitFor(() => {
      expect(resolverPendenciaMock).toHaveBeenCalledWith('pendencia-1', 'produto', 'produto-1', 3, 24);
    });
  });

  it('permite manter o valor originalmente lançado durante a confirmação', async () => {
    render(
      <PendingIdentificationList
        lancamentos={[
          {
            id: 'pendencia-manter',
            data: '2026-08-15',
            tipo: 'entrada',
            descricao: 'Café anotado rapidamente',
            valor: 1,
            formaPagamento: 'dinheiro',
            tipoEntrada: 'produto',
            identificacaoPendente: true,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Selecionar produto' }), {
      target: { value: 'produto-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abater pendência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manter lançado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e abater' }));

    await waitFor(() => {
      expect(resolverPendenciaMock).toHaveBeenCalledWith(
        'pendencia-manter',
        'produto',
        'produto-1',
        1,
        undefined,
      );
    });
  });

  it('permite digitar um valor corrigido diferente da sugestão do catálogo', async () => {
    render(
      <PendingIdentificationList
        lancamentos={[
          {
            id: 'pendencia-corrigir',
            data: '2026-08-15',
            tipo: 'entrada',
            descricao: 'Venda anotada',
            valor: 1,
            formaPagamento: 'pix',
            tipoEntrada: 'produto',
            identificacaoPendente: true,
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Selecionar produto' }), {
      target: { value: 'produto-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abater pendência' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Novo valor da pendência' }), {
      target: { value: '12,50' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e abater' }));

    await waitFor(() => {
      expect(resolverPendenciaMock).toHaveBeenCalledWith(
        'pendencia-corrigir',
        'produto',
        'produto-1',
        1,
        12.5,
      );
    });
  });

  it('troca para serviço e mostra apenas serviços do catálogo', () => {
    render(
      <PendingIdentificationList
        lancamentos={[
          {
            id: 'pendencia-2',
            data: '2026-08-15',
            tipo: 'entrada',
            descricao: 'Entrada pendente',
            valor: 15,
            formaPagamento: 'pix',
            tipoEntrada: 'produto',
            identificacaoPendente: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Serviço' }));
    const seletor = screen.getByRole('combobox', { name: 'Selecionar serviço' });

    expect(seletor.textContent).toContain('Entrega');
    expect(seletor.textContent).not.toContain('Café');
  });

  it('em negócio de serviços não oferece produto e normaliza uma pendência antiga', () => {
    configuracaoMock.oferta = 'servicos';
    render(
      <PendingIdentificationList
        lancamentos={[
          {
            id: 'pendencia-servico',
            data: '2026-08-15',
            tipo: 'entrada',
            descricao: 'Entrada antiga como produto',
            valor: 15,
            formaPagamento: 'pix',
            tipoEntrada: 'produto',
            identificacaoPendente: true,
          },
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Produto' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Serviço' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gorjeta' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Selecionar serviço' })).toBeTruthy();
  });

  it('em negócio de produtos não oferece serviço', () => {
    configuracaoMock.oferta = 'produtos';
    render(
      <PendingIdentificationList
        lancamentos={[
          {
            id: 'pendencia-produto',
            data: '2026-08-15',
            tipo: 'entrada',
            descricao: 'Entrada de produto',
            valor: 8,
            formaPagamento: 'dinheiro',
            tipoEntrada: 'produto',
            identificacaoPendente: true,
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Produto' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Serviço' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gorjeta' })).toBeTruthy();
  });

  it('mostra no máximo 15 pendências por página', () => {
    const lancamentos = Array.from({ length: 16 }, (_, index) => ({
      id: `pendencia-${index + 1}`,
      data: '2026-08-15',
      tipo: 'saida' as const,
      descricao: `Pendência ${index + 1}`,
      valor: index + 1,
      formaPagamento: 'dinheiro' as const,
      identificacaoPendente: true,
    }));

    render(<PendingIdentificationList lancamentos={lancamentos} />);

    expect(screen.getByText('Pendência 1')).toBeTruthy();
    expect(screen.queryByText('Pendência 16')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(screen.getByText('Pendência 16')).toBeTruthy();
    expect(screen.queryByText('Pendência 1')).toBeNull();
  });
});

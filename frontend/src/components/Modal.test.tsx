// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from './Modal';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function ConteudoComErro(): never {
  throw new Error('Falha simulada no formulário');
}

function ModalDeTeste() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>Abrir</button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Editar item">
        <input aria-label="Nome" />
      </Modal>
    </>
  );
}

function ModaisEmpilhados() {
  const [primeiroAberto, setPrimeiroAberto] = useState(true);
  const [segundoAberto, setSegundoAberto] = useState(true);
  return (
    <>
      <Modal open={primeiroAberto} onClose={() => setPrimeiroAberto(false)} title="Primeiro modal">
        Conteúdo
      </Modal>
      <Modal open={segundoAberto} onClose={() => setSegundoAberto(false)} title="Segundo modal">
        Conteúdo
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('abre e fecha repetidamente sem deixar o body bloqueado', () => {
    render(<ModalDeTeste />);

    for (let indice = 0; indice < 12; indice += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
      expect(screen.getByRole('dialog', { name: 'Editar item' })).toBeTruthy();
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    }

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('fecha com Escape e restaura a rolagem', () => {
    render(<ModalDeTeste />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('mantém a rolagem bloqueada até o último modal empilhado fechar', () => {
    render(<ModaisEmpilhados />);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Primeiro modal' })).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('isola falhas do conteúdo sem derrubar o restante da aplicação', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Modal open onClose={() => undefined} title="Modal com falha">
        <ConteudoComErro />
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'Modal com falha' })).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Não foi possível abrir este conteúdo.')).toBeTruthy();
  });
});

import { GearSix, SignOut, Storefront, UsersThree } from '@phosphor-icons/react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-paper-raised shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ledger text-paper">
              <Storefront size={22} weight="fill" />
            </div>
            <div className="min-w-0">
              <p className="font-display text-lg font-bold">CaixaFácil Admin</p>
              <p className="truncate text-xs text-ink-soft">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NavLink
              to="/admin"
              end
              className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'text-ink-soft hover:bg-line/30 hover:text-ink'}`}
            >
              <UsersThree size={18} /> <span className="hidden sm:inline">Clientes</span>
            </NavLink>
            <NavLink
              to="/admin/configuracoes"
              className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'text-ink-soft hover:bg-line/30 hover:text-ink'}`}
              aria-label="Configurações administrativas"
            >
              <GearSix size={18} /> <span className="hidden sm:inline">Configurações</span>
            </NavLink>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft transition hover:bg-line/30 hover:text-ink"
            >
              <SignOut size={18} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><Outlet /></main>
    </div>
  );
}

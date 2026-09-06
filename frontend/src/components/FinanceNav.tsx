import { NavLink } from 'react-router-dom';

const links = [
  { to: '/financas', label: 'Finanças', end: true },
  { to: '/movimentacoes', label: 'Movimentações', end: false },
  { to: '/entradas', label: 'Entradas', end: false },
  { to: '/despesas', label: 'Saídas', end: false },
];

export default function FinanceNav() {
  return (
    <nav className="scrollbar-hide mb-6 mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="Áreas financeiras">
      {links.map(({ to, label, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `selection-option shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${
              isActive
                ? 'border-ledger bg-ledger text-paper'
                : 'border-line bg-paper-raised text-ink-soft hover:border-ledger/40 hover:text-ink'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

import { Outlet, NavLink } from 'react-router';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/agenda', label: 'Agenda', icon: '📅' },
  { path: '/atendimentos', label: 'Atendimentos', icon: '💅' },
  { path: '/clientes', label: 'Clientes', icon: '👩' },
  { path: '/financeiro', label: 'Financeiro', icon: '💰' },
  { path: '/estoque', label: 'Estoque', icon: '📦' },
  { path: '/marketing', label: 'Marketing', icon: '📣' },
  { path: '/diretoria', label: 'Diretoria', icon: '📈' },
  { path: '/configuracoes', label: 'Config.', icon: '⚙️' },
];

export default function Layout() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-5 border-b border-gray-200">
          <h1 className="font-title text-2xl text-primary font-semibold">
            Dona Menina
          </h1>
          <p className="text-sm text-gray-500">Beauty Bar</p>
        </div>
        <nav className="flex-1 py-3">
          {menuItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-base transition-colors ${
                  isActive
                    ? 'bg-primary-light text-primary font-medium'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <NavLink
            to="/comissoes"
            className={({ isActive }) =>
              `flex items-center gap-3 px-5 py-3 text-base rounded transition-colors ${
                isActive ? 'bg-primary-light text-primary font-medium' : 'text-gray-500 hover:bg-gray-50'
              }`
            }
          >
            <span className="text-lg">📋</span>
            Comissoes
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 p-8">
        <div className="max-w-5xl w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

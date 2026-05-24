import { createBrowserRouter, RouterProvider } from 'react-router';
import { ToastProvider } from './components/Toast.jsx';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard/index.jsx';
import Clientes from './pages/Clientes/index.jsx';
import Agenda from './pages/Agenda/index.jsx';
import Atendimentos from './pages/Atendimentos/index.jsx';
import NovoAtendimento from './pages/Atendimentos/NovoAtendimento.jsx';
import EditarAtendimento from './pages/Atendimentos/EditarAtendimento.jsx';
import Comissoes from './pages/Atendimentos/Comissoes.jsx';
import Estoque from './pages/Estoque/index.jsx';
import Financeiro from './pages/Financeiro/index.jsx';
import Marketing from './pages/Marketing/index.jsx';
import Configuracoes from './pages/Configuracoes/index.jsx';

const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Dashboard },
      { path: 'clientes', Component: Clientes },
      { path: 'agenda', Component: Agenda },
      { path: 'atendimentos', Component: Atendimentos },
      { path: 'atendimentos/novo', Component: NovoAtendimento },
      { path: 'atendimentos/:id/editar', Component: EditarAtendimento },
      { path: 'comissoes', Component: Comissoes },
      { path: 'estoque', Component: Estoque },
      { path: 'financeiro', Component: Financeiro },
      { path: 'marketing', Component: Marketing },
      { path: 'configuracoes', Component: Configuracoes },
    ],
  },
]);

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}

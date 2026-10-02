import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/ui';
import Add from './pages/Add';
import AppShell from './pages/AppShell';
import Assistant from './pages/Assistant';
import Auth from './pages/Auth';
import Budgets from './pages/Budgets';
import Dashboard from './pages/Dashboard';
import Insights from './pages/Insights';
import Landing from './pages/Landing';
import Transactions from './pages/Transactions';

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        {/* Hash routing keeps the site deployable on any static host with no server rewrites. */}
        <HashRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/signin" element={<Auth initialMode="signIn" />} />
            <Route path="/signup" element={<Auth initialMode="signUp" />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="add" element={<Add />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="budgets" element={<Budgets />} />
              <Route path="insights" element={<Insights />} />
              <Route path="assistant" element={<Assistant />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  );
}

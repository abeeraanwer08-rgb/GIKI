import { NavLink, Navigate, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar, Button, Logo, Spinner } from '../components/ui';

const NAV = [
  { to: '/app', label: 'Home', icon: '🏠', end: true },
  { to: '/app/add', label: 'Add', icon: '➕' },
  { to: '/app/transactions', label: 'Activity', icon: '🧾' },
  { to: '/app/budgets', label: 'Budgets', icon: '🎯' },
  { to: '/app/insights', label: 'Insights', icon: '📈' },
  { to: '/app/assistant', label: 'Assistant', icon: '💬' },
];

export default function AppShell() {
  const { status, user, signOut } = useAuth();

  if (status === 'loading') {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}><Spinner /></div>;
  }
  if (status === 'signedOut') return <Navigate to="/signin" replace />;
  if (status === 'unverified') return <Navigate to="/verify" replace />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand"><Logo /> HissabAI</Link>
        <nav aria-label="Main" style={{ display: 'grid', gap: 4 }}>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
              <span className="i" aria-hidden="true">{n.icon}</span>{n.label === 'Activity' ? 'Transactions' : n.label === 'Home' ? 'Dashboard' : n.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-user">
            <Avatar name={user?.name ?? ''} />
            <div><b>{user?.name}</b><span className="faint" style={{ fontSize: 12 }}>{user?.email}</span></div>
          </div>
          <Button variant="ghost" small onClick={signOut}>Sign out</Button>
        </div>
      </aside>

      <main className="main"><Outlet /></main>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="i" aria-hidden="true">{n.icon}</span>{n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

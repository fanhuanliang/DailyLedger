import { NavLink, Link, Outlet } from 'react-router-dom';

const sheets = ['Dashboard', 'Records', 'Accounts', 'Categories', 'Budgets', 'Goals', 'Reminders', 'Reports'] as const;

export function pathForSheet(sheet: string): string {
  return sheet === 'Dashboard' ? '/' : `/${sheet.toLowerCase()}`;
}

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">D</span>DailyLedger
        </Link>
        <p className="sidebar-caption">A shared view of your money.</p>
        <nav aria-label="Ledger sheets">
          {sheets.map((sheet, index) => (
            <NavLink key={sheet} to={pathForSheet(sheet)} end>
              <span className="nav-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              {sheet}
            </NavLink>
          ))}
        </nav>
        <div className="household">
          <span className="household-mark" aria-hidden="true">H</span>
          <div><strong>Your household</strong><small>Home network · USD</small></div>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <span className="topbar-label">A calmer way to keep track.</span>
          <Link className="primary-button" to="/records?new=1">
            <span aria-hidden="true">＋</span> Add transaction
          </Link>
        </div>
        <main id="main-content">
          <Outlet />
        </main>
        <footer>DailyLedger <span>Made for your everyday.</span></footer>
      </div>
    </div>
  );
}

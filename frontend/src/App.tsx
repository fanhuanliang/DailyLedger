import { RemindersPage } from './pages/RemindersPage';
import { GoalsPage } from './pages/GoalsPage';
import { BudgetsPage } from './pages/BudgetsPage';
import { Route, Routes, Link } from 'react-router-dom';
import { Layout, pathForSheet } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { RecordsPage } from './pages/RecordsPage';
import { ReportsPage } from './pages/ReportsPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path={pathForSheet('Dashboard')} element={<DashboardPage />} />
        <Route path={pathForSheet('Records')} element={<RecordsPage />} />
        <Route path={pathForSheet('Accounts')} element={<AccountsPage />} />
        <Route path={pathForSheet('Categories')} element={<CategoriesPage />} />
        <Route path={pathForSheet('Budgets')} element={<BudgetsPage />} />
        <Route path={pathForSheet('Goals')} element={<GoalsPage />} />
        <Route path={pathForSheet('Reminders')} element={<RemindersPage />} />
        <Route path={pathForSheet('Reports')} element={<ReportsPage />} />
        <Route path="*" element={<section className="panel"><h1>Page not found</h1><Link to="/">Back to Dashboard</Link></section>} />
      </Route>
    </Routes>
  );
}

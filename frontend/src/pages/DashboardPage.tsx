import { Link } from 'react-router-dom';
import { PageHeading } from '../components/PageHeading';

export function DashboardPage() {
  return (
    <>
      <PageHeading title="Dashboard" tagline="A little clarity for your everyday money." />
      <section className="welcome-card">
        <div>
          <span className="eyebrow">A FRESH START</span>
          <h2>Make room for what matters.</h2>
          <p>One place for your shared finances. Start with an account, then record your first transaction.</p>
          <Link className="secondary-button" to="/accounts">Set up your accounts <span aria-hidden="true">→</span></Link>
        </div>
        <div className="ledger-art" aria-hidden="true">
          <div className="art-page"><span>DailyLedger</span><i /><i /><i /></div>
          <div className="art-dot" />
        </div>
      </section>
      <section className="panel empty-state">
        <span className="empty-icon" aria-hidden="true">↗</span>
        <h2>Reports are coming soon</h2>
        <p className="muted">Income, spending, and budget summaries arrive with the Insights stage, calculated from your real records so nothing shown here is a placeholder total.</p>
        <p className="stage-note">Use Accounts, Categories, and Records to start building your ledger now.</p>
      </section>
    </>
  );
}

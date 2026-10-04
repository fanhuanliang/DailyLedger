import { PageHeading } from '../components/PageHeading';

export function ComingSoonPage({ name }: { name: string }) {
  return (
    <>
      <PageHeading title={name} tagline="A little clarity for your everyday money." />
      <section className="panel empty-state">
        <span className="empty-icon" aria-hidden="true">＋</span>
        <h2>Your {name.toLowerCase()}, together</h2>
        <p className="muted">This sheet is ready for the next implementation stage.</p>
        <p className="stage-note">Foundation preview · no financial data has been added.</p>
      </section>
    </>
  );
}

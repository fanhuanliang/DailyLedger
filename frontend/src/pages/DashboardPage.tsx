import { InsightsView } from '../components/InsightsView';
import { PageHeading } from '../components/PageHeading';

export function DashboardPage() {
  return (
    <>
      <PageHeading title="Dashboard" tagline="A little clarity for your everyday money." />
      <InsightsView />
    </>
  );
}

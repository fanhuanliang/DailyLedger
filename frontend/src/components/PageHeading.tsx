export function PageHeading({ title, tagline }: { title: string; tagline: string }) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">YOUR HOUSEHOLD, IN VIEW</p>
        <h1>{title}</h1>
        <p className="muted">{tagline}</p>
      </div>
      <span className="currency-badge">USD only</span>
    </header>
  );
}

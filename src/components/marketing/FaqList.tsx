interface FaqItem {
  q: string;
  a: string;
}

// Shared accordion markup for FAQ content — used by the homepage's short
// FAQ section and the full /faq page's topic groups, so both stay visually
// and behaviorally identical (same <details> semantics, same styling).
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="mk-faq">
      {items.map((f) => (
        <details className="mk-faq-item" key={f.q}>
          <summary>
            {f.q}
            <span className="mk-faq-icon" aria-hidden="true">+</span>
          </summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

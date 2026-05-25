import { Section } from "@/components/ui";

/** Designed empty-shell for screens that are scaffolded but not yet built out. */
export function Placeholder({ title, sub, note }: { title: string; sub?: string; note?: string }) {
  return (
    <Section title={title} sub={sub}>
      <div className="card">
        <div className="empty">{note ?? "Dit scherm wordt in een volgende fase uitgewerkt."}</div>
      </div>
    </Section>
  );
}

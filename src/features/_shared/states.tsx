export function Loading({ label = "Laden…" }: { label?: string }) {
  return (
    <div className="loading-row">
      <div className="spinner" />
      {label}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : "Er ging iets mis.";
  return (
    <div className="error-banner">
      Kon gegevens niet laden: {msg}
      <div className="text-xs mt-1">
        Tip: zijn de database-migraties al toegepast op het Supabase-project?
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

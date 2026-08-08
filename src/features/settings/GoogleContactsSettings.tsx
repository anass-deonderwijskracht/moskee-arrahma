import { useState } from "react";
import { Card, Badge, Btn, Icon, Stat, Toggle, type BadgeKind } from "@/components/ui";
import { Loading } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useContactSync, useSyncRuns, type SyncAction, type SyncResult } from "@/data/googleContacts";

const ACTION: Record<SyncAction, { label: string; kind: BadgeKind }> = {
  create: { label: "Nieuw", kind: "success" },
  update: { label: "Naam wijzigt", kind: "info" },
  unchanged: { label: "Ongewijzigd", kind: "default" },
  merge: { label: "Samenvoegen", kind: "accent" },
  conflict: { label: "Conflict", kind: "danger" },
};

const stamp = (iso: string) => new Date(iso).toLocaleString("nl-NL", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

/** Koppeling met Google Contacts: eerst controleren, dan pas doorvoeren. */
export function GoogleContactsSettings() {
  const toast = useToast();
  const sync = useContactSync();
  const { data: runs, isLoading: runsLoading } = useSyncRuns();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [hideUnchanged, setHideUnchanged] = useState(true);
  const [merge, setMerge] = useState(true);

  const run = (dryRun: boolean) => {
    if (!dryRun) {
      const c = result?.counts;
      const lines = [
        `${(c?.created ?? 0) + (c?.updated ?? 0) + (c?.merged ?? 0)} contact(en) aanmaken, hernoemen of samenvoegen in Google Contacts.`,
        c?.deleted ? `Daarbij worden ${c.deleted} dubbele contacten VERWIJDERD (30 dagen terug te halen uit de prullenbak van Google Contacts).` : "",
        "Dit is direct zichtbaar op alle gekoppelde telefoons. Doorgaan?",
      ].filter(Boolean);
      if (!confirm(lines.join("\n\n"))) return;
    }
    sync.mutate({ dryRun, merge }, {
      onSuccess: (r) => {
        setResult(r);
        const { created, updated, unchanged, merged, deleted, conflicts, failed } = r.counts;
        toast(dryRun
          ? `Controle klaar: ${created} nieuw, ${updated} hernoemen, ${merged} samenvoegen, ${unchanged} ongewijzigd`
          : `Doorgevoerd: ${created} aangemaakt, ${updated} hernoemd, ${merged} samengevoegd (${deleted} opgeruimd)${failed ? `, ${failed} mislukt` : ""}${conflicts ? `, ${conflicts} overgeslagen` : ""}`);
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Sync mislukt"),
    });
  };

  const rows = (result?.plan ?? []).filter((r) => !hideUnchanged || r.action !== "unchanged");
  const changeCount = (result?.counts.created ?? 0) + (result?.counts.updated ?? 0) + (result?.counts.merged ?? 0);

  return (
    <div className="flex-col gap-4">
      <Card
        title={<><Icon name="phone" size={14} /> Google Contacts</>}
        sub="Oudercontacten krijgen de naam “Ahmed Ouahabi Klas 1-2-3 AO-26 ✅” — de klassen van de kinderen, het schooljaar (HF voor hifdh) en de inschrijfstatus."
        action={
          <div className="flex gap-2">
            <Btn icon="eye" disabled={sync.isPending} onClick={() => run(true)}>
              {sync.isPending ? "Bezig…" : "Controleren"}
            </Btn>
            <Btn kind="primary" icon="upload" disabled={sync.isPending || !result || changeCount === 0} onClick={() => run(false)}>
              Doorvoeren
            </Btn>
          </div>
        }
      >
        <div className="text-sm text-subtle">
          <b>Controleren</b> vergelijkt de database met Google en laat zien wat er zou veranderen, zonder iets te schrijven.
          Pas <b>Doorvoeren</b> past de contacten daadwerkelijk aan. De naam komt uit het tabblad <b>Ouders</b>
          (of uit de aanmelding zolang een gezin nog niet definitief is), met de klassen, het schooljaar en de
          status erachter — een naam die in Google is aangepast wordt dus overschreven.
        </div>
        <div className="flex items-center gap-3 mt-3" style={{ flexWrap: "wrap" }}>
          <Toggle checked={merge} onChange={setMerge} label="Dubbele contacten samenvoegen"
            title="Meerdere contacten met hetzelfde nummer worden teruggebracht tot één" />
          <span className="text-xs text-subtle" style={{ flex: 1, minWidth: 240 }}>
            {merge
              ? "Het nieuwste contact blijft, gegevens van de andere worden erin getrokken en die worden verwijderd. Verwijderde contacten staan nog 30 dagen in de prullenbak van Google Contacts."
              : "Nummers met meerdere contacten worden overgeslagen en als conflict gemeld."}
          </span>
        </div>

        {sync.isPending && <div className="mt-3"><Loading label="Bezig met vergelijken…" /></div>}

        {result && (
          <>
            <div className="stat-grid mt-4">
              <Stat icon="plus" label="Nieuw aan te maken" value={result.counts.created} />
              <Stat icon="edit" label="Naam wijzigt" value={result.counts.updated} />
              <Stat icon="copy" label="Samenvoegen" value={result.counts.merged}
                sub={result.counts.deleted ? `${result.counts.deleted} dubbele worden opgeruimd` : "geen dubbelen"} />
              <Stat icon="check" label="Ongewijzigd" value={result.counts.unchanged} />
              <Stat icon="flag" label="Aandacht nodig" value={result.counts.conflicts + result.counts.skipped + result.counts.failed}
                sub={`${result.counts.conflicts} conflict · ${result.counts.skipped} zonder nummer`} />
            </div>

            {result.dryRun && changeCount > 0 && (
              <div className="text-sm mt-3" style={{ padding: "10px 12px", background: "var(--warn-soft)", borderRadius: 8 }}>
                Dit was een controle — er is nog <b>niets</b> naar Google geschreven.
              </div>
            )}

            <div className="flex items-center justify-between mt-4 mb-2" style={{ flexWrap: "wrap", gap: 8 }}>
              <span className="text-xs text-subtle font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {rows.length} regel(s)
              </span>
              <Toggle checked={hideUnchanged} onChange={setHideUnchanged} label="Verberg ongewijzigde" />
            </div>

            {rows.length === 0 ? <div className="empty">Niets te doen — alles staat al goed in Google.</div> : (
              <div style={{ maxHeight: 460, overflowY: "auto" }}>
                <table className="table">
                  <thead><tr>
                    <th>Actie</th><th>Nu in Google</th><th>Wordt</th><th>Telefoon</th><th>Kind(eren)</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const a = ACTION[r.action];
                      return (
                        <tr key={r.phone + r.to}>
                          <td><Badge kind={r.error ? "danger" : a.kind}>{r.error ? "Mislukt" : a.label}</Badge></td>
                          <td className="text-sm">
                            {r.from ?? <span className="text-subtle">— bestaat nog niet —</span>}
                            {r.deletes?.length ? (
                              <div className="text-xs mt-1" style={{ color: "var(--danger)" }}>
                                wordt opgeruimd: {r.deletes.join(", ")}
                              </div>
                            ) : null}
                          </td>
                          <td className="text-sm font-semibold">{r.to}</td>
                          <td className="text-sm font-mono">{r.phone}</td>
                          <td className="text-xs text-subtle">{r.children.join(", ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {rows.some((r) => r.error) && (
              <div className="text-xs mt-2" style={{ color: "var(--danger)" }}>
                {rows.filter((r) => r.error).map((r) => <div key={r.phone}>{r.to}: {r.error}</div>)}
              </div>
            )}

            {result.noPhone.length > 0 && (
              <div className="text-xs text-subtle mt-3">
                <b>Zonder bruikbaar telefoonnummer</b> (overgeslagen): {result.noPhone.join(", ")}
              </div>
            )}
          </>
        )}
      </Card>

      <Card title={<><Icon name="activity" size={14} /> Sync-historie</>} sub="Elke controle en doorvoering wordt vastgelegd">
        {runsLoading ? <Loading /> : (runs ?? []).length === 0 ? <div className="empty">Nog niet gedraaid.</div> : (
          <table className="table">
            <thead><tr>
              <th>Wanneer</th><th>Soort</th><th style={{ textAlign: "right" }}>Nieuw</th>
              <th style={{ textAlign: "right" }}>Hernoemd</th><th style={{ textAlign: "right" }}>Opgeruimd</th>
              <th>Door</th><th>Resultaat</th>
            </tr></thead>
            <tbody>
              {(runs ?? []).map((r) => (
                <tr key={r.id}>
                  <td className="text-sm">{stamp(r.started_at)}</td>
                  <td>{r.dry_run ? <Badge>Controle</Badge> : <Badge kind="primary">Doorgevoerd</Badge>}</td>
                  <td className="num text-sm" style={{ textAlign: "right" }}>{r.created}</td>
                  <td className="num text-sm" style={{ textAlign: "right" }}>{r.updated}</td>
                  <td className="num text-sm" style={{ textAlign: "right" }}>{r.deleted ?? 0}</td>
                  <td className="text-sm text-muted">{r.run_by_name ?? "—"}</td>
                  <td>{r.ok
                    ? <Badge kind="success" dot>Gelukt</Badge>
                    : <span title={r.error ?? ""}><Badge kind="danger" dot>{r.error ? r.error.slice(0, 60) : "Mislukt"}</Badge></span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

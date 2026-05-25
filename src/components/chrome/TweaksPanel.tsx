import { useState } from "react";
import { Icon, Select } from "@/components/ui";
import type { Tweaks } from "./useTweaks";

type Seg<T extends string> = { value: T; label: string };

function SegRow<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Seg<T>[]; onChange: (v: T) => void;
}) {
  return (
    <div className="tweaks-row">
      <span>{label}</span>
      <div className="seg">
        {options.map((o) => (
          <button key={o.value} className={value === o.value ? "active" : ""} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TweaksPanel({ tweaks, set }: { tweaks: Tweaks; set: <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="tweaks-fab" title="Weergave-opties" onClick={() => setOpen(true)}>
        <Icon name="settings" size={18} />
      </button>
    );
  }

  return (
    <div className="tweaks-panel" role="dialog" aria-label="Weergave-opties">
      <div className="tw-head">
        <b>Weergave</b>
        <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setOpen(false)} aria-label="Sluiten">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="tweaks-sect">Uiterlijk</div>
      <SegRow label="Thema" value={tweaks.theme} onChange={(v) => set("theme", v)}
        options={[{ value: "light", label: "Licht" }, { value: "dark", label: "Donker" }]} />
      <SegRow label="Dichtheid" value={tweaks.density} onChange={(v) => set("density", v)}
        options={[{ value: "comfortable", label: "Comfortabel" }, { value: "compact", label: "Compact" }]} />
      <div className="tweaks-row">
        <span>Accent palet</span>
        <Select value={tweaks.accent} onChange={(e) => set("accent", e.target.value as Tweaks["accent"])}>
          <option value="petrol">Petrol-blauw (standaard)</option>
          <option value="emerald">Smaragdgroen</option>
          <option value="indigo">Indigo paars</option>
          <option value="charcoal">Antraciet &amp; koraal</option>
        </Select>
      </div>
      <div className="tweaks-sect">Navigatie</div>
      <SegRow label="Lay-out" value={tweaks.navigation} onChange={(v) => set("navigation", v)}
        options={[{ value: "sidebar", label: "Zijbalk" }, { value: "topnav", label: "Boven" }]} />
    </div>
  );
}

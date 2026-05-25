import { Fragment } from "react";
import { Icon } from "@/components/ui";

export function TopBar({ title, breadcrumb }: { title: string; breadcrumb?: string[] }) {
  return (
    <header className="topbar">
      <div className="flex-col">
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="crumbs">
            {breadcrumb.map((c, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="sep"><Icon name="chevronRight" size={11} /></span>}
                <span>{c}</span>
              </Fragment>
            ))}
          </div>
        )}
        <h1>{title}</h1>
      </div>
      <div className="search">
        <span className="icon"><Icon name="search" size={14} /></span>
        <input placeholder="Zoek leerling, klas, aanmelding…" />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" title="Meldingen">
        <Icon name="bell" size={16} />
        <span className="dot" />
      </button>
    </header>
  );
}

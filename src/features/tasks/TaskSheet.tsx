import { useEffect, useState } from "react";
import { Badge, Btn, Icon, Select } from "@/components/ui";
import { useToast } from "@/components/chrome/Toast";
import type { AppUser } from "@/data/users";
import {
  useUpdateTask, useDeleteTask, useAddSubtask, useUpdateSubtask, useDeleteSubtask,
  TASK_COLUMNS, PRIORITIES, PRIORITY_LABEL, type Task,
} from "@/data/tasks";

const lbl = { fontSize: 11, color: "var(--fg-subtle)", display: "block", marginBottom: 4 } as const;

/** Taakdetail als zijpaneel. Alle velden bewerken inline en slaan op bij blur/change. */
export function TaskSheet({ task, users, onClose }: { task: Task; users: AppUser[]; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateTask();
  const del = useDeleteTask();
  const addSub = useAddSubtask();
  const updateSub = useUpdateSubtask();
  const delSub = useDeleteSubtask();
  const [newSub, setNewSub] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (patch: Partial<Task>) => update.mutate({ id: task.id, patch }, { onError: () => toast("Opslaan mislukt") });

  const subs = task.task_subtasks ?? [];
  const done = subs.filter((s) => s.done).length;

  const addSubtask = () => {
    const label = newSub.trim();
    if (!label) return;
    addSub.mutate({ taskId: task.id, label, position: subs.length },
      { onSuccess: () => setNewSub(""), onError: () => toast("Toevoegen mislukt") });
  };

  const onDelete = () => {
    if (!confirm(`Taak “${task.title}” verwijderen? Ook de subtaken verdwijnen.`)) return;
    del.mutate(task.id, { onSuccess: () => { toast("Taak verwijderd"); onClose(); }, onError: () => toast("Verwijderen mislukt") });
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: 24 }}>
          <div className="flex justify-between items-start mb-4">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-xs text-subtle mb-1 flex items-center gap-2">
                Taak
                <Badge kind={task.status === "done" ? "success" : task.status === "doing" ? "info" : "default"} dot>
                  {TASK_COLUMNS.find((c) => c.id === task.status)?.title ?? task.status}
                </Badge>
              </div>
              <input className="input" defaultValue={task.title} style={{ fontSize: 18, fontWeight: 600 }}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== task.title) save({ title: v }); }} />
            </div>
            <button className="btn ghost sm" onClick={onClose} aria-label="Sluiten" style={{ marginLeft: 8 }}><Icon name="x" size={14} /></button>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Beschrijving</label>
            <textarea className="textarea" rows={4} defaultValue={task.description ?? ""} placeholder="Waar gaat deze taak over?"
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (task.description ?? "")) save({ description: v || null }); }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div>
              <label style={lbl}>Status</label>
              <Select value={task.status} onChange={(e) => save({ status: e.target.value })}>
                {TASK_COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </div>
            <div>
              <label style={lbl}>Prioriteit</label>
              <Select value={task.priority} onChange={(e) => save({ priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </div>
            <div>
              <label style={lbl}>Einddatum</label>
              <input className="input" type="date" defaultValue={task.due_date ?? ""}
                onBlur={(e) => { const v = e.target.value || null; if (v !== task.due_date) save({ due_date: v }); }} />
            </div>
            <div>
              <label style={lbl}>Toegewezen aan</label>
              <Select value={task.assignee_id ?? ""} onChange={(e) => save({ assignee_id: e.target.value || null })}>
                <option value="">— niemand —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
              </Select>
            </div>
          </div>

          {/* ---- Subtaken ---- */}
          <div style={{ marginBottom: 20 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-subtle font-semibold" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>Subtaken</div>
              {subs.length > 0 && <span className="text-xs text-subtle num">{done}/{subs.length}</span>}
            </div>
            <div className="flex-col gap-1">
              {subs.map((s) => (
                <div key={s.id} className="flex items-center gap-2" style={{ padding: "6px 8px", background: "var(--bg-sunken)", borderRadius: 8 }}>
                  <input type="checkbox" checked={s.done} aria-label={s.label}
                    onChange={(e) => updateSub.mutate({ id: s.id, patch: { done: e.target.checked } }, { onError: () => toast("Opslaan mislukt") })} />
                  <input className="input" defaultValue={s.label} style={{ flex: 1, border: "none", background: "transparent", textDecoration: s.done ? "line-through" : undefined, color: s.done ? "var(--fg-subtle)" : undefined }}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) updateSub.mutate({ id: s.id, patch: { label: v } }, { onError: () => toast("Opslaan mislukt") }); }} />
                  <button className="btn ghost sm" aria-label="Subtaak verwijderen" onClick={() => delSub.mutate(s.id, { onError: () => toast("Verwijderen mislukt") })}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
              {subs.length === 0 && <div className="text-xs text-subtle">Nog geen subtaken.</div>}
            </div>
            <div className="flex gap-2 mt-2">
              <input className="input" value={newSub} placeholder="Subtaak toevoegen…" style={{ flex: 1 }}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }} />
              <Btn icon="plus" onClick={addSubtask} disabled={!newSub.trim() || addSub.isPending}>Toevoegen</Btn>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <Btn kind="danger" icon="trash" disabled={del.isPending} onClick={onDelete}>Taak verwijderen</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

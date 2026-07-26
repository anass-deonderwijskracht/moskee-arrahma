import { useMemo, useState } from "react";
import { Section, Btn, Icon, Badge, Avatar, Select, type BadgeKind } from "@/components/ui";
import { Modal, Field, ModalFooter } from "@/components/ui/Modal";
import { Loading, ErrorState } from "@/features/_shared/states";
import { useToast } from "@/components/chrome/Toast";
import { useUsers } from "@/data/users";
import { useTasks, useCreateTask, useUpdateTask, TASK_COLUMNS, PRIORITIES, PRIORITY_LABEL, type Task } from "@/data/tasks";
import { TaskSheet } from "./TaskSheet";

const PRIORITY_KIND: Record<string, BadgeKind> = { hoog: "danger", normaal: "info", laag: "default" };

/** Einddatum kort en in context: "vandaag", "3 dagen te laat", "12 mei". */
export function dueLabel(due: string | null): { text: string; kind: BadgeKind } | null {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: `${-days} ${-days === 1 ? "dag" : "dagen"} te laat`, kind: "danger" };
  if (days === 0) return { text: "vandaag", kind: "warn" };
  if (days === 1) return { text: "morgen", kind: "warn" };
  if (days <= 7) return { text: `over ${days} dagen`, kind: "default" };
  return { text: d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" }), kind: "default" };
}

const EMPTY = { title: "", description: "", priority: "normaal", due_date: "", assignee_id: "" };

export function TasksBoard() {
  const toast = useToast();
  const { data: tasks, isLoading, isError, error } = useTasks();
  const { data: users } = useUsers();
  const create = useCreateTask();
  const update = useUpdateTask();

  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [subs, setSubs] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");
  const [who, setWho] = useState(""); // "" = iedereen, "none" = niet toegewezen

  const userName = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users ?? []) m.set(u.id, u.full_name ?? u.email ?? "Onbekend");
    return m;
  }, [users]);

  const all = tasks ?? [];
  const shown = who === "" ? all : who === "none" ? all.filter((t) => !t.assignee_id) : all.filter((t) => t.assignee_id === who);
  const selected = all.find((t) => t.id === selectedId) ?? null;

  const onDrop = (status: string) => {
    if (dragId) {
      const t = all.find((x) => x.id === dragId);
      if (t && t.status !== status) {
        update.mutate({ id: dragId, patch: { status } }, { onError: () => toast("Verplaatsen mislukt") });
        toast(`“${t.title}” → ${TASK_COLUMNS.find((c) => c.id === status)?.title}`);
      }
    }
    setDragId(null); setDropCol(null);
  };

  const closeAdd = () => { setAdding(false); setForm(EMPTY); setSubs([]); setNewSub(""); };
  const addSubRow = () => {
    const v = newSub.trim();
    if (!v) return;
    setSubs((s) => [...s, v]); setNewSub("");
  };

  const saveNew = async () => {
    // Een subtaak die nog in het invoerveld staat telt gewoon mee.
    const pending = newSub.trim();
    try {
      await create.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim() || null,
        status: "todo",
        priority: form.priority,
        due_date: form.due_date || null,
        assignee_id: form.assignee_id || null,
        subtasks: pending ? [...subs, pending] : subs,
      });
      toast("Taak toegevoegd"); closeAdd();
    } catch (e) { toast("Toevoegen mislukt: " + (e instanceof Error ? e.message : "")); }
  };

  if (isError) return <ErrorState error={error} />;

  return (
    <>
      <Section
        title="Taken"
        sub={`${all.filter((t) => t.status !== "done").length} open · ${all.length} totaal`}
        actions={
          <>
            <Select value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 190 }}>
              <option value="">Iedereen</option>
              <option value="none">Niet toegewezen</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </Select>
            <Btn icon="plus" kind="primary" onClick={() => setAdding(true)}>Nieuwe taak</Btn>
          </>
        }
      >
        {isLoading ? (
          <Loading />
        ) : (
          <div className="kanban" style={{ height: "calc(100vh - 240px)" }}>
            {TASK_COLUMNS.map((col) => {
              const colTasks = shown.filter((t) => t.status === col.id);
              return (
                <div key={col.id} className={"kcol " + (dropCol === col.id && dragId ? "drop-target" : "")}
                  onDragOver={(e) => { e.preventDefault(); setDropCol(col.id); }}
                  onDragLeave={() => setDropCol(null)}
                  onDrop={() => onDrop(col.id)}>
                  <div className="kcol-head">
                    <div className="title"><span className="marker" style={{ background: col.color }} />{col.title}</div>
                    <span className="count">{colTasks.length}</span>
                  </div>
                  <div className="kcol-body">
                    {colTasks.map((t) => (
                      <TaskCard key={t.id} task={t} assignee={t.assignee_id ? userName.get(t.assignee_id) : undefined}
                        dragging={dragId === t.id}
                        onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                        onOpen={() => setSelectedId(t.id)} />
                    ))}
                    {colTasks.length === 0 && (
                      <div style={{ padding: "20px 10px", textAlign: "center", color: "var(--fg-faint)", fontSize: 12 }}>
                        Sleep een kaart hierheen
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {selected && <TaskSheet key={selected.id} task={selected} users={users ?? []} onClose={() => setSelectedId(null)} />}

      {adding && (
        <Modal title="Nieuwe taak" sub="Komt in de kolom To-do" onClose={closeAdd}
          footer={<ModalFooter onCancel={closeAdd} onSave={saveNew} saving={create.isPending} disabled={!form.title.trim()} />}>
          <Field label="Naam"><input className="input" autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Wat moet er gebeuren?" /></Field>
          <Field label="Beschrijving"><textarea className="textarea" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          <div className="grid-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Field label="Prioriteit">
              <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </Select>
            </Field>
            <Field label="Einddatum"><input className="input" type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} /></Field>
          </div>
          <Field label="Toegewezen aan">
            <Select value={form.assignee_id} onChange={(e) => setForm((f) => ({ ...f, assignee_id: e.target.value }))}>
              <option value="">— niemand —</option>
              {(users ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </Select>
          </Field>
          <Field label="Subtaken">
            <div className="flex-col gap-1">
              {subs.map((s, i) => (
                <div key={i} className="flex items-center gap-2" style={{ padding: "6px 8px", background: "var(--bg-sunken)", borderRadius: 8 }}>
                  <input type="checkbox" disabled aria-hidden />
                  <span className="text-sm" style={{ flex: 1 }}>{s}</span>
                  <button className="btn ghost sm" aria-label={`${s} verwijderen`}
                    onClick={() => setSubs((prev) => prev.filter((_, j) => j !== i))}><Icon name="x" size={11} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2" style={{ marginTop: subs.length ? 8 : 0 }}>
              <input className="input" value={newSub} placeholder="Subtaak toevoegen…" style={{ flex: 1 }}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubRow(); } }} />
              <Btn icon="plus" onClick={addSubRow} disabled={!newSub.trim()}>Toevoegen</Btn>
            </div>
          </Field>
        </Modal>
      )}
    </>
  );
}

function TaskCard({ task, assignee, dragging, onDragStart, onDragEnd, onOpen }: {
  task: Task; assignee?: string; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onOpen: () => void;
}) {
  const subs = task.task_subtasks ?? [];
  const done = subs.filter((s) => s.done).length;
  const due = dueLabel(task.due_date);
  return (
    <div className={"kcard " + (dragging ? "dragging" : "")} draggable
      onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <span className="name">{task.title}</span>
        <Badge kind={PRIORITY_KIND[task.priority] ?? "default"} dot>{PRIORITY_LABEL[task.priority] ?? task.priority}</Badge>
      </div>
      {task.description && <div className="text-xs text-subtle truncate">{task.description}</div>}
      {subs.length > 0 && <div className="meta"><Icon name="check" size={11} /> {done}/{subs.length} subtaken</div>}
      <div className="meta" style={{ justifyContent: "space-between", alignItems: "center" }}>
        {assignee ? (
          <span className="flex items-center gap-2" style={{ minWidth: 0 }}><Avatar name={assignee} size="sm" /><span className="truncate">{assignee}</span></span>
        ) : (
          <span style={{ color: "var(--fg-faint)" }}>niet toegewezen</span>
        )}
        {due && task.status !== "done" && <Badge kind={due.kind}>{due.text}</Badge>}
      </div>
    </div>
  );
}

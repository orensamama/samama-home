"use client";

import { useState } from "react";
import { Archive, ArrowRight, LayoutTemplate, Plus } from "lucide-react";
import type { PostgrestError } from "@supabase/supabase-js";
import PageHeader from "@/components/PageHeader";
import TaskCard from "@/components/TaskCard";
import ArchivedTaskCard from "@/components/ArchivedTaskCard";
import TaskFormModal, { type TaskFormValues } from "@/components/TaskFormModal";
import KitGenerator, { type KitItem, type TemplateGroup } from "@/components/KitGenerator";
import ErrorBanner from "@/components/ErrorBanner";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { supabase } from "@/lib/supabaseClient";
import { friendlyErrorMessage, logSupabaseError } from "@/lib/supabaseErrors";
import { sortTasks, type Assignee, type Task } from "@/lib/taskData";

const TABS: { value: Assignee; label: string }[] = [
  { value: "Shared", label: "משותף" },
  { value: "Oren", label: "המשימות של אורן" },
  { value: "Orit", label: "המשימות של אורית" },
];

type View = "active" | "archive";

export default function TasksPage() {
  const { rows: allTasks, refetch } = useSupabaseTable<Task>("tasks");
  const [activeTab, setActiveTab] = useState<Assignee>("Shared");
  const [view, setView] = useState<View>("active");
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const realTasks = allTasks.filter((task) => !task.is_template);
  // "משותף" is the master view: every task in the house, tagged by who owns
  // it. The personal tabs filter down to just that person's tasks.
  const isMasterTab = activeTab === "Shared";
  const tabTasks = isMasterTab ? realTasks : realTasks.filter((task) => task.assignee === activeTab);
  const activeTasks = sortTasks(tabTasks.filter((task) => !task.archived));
  const archivedTasks = tabTasks.filter((task) => task.archived);

  const templateGroups: TemplateGroup[] = Array.from(
    allTasks
      .filter((task) => task.is_template && task.template_name)
      .reduce((groups, task) => {
        const key = task.template_name as string;
        const list = groups.get(key) ?? [];
        list.push(task);
        groups.set(key, list);
        return groups;
      }, new Map<string, Task[]>())
  ).map(([name, tasks]) => ({ name, tasks }));

  async function handleFormSubmit(values: TaskFormValues) {
    setFormError(null);
    const payload = {
      title: values.title.trim(),
      assignee: values.assignee,
      due_date: values.due_date || null,
      urgency: values.urgency,
      notes: values.notes.trim() || null,
      category: values.category.trim() || null,
      image_url: values.image_url || null,
      is_personal: values.assignee !== "Shared",
    };

    const { error } = editingTask
      ? await supabase.from("tasks").update(payload).eq("id", editingTask.id)
      : await supabase.from("tasks").insert(payload);

    if (error) {
      logSupabaseError("שמירת משימה", error);
      setFormError(friendlyErrorMessage(error));
      return;
    }

    await refetch();
    setShowForm(false);
    setEditingTask(null);
  }

  async function handleCycleStatus(task: Task) {
    const { error } = await supabase.from("tasks").update({ status: task.status }).eq("id", task.id);
    if (error) {
      logSupabaseError("עדכון סטטוס משימה", error);
      setPageError(friendlyErrorMessage(error));
      return;
    }
    refetch();
  }

  async function handleToggleDone(task: Task) {
    const nextStatus = task.status === "done" ? "todo" : "done";
    const { error } = await supabase.from("tasks").update({ status: nextStatus }).eq("id", task.id);
    if (error) {
      logSupabaseError("סימון משימה כבוצע", error);
      setPageError(friendlyErrorMessage(error));
      return;
    }
    refetch();
  }

  async function handleArchive(task: Task) {
    const { error } = await supabase.from("tasks").update({ archived: true }).eq("id", task.id);
    if (error) {
      logSupabaseError("העברת משימה לארכיון", error);
      setPageError(friendlyErrorMessage(error));
      return;
    }
    refetch();
  }

  async function handleRestore(task: Task) {
    const { error } = await supabase.from("tasks").update({ archived: false }).eq("id", task.id);
    if (error) {
      logSupabaseError("שחזור משימה מהארכיון", error);
      setPageError(friendlyErrorMessage(error));
      return;
    }
    refetch();
  }

  async function handleDeleteForever(id: string) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      logSupabaseError("מחיקת משימה לצמיתות", error);
      setPageError(friendlyErrorMessage(error));
      return;
    }
    refetch();
  }

  async function handleConfirmKit(items: KitItem[]): Promise<PostgrestError | null> {
    const newRows = items.map((item) => ({
      title: item.title,
      assignee: item.assignee,
      urgency: item.urgency,
      status: "todo" as const,
      notes: item.notes,
      category: item.category,
      is_personal: item.assignee !== "Shared",
      is_template: false,
    }));
    const { error } = await supabase.from("tasks").insert(newRows);
    if (error) {
      logSupabaseError("טעינת קיט", error);
      return error;
    }
    await refetch();
    return null;
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="משימות" subtitle="ניהול המשימות המשפחתיות" />

      <div className="flex flex-col gap-3 p-4">
        {pageError && <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} />}

        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-amber-50 p-1 dark:bg-stone-900">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-xl px-2 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                activeTab === tab.value
                  ? "bg-white text-amber-700 shadow-sm dark:bg-stone-800 dark:text-amber-400"
                  : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {view === "active" ? (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setFormError(null);
                  setShowForm(true);
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
              >
                <Plus className="h-4 w-4" />
                הוספת משימה
              </button>
              <button
                type="button"
                onClick={() => setShowTemplates(true)}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-900/50 dark:bg-stone-900 dark:text-amber-400 dark:hover:bg-stone-800"
              >
                <LayoutTemplate className="h-4 w-4" />
                צור רשימה מקיט
              </button>
            </div>

            <button
              type="button"
              onClick={() => setView("archive")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
            >
              <Archive className="h-4 w-4" />
              ארכיון ({archivedTasks.length})
            </button>

            {activeTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-200 p-8 text-center text-sm text-stone-500 dark:border-amber-900/40 dark:text-stone-400">
                אין משימות כאן עדיין. הוסיפו משימה או טענו קיט!
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {activeTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    showAssignee={isMasterTab}
                    onCycleStatus={handleCycleStatus}
                    onToggleDone={handleToggleDone}
                    onEdit={(t) => {
                      setEditingTask(t);
                      setFormError(null);
                      setShowForm(true);
                    }}
                    onArchive={handleArchive}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setView("active")}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:underline dark:text-amber-400"
            >
              <ArrowRight className="h-4 w-4" />
              חזרה לרשימה
            </button>

            {archivedTasks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                הארכיון ריק.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {archivedTasks.map((task) => (
                  <ArchivedTaskCard
                    key={task.id}
                    task={task}
                    onRestore={handleRestore}
                    onDeleteForever={handleDeleteForever}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {showForm && (
        <TaskFormModal
          editingTask={editingTask}
          defaultAssignee={activeTab === "Other" ? "Shared" : activeTab}
          error={formError}
          onDismissError={() => setFormError(null)}
          onClose={() => {
            setShowForm(false);
            setEditingTask(null);
            setFormError(null);
          }}
          onSubmit={handleFormSubmit}
        />
      )}

      {showTemplates && (
        <KitGenerator
          templateGroups={templateGroups}
          onClose={() => setShowTemplates(false)}
          onConfirm={handleConfirmKit}
        />
      )}
    </div>
  );
}

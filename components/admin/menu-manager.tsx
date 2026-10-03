"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { archiveCategory, moveCategory, saveCategory, setCategoryVisible, setItemVisible } from "@/app/c/[slug]/admin/menu/actions";
import { DietMark } from "@/components/guest/diet-mark";
import type { Diet } from "@/lib/menu-types";
import { formatINR } from "@/lib/money";

import { ItemEditor } from "./item-editor";

export interface AdminOption {
  id?: string;
  name: string;
  priceDeltaPaise: number;
}
export interface AdminGroup {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: AdminOption[];
}
export interface AdminItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  pricePaise: number;
  imageUrl: string | null;
  diet: Diet | null;
  tags: string[];
  isVisible: boolean;
  soldOut: boolean;
  groups: AdminGroup[];
}
export interface AdminCategory {
  id: string;
  name: string;
  isVisible: boolean;
}

interface Props {
  tenantKey: string;
  categories: AdminCategory[];
  items: AdminItem[];
}

export function MenuManager({ tenantKey, categories, items }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(categories[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminItem | "new" | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((c) => c.id === selected) ?? categories[0];
  const counts = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, items.filter((i) => i.categoryId === c.id).length])), [categories, items]);
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items.filter((i) => i.categoryId === category?.id);

  /** Runs a server action, shows its error if any, and reloads the menu from the server. */
  function act(task: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) setError(result.error ?? "That didn't save.");
      router.refresh();
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <section aria-label="Categories" className="flex flex-col gap-2 rounded-2xl bg-[var(--g-surface)] p-3 ring-1 ring-[var(--g-line)] lg:sticky lg:top-8">
        <h2 className="px-2 pt-1 text-sm font-semibold tracking-wide text-[var(--g-muted)] uppercase">Categories</h2>
        <ul className="flex flex-col gap-1">
          {categories.map((c, index) => (
            <li key={c.id} className={`group flex items-center gap-1 rounded-xl pr-1 ${c.id === category?.id && !q ? "bg-[var(--g-soft)]" : ""}`}>
              {renaming === c.id ? (
                <form
                  className="flex flex-1 gap-1 p-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = new FormData(e.currentTarget).get("name") as string;
                    setRenaming(null);
                    act(() => saveCategory(tenantKey, { id: c.id, name }));
                  }}
                >
                  <input name="name" defaultValue={c.name} autoFocus aria-label="Category name" className="h-8 min-w-0 flex-1 rounded-lg bg-[var(--g-bg)] px-2 text-sm ring-1 ring-[var(--brand)]" />
                </form>
              ) : (
                <button type="button" onClick={() => (setSelected(c.id), setQuery(""))} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm">
                  <span className={`truncate ${c.isVisible ? "font-medium" : "text-[var(--g-muted)] line-through"}`}>{c.name}</span>
                  <span className="text-xs text-[var(--g-muted)] tabular-nums">{counts[c.id]}</span>
                </button>
              )}
              <div className="flex opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <IconButton label="Move up" disabled={index === 0 || pending} onClick={() => act(() => moveCategory(tenantKey, c.id, "up"))} icon={ArrowUp} />
                <IconButton label="Move down" disabled={index === categories.length - 1 || pending} onClick={() => act(() => moveCategory(tenantKey, c.id, "down"))} icon={ArrowDown} />
                <IconButton label={c.isVisible ? "Hide from guests" : "Show to guests"} onClick={() => act(() => setCategoryVisible(tenantKey, c.id, !c.isVisible))} icon={c.isVisible ? Eye : EyeOff} />
                <IconButton label="Rename" onClick={() => setRenaming(c.id)} icon={Pencil} />
                <IconButton label="Delete category" onClick={() => act(() => archiveCategory(tenantKey, c.id))} icon={Trash2} />
              </div>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2 border-t border-[var(--g-line)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newCategory.trim()) return;
            const name = newCategory;
            setNewCategory("");
            act(() => saveCategory(tenantKey, { name }));
          }}
        >
          <input
            id="new-category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category"
            className="h-9 min-w-0 flex-1 rounded-lg bg-[var(--g-bg)] px-3 text-sm ring-1 ring-[var(--g-line)] focus:ring-[var(--brand)]"
          />
          <button type="submit" aria-label="Add category" className="grid size-9 place-items-center rounded-lg bg-[var(--brand)] text-[var(--brand-fg)]">
            <Plus className="size-4" />
          </button>
        </form>
      </section>

      <section aria-label="Items" className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto font-heading text-xl font-bold">{q ? `Results for “${query}”` : category?.name ?? "No categories yet"}</h2>
          <label className="flex h-10 w-64 max-w-full items-center gap-2 rounded-xl bg-[var(--g-surface)] px-3 ring-1 ring-[var(--g-line)] focus-within:ring-[var(--brand)]">
            <Search className="size-4 text-[var(--g-muted)]" />
            <span className="sr-only">Search all items</span>
            <input id="menu-admin-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all items" className="w-full bg-transparent text-sm outline-none" />
          </label>
          <button
            type="button"
            disabled={!category}
            onClick={() => setEditing("new")}
            className="flex h-10 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-50"
          >
            <Plus className="size-4" /> Add item
          </button>
        </div>
        {error && (
          <p role="alert" className="anim-rise rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <ul className="flex flex-col divide-y divide-[var(--g-line)] overflow-hidden rounded-2xl bg-[var(--g-surface)] ring-1 ring-[var(--g-line)]">
          {shown.length === 0 && <li className="px-4 py-12 text-center text-sm text-[var(--g-muted)]">{q ? "No items match." : "No items here yet. Add the first one."}</li>}
          {shown.map((item) => (
            <li key={item.id} className="flex items-center gap-4 px-4 py-3">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL
                <img src={item.imageUrl} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
              ) : (
                <div aria-hidden className="grid size-14 shrink-0 place-items-center rounded-xl bg-[var(--g-soft)] font-heading text-xl font-bold text-[var(--g-line)]">
                  {item.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  <DietMark diet={item.diet} />
                  <span className={`truncate ${item.isVisible ? "" : "text-[var(--g-muted)]"}`}>{item.name}</span>
                </p>
                <p className="flex flex-wrap gap-x-3 text-sm text-[var(--g-muted)]">
                  <span className="tabular-nums">{formatINR(item.pricePaise)}</span>
                  {item.groups.length > 0 && <span>{item.groups.length} option group{item.groups.length > 1 ? "s" : ""}</span>}
                  {!item.isVisible && <span className="font-medium text-amber-700">Hidden</span>}
                  {item.soldOut && <span className="font-medium text-red-700">Sold out</span>}
                </p>
              </div>
              <IconButton
                label={item.isVisible ? "Hide from guests" : "Show to guests"}
                onClick={() => act(() => setItemVisible(tenantKey, item.id, !item.isVisible))}
                icon={item.isVisible ? Eye : EyeOff}
              />
              <button type="button" onClick={() => setEditing(item)} className="h-9 rounded-lg px-3 text-sm font-semibold ring-1 ring-[var(--g-line)] hover:ring-[var(--brand)]">
                Edit
              </button>
            </li>
          ))}
        </ul>
      </section>

      {editing && category && (
        <ItemEditor
          tenantKey={tenantKey}
          categories={categories}
          item={editing === "new" ? null : editing}
          defaultCategoryId={category.id}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function IconButton({ label, onClick, icon: Icon, disabled }: { label: string; onClick: () => void; icon: typeof Eye; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-8 place-items-center rounded-lg text-[var(--g-muted)] hover:bg-[var(--g-bg)] hover:text-[var(--g-ink)] disabled:opacity-30">
      <Icon className="size-4" />
    </button>
  );
}

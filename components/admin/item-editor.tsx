"use client";

import { ImagePlus, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { archiveItem, removeItemPhoto, saveItem, uploadItemPhoto } from "@/app/c/[slug]/admin/menu/actions";
import { paiseToInput, rupeesToPaise } from "@/lib/format";

import type { AdminCategory, AdminGroup, AdminItem } from "./menu-manager";

interface Props {
  tenantKey: string;
  categories: AdminCategory[];
  item: AdminItem | null;
  defaultCategoryId: string;
  onClose: () => void;
  onSaved: () => void;
}

type GroupDraft = { id?: string; name: string; min: string; max: string; options: { id?: string; name: string; price: string }[] };

const TAGS = [
  ["bestseller", "Bestseller"],
  ["new", "New"],
  ["spicy", "Spicy"],
  ["jain", "Jain"],
] as const;

const PRESETS: { label: string; group: GroupDraft }[] = [
  { label: "Size", group: { name: "Size", min: "1", max: "1", options: [{ name: "Regular", price: "0" }, { name: "Large", price: "40" }] } },
  { label: "Milk", group: { name: "Milk", min: "1", max: "1", options: [{ name: "Regular milk", price: "0" }, { name: "Oat milk", price: "50" }] } },
  { label: "Add-ons", group: { name: "Add-ons", min: "0", max: "3", options: [{ name: "Extra shot", price: "40" }] } },
];

const toDraft = (g: AdminGroup): GroupDraft => ({
  id: g.id,
  name: g.name,
  min: String(g.minSelect),
  max: String(g.maxSelect),
  options: g.options.map((o) => ({ id: o.id, name: o.name, price: paiseToInput(o.priceDeltaPaise) })),
});

const input = "h-10 w-full rounded-lg bg-[var(--g-bg)] px-3 text-sm ring-1 ring-[var(--g-line)] outline-none focus:ring-2 focus:ring-[var(--brand)]";

/** Add or edit one menu item, its photo and its option groups. Saved in one go [save_menu_item]. */
export function ItemEditor({ tenantKey, categories, item, defaultCategoryId, onClose, onSaved }: Props) {
  const [id, setId] = useState(item?.id ?? null);
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item ? paiseToInput(item.pricePaise) : "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId);
  const [diet, setDiet] = useState<string>(item?.diet ?? "veg");
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [visible, setVisible] = useState(item?.isVisible ?? true);
  const [groups, setGroups] = useState<GroupDraft[]>(item?.groups.map(toDraft) ?? []);
  const [photo, setPhoto] = useState(item?.imageUrl ?? null);
  const [busy, setBusy] = useState<"save" | "photo" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const updateGroup = (index: number, patch: Partial<GroupDraft>) => setGroups((g) => g.map((x, i) => (i === index ? { ...x, ...patch } : x)));

  async function save() {
    setError(null);
    setSaved(false);
    const pricePaise = rupeesToPaise(price);
    if (pricePaise === null || pricePaise < 0) return setError("Enter a price like 190 or 190.50.");
    const parsedGroups = [];
    for (const g of groups) {
      const options = [];
      for (const o of g.options) {
        const delta = rupeesToPaise(o.price || "0");
        if (delta === null) return setError(`“${o.name || "An option"}” has a price that isn't a number.`);
        options.push({ id: o.id, name: o.name, price_delta_paise: delta });
      }
      parsedGroups.push({ id: g.id, name: g.name, min_select: Number(g.min) || 0, max_select: Number(g.max) || 1, options });
    }

    setBusy("save");
    const result = await saveItem(tenantKey, {
      id: id ?? undefined,
      category_id: categoryId,
      name,
      description,
      price_paise: pricePaise,
      diet: diet as "veg",
      tags: tags as ("spicy" | "new" | "bestseller" | "jain")[],
      is_visible: visible,
      groups: parsedGroups,
    });
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setId(result.data ?? id);
    setSaved(true);
    onSaved();
  }

  async function upload(file: File) {
    if (!id) return;
    setBusy("photo");
    setError(null);
    const form = new FormData();
    form.set("photo", file);
    const result = await uploadItemPhoto(tenantKey, id, form);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    setPhoto(result.data ?? null);
    onSaved();
  }

  async function remove() {
    if (!id) return;
    setBusy("delete");
    const result = await archiveItem(tenantKey, id);
    setBusy(null);
    if (!result.ok) return setError(result.error);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="item-editor-title">
      <button type="button" aria-label="Close" className="anim-fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="anim-slide-in-right relative flex h-full w-full max-w-xl flex-col bg-[var(--g-surface)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--g-line)] px-5 py-4">
          <h2 id="item-editor-title" className="font-heading text-xl font-bold">
            {id ? "Edit item" : "New item"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg hover:bg-[var(--g-soft)]">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled={!id || busy === "photo"}
              onClick={() => fileRef.current?.click()}
              className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--g-soft)] text-[var(--g-muted)] ring-1 ring-[var(--g-line)] disabled:opacity-60"
              aria-label={photo ? "Change photo" : "Add photo"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL */}
              {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <ImagePlus className="size-7" />}
              {busy === "photo" && (
                <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                  <LoaderCircle className="size-6 animate-spin" />
                </span>
              )}
            </button>
            <div className="text-sm text-[var(--g-muted)]">
              {id ? (
                <>
                  <p>A square photo looks best. We resize it automatically.</p>
                  {photo && (
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await removeItemPhoto(tenantKey, id);
                        if (r.ok) {
                          setPhoto(null);
                          onSaved();
                        }
                      }}
                      className="mt-1 font-medium text-red-700"
                    >
                      Remove photo
                    </button>
                  )}
                </>
              ) : (
                <p>Save the item first, then add a photo.</p>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input id="item-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Description <span className="font-normal text-[var(--g-muted)]">(optional, one line is plenty)</span>
            <textarea id="item-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} className={`${input} h-auto py-2`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Price (₹)
              <input id="item-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="190" className={input} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Category
              <select id="item-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={input}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Food type</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["veg", "Veg"],
                  ["vegan", "Vegan"],
                  ["egg", "Contains egg"],
                  ["nonveg", "Non-veg"],
                  ["", "Not food (e.g. merch)"],
                ] as const
              ).map(([value, label]) => (
                <Chip key={value} active={diet === value} onClick={() => setDiet(value)}>
                  {label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">Labels</legend>
            <div className="flex flex-wrap gap-2">
              {TAGS.map(([value, label]) => (
                <Chip key={value} active={tags.includes(value)} onClick={() => setTags((t) => (t.includes(value) ? t.filter((x) => x !== value) : [...t, value]))}>
                  {label}
                </Chip>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input id="item-visible" type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-5 accent-[var(--brand)]" />
            Show on the menu
          </label>

          <section className="flex flex-col gap-3 border-t border-[var(--g-line)] pt-5">
            <div>
              <h3 className="font-heading text-lg font-bold">Options</h3>
              <p className="text-sm text-[var(--g-muted)]">Sizes, milk, add-ons… Prices are added to the item&apos;s price.</p>
            </div>
            {groups.map((g, gi) => (
              <div key={g.id ?? `new-${gi}`} className="flex flex-col gap-3 rounded-xl bg-[var(--g-bg)] p-3 ring-1 ring-[var(--g-line)]">
                <div className="flex gap-2">
                  <input aria-label="Group name" value={g.name} onChange={(e) => updateGroup(gi, { name: e.target.value })} placeholder="e.g. Size" className={`${input} bg-[var(--g-surface)] font-medium`} />
                  <button type="button" aria-label="Remove this group" onClick={() => setGroups((all) => all.filter((_, i) => i !== gi))} className="grid size-10 shrink-0 place-items-center rounded-lg text-[var(--g-muted)] hover:text-red-700">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  Guests choose at least
                  <input aria-label="Minimum choices" value={g.min} onChange={(e) => updateGroup(gi, { min: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="h-8 w-12 rounded-md bg-[var(--g-surface)] text-center ring-1 ring-[var(--g-line)]" />
                  and at most
                  <input aria-label="Maximum choices" value={g.max} onChange={(e) => updateGroup(gi, { max: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className="h-8 w-12 rounded-md bg-[var(--g-surface)] text-center ring-1 ring-[var(--g-line)]" />
                  <span className="text-[var(--g-muted)]">{g.min === "0" ? "(optional)" : "(required)"}</span>
                </div>
                {g.options.map((o, oi) => (
                  <div key={o.id ?? `new-${oi}`} className="flex gap-2">
                    <input
                      aria-label="Option name"
                      value={o.name}
                      onChange={(e) => updateGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, name: e.target.value } : x)) })}
                      placeholder="e.g. Large"
                      className={`${input} bg-[var(--g-surface)]`}
                    />
                    <label className="flex w-32 shrink-0 items-center gap-1 rounded-lg bg-[var(--g-surface)] px-2 text-sm ring-1 ring-[var(--g-line)]">
                      <span className="text-[var(--g-muted)]">+₹</span>
                      <input
                        aria-label="Extra price"
                        value={o.price}
                        onChange={(e) => updateGroup(gi, { options: g.options.map((x, i) => (i === oi ? { ...x, price: e.target.value } : x)) })}
                        inputMode="decimal"
                        className="h-10 w-full bg-transparent outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label="Remove option"
                      onClick={() => updateGroup(gi, { options: g.options.filter((_, i) => i !== oi) })}
                      className="grid size-10 shrink-0 place-items-center rounded-lg text-[var(--g-muted)] hover:text-red-700"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => updateGroup(gi, { options: [...g.options, { name: "", price: "0" }] })} className="self-start text-sm font-semibold text-[var(--brand)]">
                  + Add option
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGroups((all) => [...all, { name: "", min: "0", max: "1", options: [{ name: "", price: "0" }] }])}
                className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ring-[var(--g-line)]"
              >
                <Plus className="size-4" /> Option group
              </button>
              {PRESETS.filter((p) => !groups.some((g) => g.name === p.group.name)).map((p) => (
                <button key={p.label} type="button" onClick={() => setGroups((all) => [...all, structuredClone(p.group)])} className="h-9 rounded-lg border border-dashed border-[var(--g-line)] px-3 text-sm text-[var(--g-muted)] hover:text-[var(--g-ink)]">
                  + {p.label}
                </button>
              ))}
            </div>
          </section>

          {id && (
            <section className="border-t border-[var(--g-line)] pt-5">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  Remove “{name}” from the menu? Past orders and reports keep it.
                  <button type="button" disabled={busy === "delete"} onClick={remove} className="h-9 rounded-lg bg-red-700 px-3 font-semibold text-white">
                    Remove item
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 rounded-lg px-3 ring-1 ring-[var(--g-line)]">
                    Keep it
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-medium text-red-700">
                  Remove item from the menu
                </button>
              )}
            </section>
          )}
        </div>

        <footer className="flex items-center gap-3 border-t border-[var(--g-line)] px-5 py-4">
          <p role="status" className="flex-1 text-sm">
            {error ? <span className="text-red-700">{error}</span> : saved ? <span className="anim-rise text-emerald-700">Saved. Guests see it now.</span> : null}
          </p>
          <button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-medium ring-1 ring-[var(--g-line)]">
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy !== null}
            className="flex h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-60"
          >
            {busy === "save" && <LoaderCircle className="size-4 animate-spin" />}
            {id ? "Save changes" : "Create item"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 rounded-full px-3 text-sm transition-colors ${active ? "bg-[var(--brand)] text-[var(--brand-fg)]" : "ring-1 ring-[var(--g-line)] hover:ring-[var(--brand)]"}`}
    >
      {children}
    </button>
  );
}

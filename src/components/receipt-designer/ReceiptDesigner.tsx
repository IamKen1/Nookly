"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Loader2,
  Printer,
  RotateCcw,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import type { Block, BlockType, Template } from "@/lib/receipt-designer/types";
import { BLOCK_LABELS, newBlock } from "@/lib/receipt-designer/blocks";
import { PRESETS, buildPreset } from "@/lib/receipt-designer/presets";
import { SAMPLE_KINDS } from "@/lib/receipt-designer/samples";
import { designWarnings, sanitizeTemplate } from "@/lib/receipt-designer/validate";
import { printDesignedReceipt } from "@/lib/printer/print-receipt";
import Inspector from "./Inspector";
import Preview from "./Preview";
import StyleEditor from "./StyleEditor";

type SaveState = "saved" | "saving" | "unsaved" | "error";

const PALETTE: BlockType[] = ["logo", "storeInfo", "title", "saleDetails", "items", "totals", "scPwd", "payment", "loyalty", "remarks", "text", "qr", "barcode", "rule", "footer"];

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b${Date.now()}${Math.random().toString(36).slice(2)}`);

// Gives a block (and its totals lines) fresh ids, for duplicates and presets.
const withFreshIds = (b: Block): Block =>
  b.type === "totals" ? { ...b, id: uid(), lines: b.lines.map((l) => ({ ...l, id: uid() })) } : { ...b, id: uid() };

function blockSummary(b: Block): string {
  switch (b.type) {
    case "text":
      return b.text.split("\n")[0].slice(0, 28);
    case "title":
      return b.text || "from Receipt settings";
    case "totals":
      return `${b.lines.length} line${b.lines.length === 1 ? "" : "s"}`;
    case "qr":
      return b.content ? b.content.replace(/^https?:\/\//, "").slice(0, 24) : "no link yet";
    case "rule":
      return b.char === " " ? "blank line" : b.char.repeat(6);
    default:
      return "";
  }
}

export default function ReceiptDesigner() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planHasIt, setPlanHasIt] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [published, setPublished] = useState<Template | null>(null);
  const [settings, setSettings] = useState<ReceiptStoreSettings | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sampleKind, setSampleKind] = useState("regular");
  const [sample, setSample] = useState<ReceiptData | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dragType, setDragType] = useState<BlockType | null>(null);
  const loaded = useRef(false);
  // The design in use, to skip saving a "draft" that's identical to it.
  const publishedJson = useRef<string | null>(null);
  useEffect(() => {
    publishedJson.current = published ? JSON.stringify(published) : null;
  }, [published]);

  // ---------- load ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/receipt-template");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Couldn't load the designer.");
        if (!data.planHasIt) {
          setPlanHasIt(false);
          return;
        }
        setEnabled(data.enabled);
        setPublished(data.published);
        setSettings(data.settings);
        setTemplate(data.draft ?? data.published ?? buildPreset("classic", data.settings));
        setSaveState(data.draft || !data.published ? "unsaved" : "saved");
        void loadSampleRef.current("regular");
      } catch (e) {
        setLoadError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ---------- sample sale for the preview ----------
  const loadSample = useCallback(async (kind: string) => {
    setSampleError(null);
    try {
      const res = await fetch(`/api/settings/receipt-template/sample?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the sample sale.");
      setSample({ ...data, date: new Date(data.date) });
    } catch (e) {
      setSampleError((e as Error).message);
    }
  }, []);
  const loadSampleRef = useRef(loadSample);

  // ---------- autosave the draft ----------
  useEffect(() => {
    if (!template) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    const timer = setTimeout(async () => {
      if (publishedJson.current === JSON.stringify(template)) {
        setSaveState("saved");
        return;
      }
      setSaveState("saving");
      try {
        const res = await fetch("/api/settings/receipt-template", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "saveDraft", template }),
        });
        setSaveState(res.ok ? "unsaved" : "error");
      } catch {
        setSaveState("error");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [template]);

  const { errors, warnings } = useMemo(() => {
    if (!template) return { errors: [], warnings: [] };
    return { errors: sanitizeTemplate(template).errors, warnings: designWarnings(template) };
  }, [template]);

  const change = (t: Template) => {
    setTemplate(t);
    setSaveState("unsaved");
    setMessage(null);
  };
  const updateBlock = (b: Block) => template && change({ ...template, blocks: template.blocks.map((x) => (x.id === b.id ? b : x)) });
  const insertBlock = (type: BlockType, index?: number) => {
    if (!template) return;
    const b = newBlock(type, uid());
    const at = index ?? (selectedId ? template.blocks.findIndex((x) => x.id === selectedId) + 1 : template.blocks.length);
    const blocks = [...template.blocks];
    blocks.splice(at < 0 ? blocks.length : at, 0, b);
    change({ ...template, blocks });
    setSelectedId(b.id);
  };

  // ---------- actions ----------
  const act = async (name: string, body: object, after: (data: Record<string, unknown>) => void) => {
    setBusy(name);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/receipt-template", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      after(data);
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const publish = () =>
    template &&
    act("publish", { action: "publish", template }, () => {
      setEnabled(true);
      setPublished(template);
      setSaveState("saved");
      setMessage({ kind: "ok", text: "Done. New receipts and reprints now use this design." });
    });

  const revert = () =>
    confirm("Go back to the standard Nookly receipt? Your design is kept, and you can use it again any time.") &&
    act("revert", { action: "revert" }, () => {
      setEnabled(false);
      setMessage({ kind: "ok", text: "Receipts are back to the standard Nookly receipt." });
    });

  const discard = () =>
    confirm("Throw away the changes since you last used this design?") &&
    act("discard", { action: "discardDraft" }, () => {
      loaded.current = false;
      setTemplate(published ?? buildPreset("classic", settings!));
      setSaveState(published ? "saved" : "unsaved");
      setSelectedId(null);
    });

  const applyPreset = (key: string) => {
    if (!template || !settings || !key) return;
    if (!confirm("Start over from this preset? It replaces what's on the receipt now.")) return;
    const p = buildPreset(key as Parameters<typeof buildPreset>[0], settings, template.paperWidth);
    change({ ...p, blocks: p.blocks.map(withFreshIds) });
    setSelectedId(null);
  };

  const testPrint = async () => {
    if (!template || !sample) return;
    setBusy("print");
    setMessage(null);
    try {
      await printDesignedReceipt(sample, template);
      setMessage({ kind: "ok", text: "Sent to the printer." });
    } catch (e) {
      setMessage({ kind: "error", text: `Couldn't print: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  };

  const uploadLogo = async (file: File) => {
    setBusy("logo");
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "receipt");
      const up = await fetch("/api/upload", { method: "POST", body: form });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error ?? "Upload failed.");
      await act("logo", { action: "setLogo", logoUrl: upData.url }, () => {
        setSettings((s) => (s ? { ...s, logoUrl: upData.url } : s));
        setSample((s) => (s ? { ...s, store: { ...s.store, logoUrl: upData.url } } : s));
        if (template && !template.blocks.some((b) => b.type === "logo")) {
          change({ ...template, blocks: [newBlock("logo", uid()), ...template.blocks] });
        }
      });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const removeLogo = () =>
    act("logo", { action: "setLogo", logoUrl: null }, () => {
      setSettings((s) => (s ? { ...s, logoUrl: null } : s));
      setSample((s) => (s ? { ...s, store: { ...s.store, logoUrl: null } } : s));
    });

  // ---------- drag and drop ----------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setDragType(id.startsWith("new:") ? (id.slice(4) as BlockType) : null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragType(null);
    if (!template || !e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId.startsWith("new:")) {
      const index = overId === "layers-end" ? template.blocks.length : template.blocks.findIndex((b) => b.id === overId);
      insertBlock(activeId.slice(4) as BlockType, index < 0 ? template.blocks.length : index);
      return;
    }
    if (activeId === overId || overId === "layers-end") return;
    const from = template.blocks.findIndex((b) => b.id === activeId);
    const to = template.blocks.findIndex((b) => b.id === overId);
    if (from >= 0 && to >= 0) change({ ...template, blocks: arrayMove(template.blocks, from, to) });
  };

  // ---------- render ----------
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-zinc-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading the receipt designer…
      </div>
    );
  }
  if (loadError || !planHasIt || !template || !settings) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-zinc-900">Receipt designer</h1>
        <p className="mt-2 text-sm text-zinc-500">{loadError ?? "The receipt designer isn't included in your current plan. Upgrade from Settings › Plan & billing to unlock it."}</p>
        <Link href="/settings" className="mt-4 inline-block text-sm font-semibold text-emerald-700 hover:underline">
          Back to Settings
        </Link>
      </div>
    );
  }

  const selected = template.blocks.find((b) => b.id === selectedId) ?? null;
  const btn = "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 disabled:opacity-50";

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragType(null)}>
      <div className="flex h-screen flex-col bg-zinc-100">
        {/* top bar */}
        <header className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5">
          <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-emerald-700">
            <ArrowLeft className="h-4 w-4" /> Settings
          </Link>
          <div className="mr-auto flex items-center gap-2">
            <h1 className="text-base font-semibold text-zinc-900">Receipt designer</h1>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>
              {enabled ? "Receipts use your design" : "Receipts use the standard Nookly receipt"}
            </span>
            <span className="text-[11px] text-zinc-400">
              {saveState === "saving" ? "Saving draft…" : saveState === "error" ? "Draft not saved" : saveState === "unsaved" ? "Draft saved, not in use yet" : "In use"}
            </span>
          </div>

          <select className="h-8 w-44 rounded-full border border-zinc-200 bg-white px-3 text-xs" value="" onChange={(e) => applyPreset(e.target.value)}>
            <option value="">Start from a preset…</option>
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key} title={p.description}>
                {p.label}: {p.description}
              </option>
            ))}
          </select>
          <select className="h-8 w-44 rounded-full border border-zinc-200 bg-white px-3 text-xs" value={sampleKind}
            onChange={(e) => {
              setSampleKind(e.target.value);
              void loadSample(e.target.value);
            }}
            title="Sale shown in the preview"
          >
            {SAMPLE_KINDS.map((s) => (
              <option key={s.key} value={s.key}>
                Preview: {s.label}
              </option>
            ))}
          </select>
          <button type="button" className={btn} onClick={testPrint} disabled={!sample || busy !== null}>
            {busy === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Test print
          </button>
          {published && saveState !== "saved" && (
            <button type="button" className={btn} onClick={discard} disabled={busy !== null}>
              <Undo2 className="h-3.5 w-3.5" /> Discard changes
            </button>
          )}
          {enabled && (
            <button type="button" className={btn} onClick={revert} disabled={busy !== null}>
              <RotateCcw className="h-3.5 w-3.5" /> Use Nookly receipt
            </button>
          )}
          <button
            type="button"
            onClick={publish}
            disabled={busy !== null || errors.length > 0 || (enabled && saveState === "saved")}
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy === "publish" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Use this design
          </button>
        </header>

        {(message || errors.length > 0 || warnings.length > 0) && (
          <div className="space-y-1 border-b border-zinc-200 bg-white px-4 py-2 text-xs">
            {message && <p className={message.kind === "ok" ? "text-emerald-700" : "text-red-600"}>{message.text}</p>}
            {errors.map((e) => (
              <p key={e} className="text-red-600">
                {e}
              </p>
            ))}
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
              </p>
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* left: palette + layers */}
          <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Add a block (click or drag)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PALETTE.map((t) => (
                  <PaletteItem key={t} type={t} onAdd={() => insertBlock(t)} />
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">On the receipt (top to bottom)</p>
              <SortableContext items={template.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <ul className="space-y-1">
                  {template.blocks.map((b) => (
                    <LayerRow
                      key={b.id}
                      block={b}
                      selected={b.id === selectedId}
                      onSelect={() => setSelectedId(b.id)}
                      onToggle={() => updateBlock({ ...b, visible: !b.visible })}
                      onDuplicate={() => {
                        const i = template.blocks.findIndex((x) => x.id === b.id);
                        const copy = withFreshIds(b);
                        const blocks = [...template.blocks];
                        blocks.splice(i + 1, 0, copy);
                        change({ ...template, blocks });
                        setSelectedId(copy.id);
                      }}
                      onRemove={() => {
                        change({ ...template, blocks: template.blocks.filter((x) => x.id !== b.id) });
                        if (selectedId === b.id) setSelectedId(null);
                      }}
                    />
                  ))}
                </ul>
              </SortableContext>
              <LayersEnd />
            </div>
          </aside>

          {/* center: preview */}
          <main className="min-w-0 flex-1 overflow-auto px-6 py-8" onClick={(e) => e.target === e.currentTarget && setSelectedId(null)}>
            {sampleError && <p className="mb-3 text-center text-xs text-amber-700">{sampleError}</p>}
            {sample ? (
              <Preview template={template} data={sample} selectedId={selectedId} onSelect={setSelectedId} />
            ) : (
              <p className="text-center text-sm text-zinc-400">Loading the sample sale…</p>
            )}
          </main>

          {/* right: inspector */}
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-4">
            {selected ? (
              <Inspector key={selected.id} block={selected} printMode={template.printMode} onChange={updateBlock} />
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Receipt settings</p>
                  <p className="mt-1 text-[11px] text-zinc-500">Pick a block on the left or click a line in the preview to edit it.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-600">Paper</p>
                  <div className="inline-flex overflow-hidden rounded-md border border-zinc-200">
                    {([58, 80] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => change({ ...template, paperWidth: w })}
                        className={`px-4 py-1.5 text-xs font-semibold ${template.paperWidth === w ? "bg-emerald-600 text-white" : "bg-white text-zinc-600"}`}
                      >
                        {w}mm
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-zinc-400">Blocks fit themselves to the paper, so one design works on both.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-600">Print mode</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["TEXT", "Text", "Fast. The printer's own fonts: A or B, 1×–8× sizes, bold, underline, white on black."],
                        ["IMAGE", "Image", "Any font, size and shade. Prints the receipt as a picture: slower, especially over Bluetooth."],
                      ] as const
                    ).map(([mode, label, hint]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => change({ ...template, printMode: mode })}
                        className={`rounded-lg border p-2 text-left ${template.printMode === mode ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 hover:border-zinc-300"}`}
                      >
                        <span className="block text-sm font-semibold text-zinc-900">{label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-600">Logo</p>
                  {settings.logoUrl ? (
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={settings.logoUrl} alt="Logo" className="h-12 w-auto max-w-[8rem] rounded border border-zinc-200 bg-white object-contain p-1" />
                      <label className={`${btn} cursor-pointer`}>
                        <Upload className="h-3.5 w-3.5" /> Replace
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                      </label>
                      <button type="button" className="text-xs text-zinc-500 hover:text-red-600" onClick={removeLogo}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className={`${btn} cursor-pointer`}>
                      {busy === "logo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} Upload logo
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                    </label>
                  )}
                  <p className="text-[11px] text-zinc-400">A simple, high-contrast logo prints best. Black and white works best on thermal paper.</p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-zinc-600">Default look (every block starts from this)</p>
                  <StyleEditor value={template.theme.style} onChange={(style) => change({ ...template, theme: { style } })} printMode={template.printMode} />
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
      <DragOverlay>{dragType ? <div className="rounded-md border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold shadow-lg">{BLOCK_LABELS[dragType]}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function PaletteItem({ type, onAdd }: { type: BlockType; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `new:${type}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onAdd}
      {...attributes}
      {...listeners}
      className={`touch-none rounded-md border px-2 py-1.5 text-left text-xs font-medium ${isDragging ? "border-emerald-400 opacity-50" : "border-zinc-200 text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50"}`}
    >
      {BLOCK_LABELS[type]}
    </button>
  );
}

function LayersEnd() {
  const { setNodeRef, isOver } = useDroppable({ id: "layers-end" });
  return <div ref={setNodeRef} className={`mt-1 h-8 rounded-md border border-dashed ${isOver ? "border-emerald-400 bg-emerald-50" : "border-transparent"}`} />;
}

function LayerRow({
  block,
  selected,
  onSelect,
  onToggle,
  onDuplicate,
  onRemove,
}: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const summary = blockSummary(block);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded-md border px-1 py-1 ${
        isDragging ? "z-10 border-emerald-400 bg-white shadow" : selected ? "border-emerald-400 bg-emerald-50" : "border-zinc-200 bg-white hover:border-zinc-300"
      } ${block.visible ? "" : "opacity-50"}`}
    >
      <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none p-1 text-zinc-400" aria-label="Drag to reorder">
        <GripVertical className="h-4 w-4" />
      </button>
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm text-zinc-800">{BLOCK_LABELS[block.type]}</span>
        {summary && <span className="block truncate text-[11px] text-zinc-400">{summary}</span>}
      </button>
      <button type="button" onClick={onToggle} className="p-1 text-zinc-400 hover:text-zinc-700" title={block.visible ? "Hide" : "Show"}>
        {block.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={onDuplicate} className="hidden p-1 text-zinc-400 hover:text-zinc-700 group-hover:block" title="Duplicate">
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onRemove} className="hidden p-1 text-zinc-400 hover:text-red-600 group-hover:block" title="Remove">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
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
  MoreHorizontal,
  Printer,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from "lucide-react";
import type { ReceiptData, ReceiptStoreSettings } from "@/types/receipt";
import type { Block, Template } from "@/lib/receipt-designer/types";
import { BLOCK_LABELS, breakApart, newBlock, newField } from "@/lib/receipt-designer/blocks";
import { FIELDS_BY_NAME, TOTALS_FIELDS } from "@/lib/receipt-designer/totals";
import { PRESETS, buildPreset } from "@/lib/receipt-designer/presets";
import { SAMPLE_KINDS } from "@/lib/receipt-designer/samples";
import { designChecklist, designNotes, sanitizeTemplate } from "@/lib/receipt-designer/validate";
import { printDesignedReceipt } from "@/lib/printer/print-receipt";
import { ensurePrinter } from "@/lib/printer/store";
import { DEFAULT_CALIBRATION, readCalibration, writeCalibration, type Calibration } from "@/lib/printer/calibration";
import { columnsFor } from "@/lib/receipt-designer/textmode";
import Inspector from "./Inspector";
import Preview, { PREVIEW_PREFIX } from "./Preview";
import StyleEditor from "./StyleEditor";
import { ValueFormatEditor } from "./ValueFormatEditor";
import QuickBar, { type BlockAction } from "./QuickBar";
import Tiles from "./Tiles";
import Checklist from "./Checklist";
import Wizard, { Confetti } from "./Wizard";
import ConfirmDialog from "./ConfirmDialog";
import PosPricing from "./PosPricing";
import useSWR, { mutate as mutateSWR } from "swr";
import type { DiscountDTO } from "@/lib/discounts";
import { TILES_BY_ID, makeTile, type Tile } from "@/lib/receipt-designer/tiles";
import type { Part } from "@/lib/receipt-designer/quick";
import { DEFAULT_FORMAT } from "@/lib/receipt-designer/format";

type SaveState = "saved" | "saving" | "unsaved" | "error";

// For grouping quick edits into one undo step (only called from event handlers).
const clock = () => Date.now();

interface VersionRow {
  id: string;
  publishedAt: string;
  publishedBy: string | null;
  paperWidth: number;
  printMode: string;
  blockCount: number;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `b${Date.now()}${Math.random().toString(36).slice(2)}`);

// Advanced pieces not among the tiles: any single value, side-by-side rows.
interface PaletteEntry {
  id: string;
  label: string;
  make: () => Block;
}
const ADVANCED: PaletteEntry[] = [
  ...FIELDS_BY_NAME.map((k) => ({ id: `field:${k}`, label: TOTALS_FIELDS[k].name, make: () => newField(k, {}, uid()) })),
  { id: "block:row", label: "Row: values side by side", make: () => newBlock("row", uid()) },
  { id: "block:totals", label: "Totals group (pick the lines)", make: () => newBlock("totals", uid()) },
].sort((a, b) => a.label.localeCompare(b.label));

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
    case "field":
      return b.label ? `"${b.label}"` : "value only";
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
  // The selected part: a block, or one line of a Totals block.
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const selectedId = selectedPart?.blockId ?? null;
  const setSelectedId = (id: string | null) => setSelectedPart(id ? { blockId: id, lineId: null } : null);
  const inspectorRef = useRef<HTMLElement>(null);
  const [sampleKind, setSampleKind] = useState("regular");
  const [sample, setSample] = useState<ReceiptData | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [dragType, setDragType] = useState<string | null>(null); // label of what's being dragged in
  const [paletteSearch, setPaletteSearch] = useState("");
  const [leftTab, setLeftTab] = useState<"add" | "layers">("add");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  // The workspace's own discounts (not SC/PWD), to preview the receipt with each.
  const { data: allDiscounts } = useSWR<DiscountDTO[]>("/api/discounts");
  const ownDiscounts = (allDiscounts ?? []).filter((d) => !d.isSystem && d.isActive);
  // A formula on the receipt the owner wants the POS to charge ("Apply to POS").
  const [posFormula, setPosFormula] = useState<{ label: string; expr: string } | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [calibration, setCalibration] = useState<Calibration>(DEFAULT_CALIBRATION);
  const loaded = useRef(false);

  // ---------- undo / redo ----------
  // Steps of the design, newest last. Edits within a moment (typing) count as one step.
  const history = useRef<{ past: Template[]; future: Template[]; lastAt: number }>({ past: [], future: [], lastAt: 0 });
  const [steps, setSteps] = useState({ undo: 0, redo: 0 });
  const syncSteps = () => setSteps({ undo: history.current.past.length, redo: history.current.future.length });
  const canUndo = steps.undo > 0;
  const canRedo = steps.redo > 0;
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
        setBranches(data.branches ?? []);
        setVersions(data.versions ?? []);
        setCalibration(readCalibration());
        setTemplate(data.draft ?? data.published ?? buildPreset("classic", data.settings));
        setSaveState(data.draft || !data.published ? "unsaved" : "saved");
        // First visit: start with the guided setup.
        if (!data.draft && !data.published) setWizardOpen(true);
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

  const { errors, warnings, checklist } = useMemo(() => {
    if (!template) return { errors: [], warnings: [], checklist: [] };
    return { errors: sanitizeTemplate(template).errors, warnings: designNotes(template), checklist: designChecklist(template) };
  }, [template]);

  const change = (t: Template, { coalesce = true }: { coalesce?: boolean } = {}) => {
    if (template) {
      const h = history.current;
      const now = clock();
      if (!(coalesce && now - h.lastAt < 700 && h.past.length > 0)) {
        h.past.push(template);
        if (h.past.length > 100) h.past.shift();
      }
      h.lastAt = now;
      h.future = [];
      syncSteps();
    }
    setTemplate(t);
    setSaveState("unsaved");
    setMessage(null);
  };
  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev || !template) return;
    h.future.push(template);
    h.lastAt = 0;
    setTemplate(prev);
    setSaveState("unsaved");
    syncSteps();
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next || !template) return;
    h.past.push(template);
    h.lastAt = 0;
    setTemplate(next);
    setSaveState("unsaved");
    syncSteps();
  };
  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — but typing in a box keeps the box's own undo.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  const deselectRef = useRef(() => setSelectedPart(null));
  useEffect(() => {
    undoRef.current = undo;
    redoRef.current = redo;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
      // Esc: put the selection down to see the whole receipt.
      if (e.key === "Escape" && !typing && !document.querySelector('[role="dialog"]')) {
        deselectRef.current();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (typing) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const updateBlock = (b: Block) => template && change({ ...template, blocks: template.blocks.map((x) => (x.id === b.id ? b : x)) });

  // The quick toolbar's actions, on a block or on one totals line.
  const partAction = (action: BlockAction) => {
    if (!template || !selectedPart) return;
    const i = template.blocks.findIndex((x) => x.id === selectedPart.blockId);
    const b = template.blocks[i];
    if (!b) return;
    if (action === "more") {
      inspectorRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      inspectorRef.current?.animate([{ background: "#ecfdf5" }, { background: "#ffffff" }], { duration: 900 });
      return;
    }
    const lineId = selectedPart.lineId;
    if (lineId && b.type === "totals") {
      const li = b.lines.findIndex((l) => l.id === lineId);
      if (li < 0) return;
      let lines = [...b.lines];
      if (action === "up" && li > 0) lines = arrayMove(lines, li, li - 1);
      else if (action === "down" && li < lines.length - 1) lines = arrayMove(lines, li, li + 1);
      else if (action === "duplicate") {
        const copy = { ...lines[li], id: uid() };
        lines.splice(li + 1, 0, copy);
        setSelectedPart({ blockId: b.id, lineId: copy.id });
      } else if (action === "delete") {
        lines.splice(li, 1);
        setSelectedPart({ blockId: b.id, lineId: null });
      }
      // A group whose last line goes is removed too.
      if (lines.length === 0) {
        change({ ...template, blocks: template.blocks.filter((x) => x.id !== b.id) });
        return;
      }
      updateBlock({ ...b, lines });
      return;
    }
    const blocks = [...template.blocks];
    if (action === "up" && i > 0) change({ ...template, blocks: arrayMove(blocks, i, i - 1) });
    else if (action === "down" && i < blocks.length - 1) change({ ...template, blocks: arrayMove(blocks, i, i + 1) });
    else if (action === "duplicate") {
      const copy = withFreshIds(b);
      blocks.splice(i + 1, 0, copy);
      change({ ...template, blocks });
      setSelectedId(copy.id);
    } else if (action === "delete") {
      blocks.splice(i, 1);
      change({ ...template, blocks });
      setSelectedId(null);
    }
  };
  // Adds parts below the selected one (or at `index`), and selects the first.
  const insertBlock = (make: () => Block | Block[], index?: number) => {
    if (!template) return;
    const added = [make()].flat();
    if (added.length === 0) return;
    const at = index ?? (selectedId ? template.blocks.findIndex((x) => x.id === selectedId) + 1 : template.blocks.length);
    const blocks = [...template.blocks];
    blocks.splice(at < 0 ? blocks.length : at, 0, ...added);
    change({ ...template, blocks }, { coalesce: false });
    setSelectedId(added[0].id);
  };
  const addTile = (tile: Tile, index?: number) => insertBlock(() => makeTile(tile, uid), index);

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
      void refreshVersions();
    });

  const refreshVersions = async () => {
    try {
      const res = await fetch("/api/settings/receipt-template");
      const data = await res.json();
      if (res.ok) setVersions(data.versions ?? []);
    } catch {
      // the list just stays as it was
    }
  };

  const restoreVersion = async (v: VersionRow) => {
    if (!confirm(`Load the design from ${new Date(v.publishedAt).toLocaleString("en-PH")} into the editor? You can undo this.`)) return;
    setBusy("restore");
    setMessage(null);
    try {
      const res = await fetch(`/api/settings/receipt-template/versions/${v.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load that version.");
      change({ ...data.template, blocks: data.template.blocks.map(withFreshIds) }, { coalesce: false });
      setSelectedId(null);
      setMessage({ kind: "ok", text: "Loaded. Check it, then press \"Use this design\" to print with it again." });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const printTestPage = async () => {
    if (!template) return;
    setBusy("testpage");
    setMessage(null);
    try {
      const printer = await ensurePrinter();
      if (!printer) throw new Error("Connect your receipt printer first (the printer button at the top of the POS or any page).");
      const { testPageBytes } = await import("@/lib/receipt-designer/render");
      await printer.send(testPageBytes(template.paperWidth, calibration));
      setMessage({ kind: "ok", text: "Test page sent. Count where the digits wrap, then set the characters per line below." });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const updateCalibration = (next: Calibration) => {
    setCalibration(next);
    writeCalibration(next);
  };

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
      history.current = { past: [], future: [], lastAt: 0 };
      syncSteps();
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
    setDragType(id.startsWith("new:") ? TILES_BY_ID.get(id.slice(4))?.label ?? null : null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragType(null);
    if (!template || !e.over) return;
    // Pieces in the preview carry a prefix; they stand for the same blocks as the list.
    const unprefix = (id: string) => (id.startsWith(PREVIEW_PREFIX) ? id.slice(PREVIEW_PREFIX.length) : id);
    const activeId = unprefix(String(e.active.id));
    const overId = unprefix(String(e.over.id));
    if (activeId.startsWith("new:")) {
      const tile = TILES_BY_ID.get(activeId.slice(4));
      if (!tile) return;
      const index = overId === "layers-end" ? template.blocks.length : template.blocks.findIndex((b) => b.id === overId);
      addTile(tile, index < 0 ? template.blocks.length : index);
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
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}
              title={enabled ? "Receipts print with your design" : "Receipts print with the standard Nookly receipt"}
            >
              {enabled ? "Your design is on" : "Standard receipt"}
            </span>
            <span className="whitespace-nowrap text-[11px] text-zinc-400">
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : saveState === "unsaved" ? "Draft saved" : "In use"}
            </span>
            <Checklist
              items={checklist}
              onFix={(id) => {
                const tile = TILES_BY_ID.get(id);
                if (!tile) return;
                // Totals go just above the payment part; the rest at the end.
                const pay = template.blocks.findIndex((b) => b.type === "payment" || (b.type === "field" && (b.key === "cash" || b.key === "change")));
                addTile(tile, tile.category === "totals" && pay >= 0 ? pay : id === "receiptNo" ? 1 : undefined);
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-linear-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-emerald-600 hover:to-teal-600"
          >
            <Sparkles className="h-3.5 w-3.5" /> Guided setup
          </button>
          <select className="h-8 w-48 rounded-full border border-zinc-200 bg-white px-3 text-xs" value={sampleKind}
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
            {ownDiscounts.length > 0 && (
              <optgroup label="With one of your discounts">
                {ownDiscounts.map((d) => (
                  <option key={d.id} value={`discount:${d.id}`}>
                    Preview: {d.name} discount
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <div className="inline-flex overflow-hidden rounded-full border border-zinc-200 bg-white">
            <button type="button" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="px-2.5 py-1.5 text-zinc-700 hover:bg-zinc-50 disabled:opacity-30">
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" className="border-l border-zinc-200 px-2.5 py-1.5 text-zinc-700 hover:bg-zinc-50 disabled:opacity-30">
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <button type="button" className={btn} onClick={testPrint} disabled={!sample || busy !== null}>
            {busy === "print" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Test print
          </button>
          <details className="relative" ref={moreRef}>
            <summary className={`${btn} cursor-pointer list-none`}>
              <MoreHorizontal className="h-3.5 w-3.5" /> More
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 w-72 space-y-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
              <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Start over from a ready-made look</p>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    moreRef.current?.removeAttribute("open");
                    applyPreset(p.key);
                  }}
                  className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-zinc-50"
                >
                  <span className="block text-xs font-semibold text-zinc-800">{p.label}</span>
                  <span className="block text-[11px] leading-snug text-zinc-500">{p.description}</span>
                </button>
              ))}
              {(published && saveState !== "saved") || enabled ? <div className="my-1 border-t border-zinc-100" /> : null}
              {published && saveState !== "saved" && (
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50" onClick={discard} disabled={busy !== null}>
                  <Trash2 className="h-3.5 w-3.5" /> Discard changes since last use
                </button>
              )}
              {enabled && (
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50" onClick={revert} disabled={busy !== null}>
                  <RotateCcw className="h-3.5 w-3.5" /> Go back to the standard Nookly receipt
                </button>
              )}
            </div>
          </details>
          <button
            type="button"
            onClick={() => setConfirmPublish(true)}
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
            <div className="flex border-b border-zinc-100 text-xs font-semibold">
              {(
                [
                  ["add", "Add pieces"],
                  ["layers", `On the receipt (${template.blocks.length})`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLeftTab(k)}
                  className={`flex-1 border-b-2 px-2 py-2 ${leftTab === k ? "border-emerald-600 text-emerald-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {leftTab === "add" && (
              <div className="flex min-h-0 flex-1 flex-col p-3">
                <Tiles template={template} sample={sample} onAdd={(t) => addTile(t)} />
                <details className="mt-2 rounded-lg border border-zinc-200 p-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-zinc-600">Advanced: any single value</summary>
                  <input
                    value={paletteSearch}
                    onChange={(e) => setPaletteSearch(e.target.value)}
                    placeholder="Search values…"
                    className="my-2 h-7 w-full rounded-md border border-zinc-200 px-2 text-xs outline-none focus:border-emerald-500"
                  />
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {ADVANCED.filter((e) => e.label.toLowerCase().includes(paletteSearch.trim().toLowerCase())).map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => insertBlock(e.make)}
                        className="block w-full truncate rounded-md border border-zinc-200 px-2 py-1 text-left text-[11px] text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50"
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            )}
            <div className={`min-h-0 flex-1 overflow-y-auto p-3 ${leftTab === "layers" ? "" : "hidden"}`}>
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
          {/* A click anywhere off the receipt (the paper and its toolbar) clears the selection. */}
          <main className="min-w-0 flex-1 overflow-auto px-6 py-8" onClick={(e) => !(e.target as HTMLElement).closest(".rd-preview") && setSelectedId(null)}>
            {sampleError && <p className="mb-3 text-center text-xs text-amber-700">{sampleError}</p>}
            {sample ? (
              <Preview
                template={template}
                data={sample}
                selected={selectedPart}
                onSelect={setSelectedPart}
                onBlockChange={updateBlock}
                override={calibration.cols[template.paperWidth]}
                toolbar={(edit, placement) =>
                  selected && (
                    <QuickBar
                      block={selected}
                      lineId={selectedPart?.lineId ?? null}
                      printMode={template.printMode}
                      onChange={updateBlock}
                      onAction={partAction}
                      onEditText={edit}
                      placement={placement}
                    />
                  )
                }
              />
            ) : (
              <p className="text-center text-sm text-zinc-400">Loading the sample sale…</p>
            )}
          </main>

          {/* right: inspector */}
          <aside ref={inspectorRef} className="w-80 shrink-0 overflow-y-auto border-l border-zinc-200 bg-white p-4">
            {selected ? (
              <Inspector
                key={selected.id}
                block={selected}
                focusLineId={selectedPart?.lineId ?? null}
                onChargeFormula={(f) => {
                  // The POS panel lives under Receipt settings; show it with the formula ready to confirm.
                  setPosFormula(f);
                  setSelectedId(null);
                }}
                printMode={template.printMode}
                onChange={updateBlock}
                sample={sample}
                branches={branches}
                onBreakApart={() => {
                  const i = template.blocks.findIndex((x) => x.id === selected.id);
                  const parts = breakApart(selected, uid);
                  const blocks = [...template.blocks];
                  blocks.splice(i, 1, ...parts);
                  change({ ...template, blocks });
                  setSelectedId(parts.find((p) => p.type === "field")?.id ?? parts[0]?.id ?? null);
                }}
              />
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
                  <StyleEditor value={template.theme.style} onChange={(style) => change({ ...template, theme: { ...template.theme, style } })} printMode={template.printMode} />
                </div>

                <ValueFormatEditor value={{ ...DEFAULT_FORMAT, ...template.theme.format }} onChange={(format) => change({ ...template, theme: { ...template.theme, format } })} />

                <PosPricing formulaDraft={posFormula} onFormulaDraftDone={() => setPosFormula(null)} onApplied={() => void loadSample(sampleKind)} />

                <div className="space-y-2 border-t border-zinc-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Printer on this device</p>
                  <button type="button" className={btn} onClick={printTestPage} disabled={busy !== null}>
                    {busy === "testpage" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />} Print a test page
                  </button>
                  <p className="text-[11px] leading-snug text-zinc-500">
                    The test page shows how many characters your printer really fits, every size and style, and the edges it can reach. If it fits a
                    different number than usual, set it here: this device&apos;s receipts and preview will follow.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["A", "B"] as const).map((font) => (
                      <label key={font} className="block space-y-1">
                        <span className="text-xs font-medium text-zinc-600">
                          Font {font} characters ({template.paperWidth}mm)
                        </span>
                        <input
                          type="number"
                          min={font === "A" ? 20 : 28}
                          max={font === "A" ? 56 : 72}
                          placeholder={String(columnsFor(template.paperWidth, font, 1))}
                          value={calibration.cols[template.paperWidth][font] ?? ""}
                          onChange={(e) =>
                            updateCalibration({
                              ...calibration,
                              cols: {
                                ...calibration.cols,
                                [template.paperWidth]: { ...calibration.cols[template.paperWidth], [font]: e.target.value === "" ? null : Number(e.target.value) },
                              },
                            })
                          }
                          className="h-8 w-full rounded-md border border-zinc-200 px-2 text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-zinc-600">Left margin: {calibration.leftMargin} dots ({(calibration.leftMargin / 8).toFixed(1)}mm)</span>
                    <input
                      type="range"
                      min={0}
                      max={64}
                      value={calibration.leftMargin}
                      onChange={(e) => updateCalibration({ ...calibration, leftMargin: Number(e.target.value) })}
                      className="w-full accent-emerald-600"
                    />
                  </label>
                  {(calibration.cols[58].A || calibration.cols[58].B || calibration.cols[80].A || calibration.cols[80].B || calibration.leftMargin > 0) && (
                    <button type="button" onClick={() => updateCalibration(DEFAULT_CALIBRATION)} className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
                      Reset to the standard widths
                    </button>
                  )}
                </div>

                <div className="space-y-2 border-t border-zinc-100 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Version history</p>
                  {versions.length === 0 ? (
                    <p className="text-[11px] text-zinc-500">Each time you press &quot;Use this design&quot;, a copy is kept here so you can go back to it.</p>
                  ) : (
                    <ul className="space-y-1">
                      {versions.map((v, i) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-2 py-1.5">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-zinc-800">
                              {new Date(v.publishedAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                              {i === 0 && enabled && <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-semibold text-emerald-800">in use</span>}
                            </span>
                            <span className="block truncate text-[11px] text-zinc-500">
                              {v.publishedBy ?? "Owner"} · {v.paperWidth}mm · {v.printMode === "IMAGE" ? "image" : "text"} · {v.blockCount} blocks
                            </span>
                          </span>
                          <button type="button" onClick={() => restoreVersion(v)} disabled={busy !== null} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50">
                            Restore
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
      {wizardOpen && (
        <Wizard
          settings={settings}
          paperWidth={template.paperWidth}
          hasLogo={Boolean(settings.logoUrl)}
          onClose={() => setWizardOpen(false)}
          onFinish={async ({ template: t, roundingStep }) => {
            change({ ...t, blocks: t.blocks.map(withFreshIds) }, { coalesce: false });
            setWizardOpen(false);
            setSelectedId(null);
            let roundingNote = "";
            if (roundingStep !== undefined) {
              // A POS change: saved to the POS history, where it can be undone.
              const res = await fetch("/api/settings/pos-changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pricing", roundingStep }) });
              const json = await res.json().catch(() => null);
              if (res.ok) {
                await mutateSWR("/api/settings/pos-changes", json, { revalidate: false });
                roundingNote = roundingStep ? ` Cash sales now round down to ₱${roundingStep.toFixed(2)} (undo it under What the POS charges).` : " Cash sales are back to the exact amount.";
                void loadSample(sampleKind);
              } else roundingNote = ` Cash rounding wasn't changed: ${json?.error ?? "please try again"}.`;
            }
            setMessage({ kind: "ok", text: `Your receipt is ready! Click any part of it to change it, or add pieces from the left. Undo is always there.${roundingNote}` });
            setCelebrate(true);
            setTimeout(() => setCelebrate(false), 3200);
          }}
        />
      )}
      {celebrate && <Confetti />}
      {confirmPublish && (
        <ConfirmDialog
          title={enabled ? "Print receipts with these changes?" : "Start printing with this design?"}
          confirmLabel={enabled ? "Yes, use the changes" : "Yes, use this design"}
          busy={busy === "publish"}
          onCancel={() => setConfirmPublish(false)}
          onConfirm={async () => {
            await publish();
            setConfirmPublish(false);
          }}
        >
          <p>
            From now on, every new receipt and reprint{branches.length > 1 ? " at all your branches" : ""} prints with this design (
            {template.paperWidth}mm, {template.printMode === "TEXT" ? "text mode" : "image mode"}). The amounts the POS charges don&apos;t change.
          </p>
          {checklist.some((c) => !c.done) ? (
            <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-semibold">Not on this receipt yet:</p>
              <ul className="ml-4 list-disc">
                {checklist.filter((c) => !c.done).map((c) => (
                  <li key={c.key}>{c.label}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">✓ Everything a receipt needs is there.</p>
          )}
          <p className="text-xs text-zinc-500">Changed your mind later? Restore an earlier version, or go back to the standard Nookly receipt from the More menu.</p>
        </ConfirmDialog>
      )}
      <DragOverlay>{dragType ? <div className="rounded-md border border-emerald-400 bg-white px-3 py-1.5 text-xs font-semibold shadow-lg">{dragType}</div> : null}</DragOverlay>
    </DndContext>
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
        <span className="block truncate text-sm text-zinc-800">{block.type === "field" ? TOTALS_FIELDS[block.key].name : BLOCK_LABELS[block.type]}</span>
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

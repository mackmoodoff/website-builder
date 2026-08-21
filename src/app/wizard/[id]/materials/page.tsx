"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

const MIN_SELECTED = 8;

type WizardImage = {
  id: string;
  source: string;
  prompt: string | null;
  dataUrl: string;
  selected: boolean;
};

type Wizard = {
  id: string;
  status: string;
  brandName: string;
  scrapedData: string | null;
  images: WizardImage[];
};

export default function MaterialsPage() {
  const params = useParams();
  const router = useRouter();
  const wizardId = params.id as string;

  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [scraping, setScraping] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  const loadWizard = useCallback(async () => {
    const res = await fetch(`/api/wizard/${wizardId}`);
    const data = await res.json();
    if (res.ok) {
      setWizard(data.wizard);
      setSelectedIds(new Set(data.wizard.images.filter((i: WizardImage) => i.selected).map((i: WizardImage) => i.id)));
    }
    return data.wizard as Wizard | undefined;
  }, [wizardId]);

  useEffect(() => {
    (async () => {
      const w = await loadWizard();
      if (w && !w.scrapedData) {
        setScraping(true);
        try {
          await fetch(`/api/wizard/${wizardId}/scrape`, { method: "POST" });
        } finally {
          setScraping(false);
          await loadWizard();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizardId]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/wizard/${wizardId}/images/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, count: 4 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      await loadWizard();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    setContinuing(true);
    setError(null);
    try {
      const res = await fetch(`/api/wizard/${wizardId}/images/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save selection");
      router.push(`/wizard/${wizardId}/confirm`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setContinuing(false);
    }
  }

  if (!wizard) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-neutral-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Materials</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Pull reference images from your competitor/supplier, then generate branded creatives.
          Select at least {MIN_SELECTED} images to continue.
        </p>
      </div>

      {scraping && <p className="text-sm text-neutral-500">Pulling reference images from competitor & supplier...</p>}

      <section className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4">
        <label className="text-sm font-medium" htmlFor="brief">
          Creative brief (optional)
        </label>
        <textarea
          id="brief"
          rows={3}
          placeholder="e.g. warm, minimal, soft natural light, lifestyle shots on a wooden table"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {generating ? "Generating..." : "Generate 4 images"}
        </button>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {wizard.images.map((img) => (
          <label
            key={img.id}
            className={`relative cursor-pointer rounded-md border-2 p-1 ${
              selectedIds.has(img.id) ? "border-emerald-500" : "border-transparent"
            }`}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(img.id)}
              onChange={() => toggleSelected(img.id)}
              className="absolute right-2 top-2 h-4 w-4"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.dataUrl} alt={img.source} className="aspect-square w-full rounded object-cover" />
            <span className="mt-1 block text-center text-xs text-neutral-500">{img.source}</span>
          </label>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <span className="text-sm text-neutral-500">
          {selectedIds.size} / {MIN_SELECTED}+ selected
        </span>
        <button
          onClick={handleContinue}
          disabled={selectedIds.size < MIN_SELECTED || continuing}
          className="rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {continuing ? "Saving..." : "Continue"}
        </button>
      </div>
    </main>
  );
}

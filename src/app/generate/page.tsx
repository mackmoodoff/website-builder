"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { StorePlan } from "@/lib/store-plan";

type PushResult = {
  pages: { title: string; ok: boolean; error?: string }[];
  products: { title: string; ok: boolean; error?: string }[];
  brandMetafieldsOk: boolean;
};

function GeneratePageInner() {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [plan, setPlan] = useState<StorePlan | null>(null);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPlan(null);
    setPushResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setProjectId(data.projectId);
      setPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handlePush() {
    if (!projectId) return;
    setPushing(true);
    setError(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Push failed");
      setPushResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Generate your store</h1>
        {shop ? (
          <p className="mt-1 text-sm text-neutral-500">Connected: {shop}</p>
        ) : (
          <p className="mt-1 text-sm text-amber-600">
            No shop connected yet — go back and connect your store first.
          </p>
        )}
      </div>

      <form onSubmit={handleGenerate} className="flex flex-col gap-3">
        <label htmlFor="prompt" className="text-sm font-medium">
          Describe your business
        </label>
        <textarea
          id="prompt"
          required
          rows={4}
          placeholder="e.g. A handmade candle brand selling soy candles with botanical scents, aimed at gift buyers."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={loading || !shop}
          className="rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate with AI"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {plan && (
        <section className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4">
          <div>
            <h2 className="text-xl font-semibold">{plan.businessName}</h2>
            <p className="text-neutral-500">{plan.tagline}</p>
          </div>

          <div>
            <h3 className="font-medium">Navigation</h3>
            <p className="text-sm text-neutral-600">{plan.navigation.join(" · ")}</p>
          </div>

          <div>
            <h3 className="font-medium">Homepage</h3>
            <p className="text-sm font-semibold">{plan.homepage.heroHeading}</p>
            <p className="text-sm text-neutral-600">{plan.homepage.heroSubheading}</p>
          </div>

          <div>
            <h3 className="font-medium">Pages ({plan.pages.length})</h3>
            <ul className="list-inside list-disc text-sm text-neutral-600">
              {plan.pages.map((p) => (
                <li key={p.handle}>{p.title}</li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-medium">Starter products ({plan.products.length})</h3>
            <ul className="list-inside list-disc text-sm text-neutral-600">
              {plan.products.map((p) => (
                <li key={p.title}>
                  {p.title} — {p.priceRange}
                </li>
              ))}
            </ul>
          </div>

          <button
            onClick={handlePush}
            disabled={pushing}
            className="rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pushing ? "Pushing to Shopify..." : "Push to Shopify"}
          </button>
        </section>
      )}

      {pushResult && (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium">Pushed to Shopify</p>
          <p>Pages: {pushResult.pages.filter((p) => p.ok).length}/{pushResult.pages.length} created</p>
          <p>Products: {pushResult.products.filter((p) => p.ok).length}/{pushResult.products.length} created</p>
          <p>Brand metafields: {pushResult.brandMetafieldsOk ? "set" : "failed"}</p>
        </section>
      )}
    </main>
  );
}

export default function GeneratePage() {
  return (
    <Suspense>
      <GeneratePageInner />
    </Suspense>
  );
}

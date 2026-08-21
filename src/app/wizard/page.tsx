"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MARKETS } from "@/lib/markets";

function WizardFormInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const shop = searchParams.get("shop") ?? "";

  const [market, setMarket] = useState(MARKETS[0].code);
  const [productName, setProductName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [supplierUrl, setSupplierUrl] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogoDataUrl, setBrandLogoDataUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#1a1a1a");
  const [storeEmail, setStoreEmail] = useState("");
  const [competitorLinks, setCompetitorLinks] = useState([""]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBrandLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function updateCompetitorLink(index: number, value: string) {
    setCompetitorLinks((links) => links.map((l, i) => (i === index ? value : l)));
  }

  function addCompetitorLink() {
    setCompetitorLinks((links) => [...links, ""]);
  }

  function removeCompetitorLink(index: number) {
    setCompetitorLinks((links) => links.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/wizard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          market,
          productName,
          productDescription,
          supplierUrl: supplierUrl || undefined,
          brandName,
          brandLogoDataUrl,
          brandColor,
          storeEmail,
          competitorLinks: competitorLinks.map((l) => l.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      router.push(`/wizard/${data.wizardId}/materials`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Build your store</h1>
        {shop ? (
          <p className="mt-1 text-sm text-neutral-500">Connected: {shop}</p>
        ) : (
          <p className="mt-1 text-sm text-amber-600">No shop connected — connect your store first.</p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="market">
            Target market
          </label>
          <select
            id="market"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          >
            {MARKETS.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name} ({m.languageName})
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-500">
            Determines the site language and the language used in generated image text.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="productName">
              Product name
            </label>
            <input
              id="productName"
              required
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="productDescription">
              Short description
            </label>
            <textarea
              id="productDescription"
              required
              rows={3}
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="supplierUrl">
              Supplier link (e.g. AliExpress) — optional
            </label>
            <input
              id="supplierUrl"
              type="url"
              placeholder="https://aliexpress.com/item/..."
              value={supplierUrl}
              onChange={(e) => setSupplierUrl(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="brandName">
              Brand name
            </label>
            <input
              id="brandName"
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="brandLogo">
              Brand logo
            </label>
            <input id="brandLogo" type="file" accept="image/*" onChange={handleLogoChange} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="brandColor">
              Brand color
            </label>
            <input
              id="brandColor"
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-10 w-16 rounded-md border border-neutral-300"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium" htmlFor="storeEmail">
              Store email
            </label>
            <input
              id="storeEmail"
              type="email"
              required
              value={storeEmail}
              onChange={(e) => setStoreEmail(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2"
            />
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium">Competitor links (first one is the main competitor)</label>
          {competitorLinks.map((link, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="url"
                required={index === 0}
                placeholder="https://competitor-store.com"
                value={link}
                onChange={(e) => updateCompetitorLink(index, e.target.value)}
                className="w-full rounded-md border border-neutral-300 px-3 py-2"
              />
              {competitorLinks.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCompetitorLink(index)}
                  className="rounded-md border border-neutral-300 px-3 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addCompetitorLink}
            className="self-start text-sm text-neutral-600 underline"
          >
            + Add competitor
          </button>
        </section>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !shop}
          className="rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </form>
    </main>
  );
}

export default function WizardPage() {
  return (
    <Suspense>
      <WizardFormInner />
    </Suspense>
  );
}

"use client";

import { useState } from "react";

export default function HomePage() {
  const [shop, setShop] = useState("");

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = shop.trim().toLowerCase();
    const domain = trimmed.includes(".myshopify.com") ? trimmed : `${trimmed}.myshopify.com`;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- /api/auth issues a server redirect to Shopify's OAuth page, not an internal Next.js route
    window.location.href = `/api/auth?shop=${encodeURIComponent(domain)}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-3xl font-semibold">AI Store Builder</h1>
        <p className="mt-2 text-neutral-500">
          Describe your business, let AI draft your Shopify store (pages, copy,
          starter products), then push it straight to your store to edit and
          launch.
        </p>
      </div>

      <form onSubmit={handleConnect} className="flex flex-col gap-3">
        <label htmlFor="shop" className="text-sm font-medium">
          Your Shopify store domain
        </label>
        <div className="flex gap-2">
          <input
            id="shop"
            name="shop"
            required
            placeholder="your-store"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2"
          />
          <span className="flex items-center text-neutral-400">.myshopify.com</span>
        </div>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-neutral-800"
        >
          Connect store
        </button>
      </form>
    </main>
  );
}

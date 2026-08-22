"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { SitePlan } from "@/lib/site-plan";

type BuildLogEntry = {
  step: string;
  status: "in_progress" | "done" | "error";
  message: string;
  at: string;
};

type StatusResponse = {
  status: string;
  buildLog: BuildLogEntry[];
  sitePlan: SitePlan | null;
  error: string | null;
  themeId: string | null;
  themePreviewUrl: string | null;
};

type PushResult = {
  product: { ok: boolean; productId?: string; error?: string; publishedToOnlineStore: boolean; publishError?: string };
  media: { attempted: number; uploaded: number; errors: string[] };
  theme: { ok: boolean; themeId?: string; previewUrl?: string; error?: string };
  themeContent: { mode: "auto" } | { mode: "manual"; heading: string; subheading: string; reason: string };
};

const TOTAL_STEPS = 4; // review, home_copy, product_copy, cart_checkout

export default function BuildPage() {
  const params = useParams();
  const wizardId = params.id as string;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      const res = await fetch(`/api/wizard/${wizardId}/status`);
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        if (data.status === "built" || data.status === "failed" || data.status === "pushed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    }
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [wizardId]);

  async function handlePush() {
    setPushing(true);
    setPushError(null);
    try {
      const res = await fetch(`/api/wizard/${wizardId}/push`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Push failed");
      setPushResult(data.result);
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }

  const doneSteps = status?.buildLog.filter((l) => l.status === "done").length ?? 0;
  const progressPct = Math.min(100, Math.round((doneSteps / TOTAL_STEPS) * 100));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Building your store</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Claude is drafting your store structure — original copy, inspired by your competitor
          reference, in your target market&apos;s language.
        </p>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full bg-emerald-600 transition-all"
          style={{ width: `${status?.status === "built" || status?.status === "pushed" ? 100 : progressPct}%` }}
        />
      </div>

      <ul className="flex flex-col gap-2 text-sm">
        {status?.buildLog.map((entry, i) => (
          <li key={i} className="flex items-center gap-2">
            <span>
              {entry.status === "done" ? "✅" : entry.status === "error" ? "❌" : "⏳"}
            </span>
            <span className={entry.status === "error" ? "text-red-600" : "text-neutral-700"}>
              {entry.message}
            </span>
          </li>
        ))}
      </ul>

      {status?.status === "failed" && !status.sitePlan && (
        <p className="text-sm text-red-600">Build failed: {status.error}</p>
      )}

      {status?.sitePlan != null && status.status !== "building" && !pushResult && (
        <button
          onClick={handlePush}
          disabled={pushing}
          className="self-start rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pushing ? "Pushing to Shopify..." : status.status === "failed" ? "Retry push to Shopify" : "Push to Shopify"}
        </button>
      )}

      {pushError && <p className="text-sm text-red-600">{pushError}</p>}

      {pushResult && (
        <section className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-medium">Pushed to Shopify</p>
          <p>
            Product:{" "}
            {pushResult.product.ok
              ? pushResult.product.publishedToOnlineStore
                ? "active & live in store"
                : "active (not yet visible — publish to Online Store channel manually)"
              : `failed — ${pushResult.product.error}`}
          </p>
          {pushResult.product.ok && !pushResult.product.publishedToOnlineStore && pushResult.product.publishError && (
            <p className="text-xs opacity-80">Publish error: {pushResult.product.publishError}</p>
          )}
          <p>
            Images: {pushResult.media.uploaded}/{pushResult.media.attempted} uploaded
            {pushResult.media.errors.length > 0 && ` (${pushResult.media.errors.length} skipped)`}
          </p>
          <p>Theme: {pushResult.theme.ok ? "created (unpublished draft)" : `failed — ${pushResult.theme.error}`}</p>
          {pushResult.theme.previewUrl && (
            <a
              href={pushResult.theme.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 self-start rounded-md bg-black px-4 py-2 font-medium text-white"
            >
              Open theme editor
            </a>
          )}
        </section>
      )}

      {pushResult && pushResult.themeContent.mode === "manual" && (
        <section className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          <p className="font-medium">Shopify CLI push failed</p>
          <p className="whitespace-pre-wrap break-words text-xs">{pushResult.themeContent.reason}</p>
        </section>
      )}

      {pushResult && pushResult.theme.ok && pushResult.themeContent.mode === "auto" && (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-medium">Custom theme applied automatically</p>
          <p>
            A fully custom-authored header, footer, and homepage (hero, features, testimonials,
            closing CTA) were pushed via the Shopify CLI — no default Dawn sections. Add your
            brand name/logo in the Theme Editor whenever you like.
          </p>
        </section>
      )}

      {pushResult && pushResult.theme.ok && pushResult.themeContent.mode === "manual" && status?.sitePlan && (
        <section className="flex flex-col gap-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div>
            <p className="font-medium">Automatic branding wasn&apos;t available — finish manually in the Theme Editor</p>
            <p className="text-xs opacity-80">Reason: {pushResult.themeContent.reason}</p>
            <p>
              Everything below is already written by Claude — paste it into the theme customizer
              (~5 minutes total).
            </p>
          </div>

          <div>
            <p className="font-semibold">Homepage — hero</p>
            <p>
              • Heading: <strong>{pushResult.themeContent.heading}</strong>
            </p>
            <p>
              • Subheading: <strong>{pushResult.themeContent.subheading}</strong>
            </p>
          </div>

          <div>
            <p className="font-semibold">Homepage — add a section per item below (Rich text or Text works)</p>
            {status.sitePlan.home.sections.map((s, i) => (
              <p key={i}>
                • <strong>{s.heading}</strong> — {s.body}
              </p>
            ))}
          </div>

          <div>
            <p className="font-semibold">Product page — paste into the product&apos;s description</p>
            <p>
              • Headline: <strong>{status.sitePlan.productPage.headline}</strong>
            </p>
            {status.sitePlan.productPage.bulletPoints.map((b, i) => (
              <p key={i}>• {b}</p>
            ))}
            <p>Trust badges: {status.sitePlan.productPage.trustBadges.join(" · ")}</p>
          </div>

          <div>
            <p className="font-semibold">Cart &amp; checkout messaging</p>
            <p>• Cart shipping note: {status.sitePlan.cart.shippingNote}</p>
            <p>• Cart upsell message: {status.sitePlan.cart.upsellMessage}</p>
            <p>• Checkout thank-you message (Settings → Checkout): {status.sitePlan.checkoutBranding.thankYouMessage}</p>
          </div>
        </section>
      )}
    </main>
  );
}

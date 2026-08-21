"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

type BuildLogEntry = {
  step: string;
  status: "in_progress" | "done" | "error";
  message: string;
  at: string;
};

type StatusResponse = {
  status: string;
  buildLog: BuildLogEntry[];
  sitePlan: unknown;
  error: string | null;
  themeId: string | null;
  themePreviewUrl: string | null;
};

type PushResult = {
  product: { ok: boolean; productId?: string; error?: string };
  media: { attempted: number; uploaded: number; errors: string[] };
  theme: { ok: boolean; themeId?: number; previewUrl?: string; error?: string };
  logo: { ok: boolean; error?: string };
  hero: { ok: boolean; error?: string };
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

      {status?.status === "failed" && (
        <p className="text-sm text-red-600">Build failed: {status.error}</p>
      )}

      {status?.status === "built" && !pushResult && (
        <button
          onClick={handlePush}
          disabled={pushing}
          className="self-start rounded-md bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pushing ? "Pushing to Shopify..." : "Push to Shopify"}
        </button>
      )}

      {pushError && <p className="text-sm text-red-600">{pushError}</p>}

      {pushResult && (
        <section className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium">Pushed to Shopify</p>
          <p>Product: {pushResult.product.ok ? "created (draft)" : `failed — ${pushResult.product.error}`}</p>
          <p>
            Images: {pushResult.media.uploaded}/{pushResult.media.attempted} uploaded
            {pushResult.media.errors.length > 0 && ` (${pushResult.media.errors.length} skipped)`}
          </p>
          <p>Theme: {pushResult.theme.ok ? "created (unpublished draft)" : `failed — ${pushResult.theme.error}`}</p>
          <p>Logo: {pushResult.logo.ok ? "set" : `not set — ${pushResult.logo.error}`}</p>
          <p>Homepage hero copy: {pushResult.hero.ok ? "set" : `not set — ${pushResult.hero.error}`}</p>
          {pushResult.theme.previewUrl && (
            <a
              href={pushResult.theme.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 self-start rounded-md bg-black px-4 py-2 font-medium text-white"
            >
              Open theme editor
            </a>
          )}
        </section>
      )}
    </main>
  );
}

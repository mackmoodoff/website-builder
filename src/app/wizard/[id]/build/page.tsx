"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
};

const TOTAL_STEPS = 4; // review, home_copy, product_copy, cart_checkout

export default function BuildPage() {
  const params = useParams();
  const router = useRouter();
  const wizardId = params.id as string;

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirected = useRef(false);

  useEffect(() => {
    async function poll() {
      const res = await fetch(`/api/wizard/${wizardId}/status`);
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        if (data.status === "built" && data.sitePlan && !redirected.current) {
          redirected.current = true;
          if (pollRef.current) clearInterval(pollRef.current);
          router.push(`/wizard/${wizardId}/preview`);
        }
        if (data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    }
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [wizardId, router]);

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
          style={{ width: `${status?.status === "built" ? 100 : progressPct}%` }}
        />
      </div>

      {status?.buildLog && status.buildLog.length > 0 && (
        <div className="h-6 overflow-hidden text-sm">
          {(() => {
            const latest = status.buildLog[status.buildLog.length - 1];
            return (
              <p key={status.buildLog.length} className="build-step-anim flex items-center gap-2">
                <span>{latest.status === "done" ? "✅" : latest.status === "error" ? "❌" : "⏳"}</span>
                <span className={latest.status === "error" ? "text-red-600" : "text-neutral-700"}>
                  {latest.message}
                </span>
              </p>
            );
          })()}
        </div>
      )}

      {status?.status === "failed" && <p className="text-sm text-red-600">Build failed: {status.error}</p>}

      {status?.status === "built" && <p className="text-sm text-neutral-500">Opening your live preview...</p>}
    </main>
  );
}

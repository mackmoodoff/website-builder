"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ConfirmPage() {
  const params = useParams();
  const router = useRouter();
  const wizardId = params.id as string;

  const [competitorLinks, setCompetitorLinks] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [mainLink, setMainLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/wizard/${wizardId}`);
      const data = await res.json();
      if (res.ok) {
        const links: string[] = JSON.parse(data.wizard.competitorLinks);
        setCompetitorLinks(links);
        setMainLink(links[0] ?? "");
      }
      setLoading(false);
    })();
  }, [wizardId]);

  async function saveEdit() {
    const next = [mainLink, ...competitorLinks.slice(1)];
    const res = await fetch(`/api/wizard/${wizardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ competitorLinks: next }),
    });
    if (res.ok) {
      setCompetitorLinks(next);
      setEditing(false);
    }
  }

  async function handleStartBuild() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/wizard/${wizardId}/build`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not start the build");
      }
      router.push(`/wizard/${wizardId}/build`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-neutral-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Confirm competitor reference</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Claude will build your store structure using this competitor as a reference for tone and
          positioning — the copy and images will be original to your brand, not copied verbatim.
        </p>
      </div>

      <div className="rounded-md border border-neutral-200 p-4">
        {editing ? (
          <div className="flex gap-2">
            <input
              type="url"
              value={mainLink}
              onChange={(e) => setMainLink(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2"
            />
            <button onClick={saveEdit} className="rounded-md bg-black px-3 py-2 text-sm text-white">
              Save
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="break-all">{mainLink}</span>
            <button onClick={() => setEditing(true)} className="text-sm underline">
              Edit
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleStartBuild}
        disabled={starting || editing}
        className="self-start rounded-md bg-black px-4 py-2 font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {starting ? "Starting..." : "Build my store"}
      </button>
    </main>
  );
}

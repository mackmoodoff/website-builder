"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { SitePlan } from "@/lib/site-plan";

type WizardImage = { id: string; source: string; dataUrl: string; selected: boolean };

type Wizard = {
  id: string;
  brandName: string;
  brandColor: string;
  productName: string;
  sitePlan: string | null;
  images: WizardImage[];
};

type ChatMessage = { role: "user" | "assistant"; text: string };

type PushResult = {
  product: { ok: boolean; productId?: string; error?: string; publishedToOnlineStore: boolean; publishError?: string };
  media: { attempted: number; uploaded: number; errors: string[] };
  theme: { ok: boolean; themeId?: string; previewUrl?: string; error?: string };
  themeContent: { mode: "auto" } | { mode: "manual"; heading: string; subheading: string; reason: string };
};

export default function PreviewPage() {
  const params = useParams();
  const wizardId = params.id as string;

  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [sitePlan, setSitePlan] = useState<SitePlan | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/wizard/${wizardId}`);
      const data = await res.json();
      if (res.ok) {
        setWizard(data.wizard);
        if (data.wizard.sitePlan) setSitePlan(JSON.parse(data.wizard.sitePlan));
      }
    })();
  }, [wizardId]);

  function onSectionClick(label: string) {
    if (!commentMode) return;
    setActiveSection(label);
    setInput(`[${label}] `);
    textareaRef.current?.focus();
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    const userMessage = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setInput("");
    setActiveSection(null);
    setSending(true);
    try {
      const res = await fetch(`/api/wizard/${wizardId}/chat-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Edit failed");
      setSitePlan(data.sitePlan);
      setMessages((prev) => [...prev, { role: "assistant", text: "Done — updated the preview above." }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Couldn't apply that: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setSending(false);
    }
  }

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

  if (!wizard || !sitePlan) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-neutral-500">Loading preview...</p>
      </main>
    );
  }

  const brandColor = wizard.brandColor;
  const selectedImages = wizard.images.filter((i) => i.selected);
  const heroImage = selectedImages[0]?.dataUrl;
  const { productPage } = sitePlan;

  const sectionProps = (label: string) => ({
    onClick: () => onSectionClick(label),
    className: `rounded ${commentMode ? "cursor-pointer transition hover:ring-2 hover:ring-offset-2" : ""}`,
    style:
      activeSection === label
        ? ({ boxShadow: `0 0 0 2px ${brandColor}` } as React.CSSProperties)
        : undefined,
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-col items-center gap-3">
        <h1 className="text-xl font-semibold">Live preview — product page (mobile)</h1>
        <p className="max-w-sm text-center text-xs text-neutral-500">
          Claude will also build your homepage and other pages — this preview focuses on the product
          page since that&apos;s the one you&apos;ll want to fine-tune first. Nothing goes live until
          you click &quot;Push to Shopify&quot; below.
        </p>

        {/* Mobile phone frame */}
        <div className="w-[380px] max-w-full overflow-hidden rounded-[28px] border-8 border-neutral-800 bg-white shadow-xl">
          <div className="h-[720px] overflow-y-auto text-left" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
            {/* Header */}
            <div
              style={{
                background: "#faf7f2",
                padding: "14px 16px",
                borderBottom: "1px solid rgba(0,0,0,0.06)",
                fontFamily: "Georgia, serif",
                fontStyle: "italic",
                fontSize: 18,
                color: "#2a2420",
              }}
            >
              {wizard.brandName}
            </div>

            {/* Product image */}
            <div {...sectionProps("Product image")}>
              <div style={{ aspectRatio: "1/1", background: "#faf7f2" }}>
                {heroImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={heroImage} alt={wizard.productName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
            </div>

            <div className="px-4 pt-4">
              <div style={{ color: brandColor, fontSize: 13, marginBottom: 6 }}>★★★★★</div>
              <h3 {...sectionProps("Product title")} style={{ ...sectionProps("Product title").style, fontSize: 18, fontWeight: 800, color: "#2a2420", marginBottom: 8 }}>
                {wizard.productName}
              </h3>
              <p {...sectionProps("Headline")} style={{ ...sectionProps("Headline").style, fontSize: 13, color: "#5a5248", marginBottom: 14 }}>
                {productPage.headline}
              </p>

              <div
                {...sectionProps("Bullet points")}
                style={{ ...sectionProps("Bullet points").style, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}
              >
                {productPage.bulletPoints.slice(0, 4).map((b, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, fontSize: 11.5, color: "#2a2420" }}>
                    <span style={{ color: brandColor }}>✓</span>
                    <span>{b}</span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  width: "100%",
                  padding: 14,
                  background: brandColor,
                  color: "#fff",
                  textAlign: "center",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  marginBottom: 20,
                }}
              >
                Add to Cart
              </div>

              <div {...sectionProps("Trust badges")} style={{ ...sectionProps("Trust badges").style, display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {productPage.trustBadges.map((b, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: "#faf7f2",
                      color: "#2a2420",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ color: brandColor }}>✓</span>
                    {b}
                  </span>
                ))}
              </div>

              {/* FAQ */}
              <div {...sectionProps("FAQ")} style={{ ...sectionProps("FAQ").style, paddingBottom: 20 }}>
                <h4 style={{ fontSize: 14, marginBottom: 10, color: "#2a2420" }}>FAQ</h4>
                {productPage.faqs.slice(0, 4).map((f, i) => (
                  <div key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.08)", padding: "8px 0" }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#2a2420" }}>{f.question}</p>
                    <p style={{ fontSize: 11.5, color: "#5a5248", marginTop: 4 }}>{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chat + push panel */}
      <div className="flex w-full flex-col gap-4 lg:w-[380px]">
        <div className="flex items-center justify-between rounded-md border border-neutral-200 p-3">
          <span className="text-sm font-medium">Comment mode</span>
          <button
            onClick={() => setCommentMode((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              commentMode ? "bg-emerald-600 text-white" : "bg-neutral-200 text-neutral-700"
            }`}
          >
            {commentMode ? "On — click a section" : "Off"}
          </button>
        </div>

        <div className="flex h-72 flex-col gap-2 overflow-y-auto rounded-md border border-neutral-200 p-3">
          {messages.length === 0 && (
            <p className="text-xs text-neutral-400">
              Tell me what to change — e.g. &quot;make the headline punchier&quot; — or turn on Comment
              mode and click a section first.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                m.role === "user" ? "self-end bg-black text-white" : "self-start bg-neutral-100 text-neutral-800"
              }`}
            >
              {m.text}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {activeSection && (
            <p className="text-xs text-neutral-500">
              Editing: <strong>{activeSection}</strong> —{" "}
              <button className="underline" onClick={() => setActiveSection(null)}>
                clear
              </button>
            </p>
          )}
          <textarea
            ref={textareaRef}
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="What should change?"
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="self-start rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {sending ? "Applying..." : "Send"}
          </button>
        </div>

        <hr className="border-neutral-200" />

        <button
          onClick={handlePush}
          disabled={pushing || !!pushResult}
          className="rounded-md bg-emerald-600 px-4 py-3 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pushing ? "Pushing to Shopify..." : pushResult ? "Pushed" : "Push to Shopify"}
        </button>
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
            <p>
              Images: {pushResult.media.uploaded}/{pushResult.media.attempted} uploaded
            </p>
            <p>Theme: {pushResult.theme.ok ? "created" : `failed — ${pushResult.theme.error}`}</p>
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
      </div>
    </main>
  );
}

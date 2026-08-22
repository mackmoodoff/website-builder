import { NextResponse } from "next/server";
import { getDawnZipBuffer } from "@/lib/dawn-local";

// Serves the cached Dawn theme zip so Shopify's theme-creation `src` fetch
// hits our own (reliable) tunnel instead of GitHub directly.
export async function GET() {
  const buffer = await getDawnZipBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=dawn.zip",
      "Content-Length": String(buffer.length),
    },
  });
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type CliPushResult = {
  themeId?: string;
  editorUrl?: string;
  previewUrl?: string;
  rawOutput: string;
};

/**
 * Pushes a local theme directory to Shopify via the Shopify CLI, authenticated
 * with a "Theme Access" app password (https://apps.shopify.com/theme-access) —
 * NOT this app's own OAuth token. Shopify's Admin API blocks apps from writing
 * theme code without a manual exemption; the CLI (acting as the merchant's own
 * theme-editing session) is not subject to that restriction.
 */
export async function pushThemeViaCli(params: { shop: string; path: string; themeId: number }): Promise<CliPushResult> {
  const password = process.env.SHOPIFY_THEME_ACCESS_TOKEN;
  if (!password) {
    throw new Error(
      "Missing SHOPIFY_THEME_ACCESS_TOKEN. Install the free 'Theme Access' app on the store " +
        "(https://apps.shopify.com/theme-access), generate a password, and set it in .env.local.",
    );
  }

  // Push to an already-created (existing) theme id — avoids "shopify theme push
  // --unpublished" needing an interactive prompt to confirm creating a new one,
  // which fails headlessly with "Flag not specified: --theme".
  const args = [
    "--yes",
    "@shopify/cli",
    "theme",
    "push",
    "--store",
    params.shop,
    "--password",
    password,
    "--path",
    params.path,
    "--theme",
    String(params.themeId),
  ];

  let stdout = "";
  let stderr = "";
  try {
    // shell: true is required on Windows — npx resolves to npx.cmd, and Node's
    // execFile won't find it without going through a shell (causes ENOENT).
    const result = await execFileAsync("npx", args, {
      timeout: 5 * 60_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env },
      shell: true,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(`shopify theme push failed: ${e.stderr || e.stdout || e.message}`);
  }

  const rawOutput = `${stdout}\n${stderr}`;
  const editorMatch = rawOutput.match(/themes\/(\d+)\/editor/);
  const editorUrlMatch = rawOutput.match(/https:\/\/admin\.shopify\.com\/store\/[^\s]+\/themes\/\d+\/editor/);
  const previewMatch = rawOutput.match(/https:\/\/[^\s]*preview_theme_id=\d+[^\s]*/);

  return {
    themeId: editorMatch?.[1] ?? String(params.themeId),
    editorUrl: editorUrlMatch?.[0],
    previewUrl: previewMatch?.[0],
    rawOutput,
  };
}

import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import puppeteer from "puppeteer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const inputPath = path.resolve(
  projectRoot,
  "docs/customer-wa-parser-templates.md",
);
const outputPath = path.resolve(
  projectRoot,
  "docs/customer-wa-parser-templates.pdf",
);

const KNOWN_BROWSER_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
].filter(Boolean);

async function resolveExecutablePath() {
  for (const candidate of KNOWN_BROWSER_PATHS) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try next installed browser path.
    }
  }

  return undefined;
}

async function waitForFile(filePath, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await access(filePath);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Timed out waiting for PDF output: ${filePath}`);
}

async function waitForProcessExit(process, timeoutMs = 5_000) {
  try {
    await Promise.race([
      once(process, "exit"),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // Ignore exit waiting issues during cleanup.
  }
}

function buildHtml(markdown) {
  const markdownNode = React.createElement(
    ReactMarkdown,
    {
      remarkPlugins: [remarkGfm],
      components: {
        h1: ({ children }) =>
          React.createElement("h1", { className: "title" }, children),
        h2: ({ children }) =>
          React.createElement("h2", { className: "section-title" }, children),
        p: ({ children }) =>
          React.createElement("p", { className: "paragraph" }, children),
        ul: ({ children }) =>
          React.createElement("ul", { className: "list list-bullet" }, children),
        ol: ({ children }) =>
          React.createElement("ol", { className: "list list-number" }, children),
        li: ({ children }) =>
          React.createElement("li", { className: "list-item" }, children),
        pre: ({ children }) =>
          React.createElement("pre", { className: "code-block" }, children),
        code: ({ children, className }) =>
          React.createElement(
            "code",
            { className: className ? `inline-code ${className}` : "inline-code" },
            children,
          ),
        strong: ({ children }) =>
          React.createElement("strong", { className: "strong" }, children),
      },
    },
    markdown,
  );

  const content = renderToStaticMarkup(markdownNode);

  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <title>Template Form Customer WA Parser Crumbella</title>
    <style>
      :root {
        color-scheme: light;
        --text: #1f2937;
        --muted: #6b7280;
        --border: #d1d5db;
        --panel: #f8fafc;
        --accent: #4338ca;
        --accent-soft: #eef2ff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        color: var(--text);
        background: white;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .page {
        width: 100%;
        max-width: 820px;
        margin: 0 auto;
        padding: 36px 28px 48px;
      }

      .cover {
        padding: 0 0 20px;
        border-bottom: 2px solid var(--accent-soft);
        margin-bottom: 24px;
      }

      .eyebrow {
        margin: 0 0 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--accent);
      }

      .cover-title {
        margin: 0;
        font-size: 28px;
        line-height: 1.2;
      }

      .cover-subtitle {
        margin: 10px 0 0;
        font-size: 14px;
        line-height: 1.6;
        color: var(--muted);
      }

      .title {
        margin: 0 0 18px;
        font-size: 30px;
        line-height: 1.2;
        color: #111827;
      }

      .section-title {
        margin: 28px 0 12px;
        padding-top: 6px;
        font-size: 18px;
        line-height: 1.35;
        color: #111827;
        page-break-after: avoid;
      }

      .paragraph {
        margin: 0 0 12px;
        font-size: 13px;
        line-height: 1.7;
      }

      .list {
        margin: 8px 0 16px 20px;
        padding: 0;
      }

      .list-number {
        padding-left: 8px;
      }

      .list-item {
        margin: 0 0 8px;
        font-size: 13px;
        line-height: 1.7;
      }

      .code-block {
        margin: 12px 0 18px;
        padding: 14px 16px;
        border: 1px solid var(--border);
        border-radius: 14px;
        background: var(--panel);
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 12px;
        line-height: 1.6;
        page-break-inside: avoid;
      }

      .code-block code {
        background: transparent;
        padding: 0;
        border: 0;
        border-radius: 0;
        font-size: inherit;
      }

      .inline-code {
        font-family: "SFMono-Regular", "Menlo", "Consolas", monospace;
        font-size: 0.94em;
        padding: 1px 5px;
        border-radius: 6px;
        background: #f3f4f6;
      }

      .strong {
        color: #111827;
      }

      @media print {
        .page {
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="cover">
        <p class="eyebrow">Crumbella</p>
        <h1 class="cover-title">Template Form Customer untuk WA Parser</h1>
        <p class="cover-subtitle">
          Format ini dipakai customer saat mengirim data order ke admin agar hasil
          parse WhatsApp lebih rapi, terutama untuk order multi-item.
        </p>
      </section>
      ${content}
    </main>
  </body>
</html>`;
}

async function main() {
  const markdown = await readFile(inputPath, "utf8");
  const html = buildHtml(markdown);
  const executablePath = await resolveExecutablePath();

  await mkdir(path.dirname(outputPath), { recursive: true });

  if (executablePath) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "wa-parser-pdf-"));
    const htmlPath = path.join(tempDir, "customer-wa-parser-templates.html");
    const userDataDir = path.join(tempDir, "chrome-profile");

    try {
      await rm(outputPath, { force: true });
      await writeFile(htmlPath, html, "utf8");
      const chromeProcess = spawn(
        executablePath,
        [
          "--headless=new",
          "--disable-gpu",
          "--disable-extensions",
          "--no-first-run",
          "--no-default-browser-check",
          `--user-data-dir=${userDataDir}`,
          "--allow-file-access-from-files",
          "--no-pdf-header-footer",
          `--print-to-pdf=${outputPath}`,
          `file://${htmlPath}`,
        ],
        {
          stdio: "ignore",
        },
      );

      try {
        await waitForFile(outputPath);
      } finally {
        chromeProcess.kill("SIGTERM");
        await waitForProcessExit(chromeProcess);
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  } else {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: 1240,
        height: 1754,
        deviceScaleFactor: 2,
      });
      await page.setContent(html, { waitUntil: "load" });
      await page.pdf({
        path: outputPath,
        format: "A4",
        printBackground: true,
        margin: {
          top: "14mm",
          right: "12mm",
          bottom: "14mm",
          left: "12mm",
        },
      });
    } finally {
      await browser.close();
    }
  }

  console.log(`PDF generated at ${outputPath}`);
}

await main();

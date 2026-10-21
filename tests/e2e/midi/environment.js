import { chromium } from "playwright";
import { createMidiSimulator } from "../midi-simulator.js";

const root = new URL("../../../", import.meta.url);
const contentTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

// These replace only the out-of-scope integration seams in the E2E server.
const nullGhost = `
export function createGhostSelection() {
  return {
    selectedGhost: null,
    selectChart() { return null; },
    getOverlayData() { return null; },
    captureBestRunContext() {
      throw new Error("Ghost context must not be used in MIDI E2E");
    },
  };
}
export function saveChallengeGhost() {
  return { ok: false, reason: "e2e-disabled" };
}
`;
const nullReplay = `
export function createReplaySelection() {
  return { selectedReplay: null, selectChart() { return null; } };
}
export function saveChallengeReplay() {
  return { ok: false, reason: "e2e-disabled" };
}
`;

export async function createE2ETestEnvironment() {
  const server = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    onListen() {},
  }, async (request) => {
    const pathname = new URL(request.url).pathname;
    const adapter = {
      "/src/features/ghost-integration.js": nullGhost,
      "/src/features/replay-integration.js": nullReplay,
    }[pathname];
    if (adapter) {
      return new Response(adapter, {
        headers: { "content-type": "text/javascript" },
      });
    }
    const file = new URL(
      `.${pathname === "/" ? "/index.html" : pathname}`,
      root,
    );
    if (!file.href.startsWith(root.href)) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const data = await Deno.readFile(file);
      const extension = file.pathname.slice(file.pathname.lastIndexOf("."));
      return new Response(data, {
        headers: {
          "content-type": contentTypes[extension] ?? "application/octet-stream",
        },
      });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      return new Response("Not found", { status: 404 });
    }
  });
  let browser;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const warnings = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
      if (message.type() === "warning") warnings.push(message.text());
    });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await page.addInitScript({
      content: `
        const createMidiSimulator = ${createMidiSimulator.toString()};
        globalThis.__midi = createMidiSimulator();
        globalThis.__midiAccessRequests = 0;
        Object.defineProperty(navigator, "requestMIDIAccess", {
          value: () => {
            globalThis.__midiAccessRequests += 1;
            return globalThis.__midi.requestMIDIAccess();
          },
        });
      `,
    });
    const url = `http://127.0.0.1:${server.addr.port}`;
    const response = await page.goto(url);
    if (!response?.ok()) throw new Error("E2E application server is not ready");
    await page.locator("#chart-list button").first().waitFor();
    return {
      page,
      errors,
      warnings,
      async close() {
        try {
          await browser.close();
        } finally {
          await server.shutdown();
        }
      },
    };
  } catch (error) {
    try {
      if (browser) await browser.close();
    } finally {
      await server.shutdown();
    }
    throw error;
  }
}

export async function sendMidi(page, data) {
  await page.evaluate((data) => {
    globalThis.__midi.send({ timestamp: performance.now(), data });
  }, data);
}

export async function connectAndMapMidi(page) {
  await page.locator("#first-visit-guide-skip").click();
  await page.locator("#midi-setup-tab").click();
  await page.locator("#midi-connect").click();
  for (
    const [index, data] of [
      [0, [0x90, 60, 127]],
      [1, [0x90, 61, 127]],
      [2, [0xb0, 7, 0]],
    ]
  ) {
    await page.locator("#midi-mapping-list > li").nth(index)
      .getByRole("button", { name: "Learn", exact: true }).click();
    await sendMidi(page, data);
  }
}

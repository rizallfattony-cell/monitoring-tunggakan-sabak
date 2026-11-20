const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const baseUrl = process.env.MONALISA_URL || "http://127.0.0.1:5173";
const outputDir = path.join(os.tmpdir(), "monalisa-professional-qa");
const viewports = [
  { name: "desktop-wide", width: 1920, height: 1080 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];
const tabs = [
  "overview",
  "upload",
  "laporan",
  "comparison",
  "saldo-rata",
  "pelunasan-harian",
  "lpb",
  "sync-status",
  "premium",
  "receipt-history",
  "invoice",
  "online",
  "kogol0-detail",
];

async function exposeAdminShell(page, theme) {
  await page.addStyleTag({ content: "#authGate{display:none!important}#appShell{display:block!important}" });
  await page.evaluate((selectedTheme) => {
    document.documentElement.dataset.theme = selectedTheme;
    const gate = document.querySelector("#authGate");
    const shell = document.querySelector("#appShell");
    if (gate) gate.hidden = true;
    if (shell) shell.hidden = false;
  }, theme);
}

async function inspectLayout(page) {
  return page.evaluate((tabNames) => {
    const results = [];
    for (const tabName of tabNames) {
      if (typeof window.switchTab === "function") window.switchTab(tabName);
      const panel = document.querySelector(`[data-tab-panel="${tabName}"]`);
      const workspace = document.querySelector(".workspace-body");
      results.push({
        tab: tabName,
        visible: Boolean(panel && !panel.hidden),
        documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        workspaceOverflow: Boolean(workspace && workspace.scrollWidth > workspace.clientWidth + 1),
      });
    }
    if (typeof window.switchTab === "function") window.switchTab("overview");
    return results;
  }, tabs);
}

async function inspectAppearance(page) {
  return page.evaluate(() => {
    const selectors = [
      ".content-workspace",
      ".overview-panel",
      ".kogol-dashboard",
      ".kogol-dashboard-head h1",
      ".lpb-overview",
      ".lpb-overview-head h2",
      ".lpb-overview-facts > div",
    ];
    return Object.fromEntries(selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return [selector, null];
      const style = getComputedStyle(element);
      return [selector, {
        color: style.color,
        background: style.backgroundColor,
        opacity: style.opacity,
        filter: style.filter,
      }];
    }));
  });
}

async function inspectInteractions(page, viewport, theme) {
  const result = {};
  if (viewport.name === "desktop" && theme === "light") {
    await page.keyboard.press("Control+K");
    result.commandOpened = await page.locator("#globalCommandDialog").evaluate((element) => element.open);
    result.commandFocused = await page.evaluate(() => document.activeElement?.id === "globalCommandInput");
    await page.keyboard.press("Escape");
    result.commandClosed = await page.locator("#globalCommandDialog").evaluate((element) => !element.open);
    await page.locator("#themeToggleButton").click();
    result.themeChanged = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      stored: localStorage.getItem("monalisa-theme"),
    }));
    await page.locator("#themeToggleButton").click();
  }
  if (viewport.name === "mobile" && theme === "light") {
    result.drawerInitiallyClosed = await page.locator(".workspace-layout").evaluate((element) => element.classList.contains("is-menu-collapsed"));
    await page.locator("#menuToggleButton").click();
    result.drawerOpened = await page.locator(".workspace-layout").evaluate((element) => !element.classList.contains("is-menu-collapsed"));
    await page.locator("#menuToggleButton").click();
    result.drawerClosed = await page.locator(".workspace-layout").evaluate((element) => element.classList.contains("is-menu-collapsed"));
  }
  return result;
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const report = [];
  const loginScreenshots = [];

  try {
    for (const theme of ["light", "dark"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.addInitScript((selectedTheme) => localStorage.setItem("monalisa-theme", selectedTheme), theme);
      await page.goto(`${baseUrl}/index.html?ui=professional`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
      const file = path.join(outputDir, `login-mobile-${theme}.png`);
      await page.screenshot({ path: file, fullPage: false });
      loginScreenshots.push({ theme, file, pageErrors });
      await page.close();
    }

    for (const viewport of viewports) {
      for (const theme of ["light", "dark"]) {
        const page = await browser.newPage({ viewport });
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));
        await page.goto(`${baseUrl}/index.html?ui=professional`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1800);
        await exposeAdminShell(page, theme);
        await page.waitForTimeout(100);

        const layout = await inspectLayout(page);
        await page.waitForTimeout(250);
        const file = path.join(outputDir, `${viewport.name}-${theme}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const appearance = viewport.name === "desktop" ? await inspectAppearance(page) : undefined;
        const interactions = await inspectInteractions(page, viewport, theme);
        report.push({ viewport, theme, file, pageErrors, layout, appearance, interactions });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  const failures = report.flatMap((item) => item.layout
    .filter((entry) => !entry.visible || entry.documentOverflow || entry.workspaceOverflow)
    .map((entry) => ({ viewport: item.viewport.name, theme: item.theme, ...entry })));

  const screenshots = report.map((item) => ({
    viewport: item.viewport.name,
    theme: item.theme,
    file: item.file,
    pageErrors: item.pageErrors,
    appearance: item.appearance,
    interactions: item.interactions,
  }));
  console.log(JSON.stringify({ outputDir, failures, loginScreenshots, screenshots }, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

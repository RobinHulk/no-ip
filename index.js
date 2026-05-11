require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

const LOGIN_URL = "https://www.noip.com/login";
const HOSTNAMES_URL_CANDIDATES = [
  "https://my.noip.com/dynamic-dns",
  "https://my.noip.com/dynamic-dns/hostnames",
  "https://my.noip.com/",
];
const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");
const VERIFICATION_TIMEOUT_MS = Number(process.env.VERIFICATION_TIMEOUT_MS || 180000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

function toBool(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }
  return ["1", "true", "yes", "si"].includes(String(value).trim().toLowerCase());
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractCode(text) {
  const match = String(text || "").match(/\b(\d{6})\b/);
  return match ? match[1] : null;
}

async function ensureArtifactsDir() {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
}

async function saveArtifacts(page, prefix) {
  await ensureArtifactsDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = path.join(ARTIFACTS_DIR, `${prefix}-${stamp}.png`);
  const htmlPath = path.join(ARTIFACTS_DIR, `${prefix}-${stamp}.html`);

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch {}

  try {
    await fs.writeFile(htmlPath, await page.content(), "utf8");
  } catch {}

  return { screenshotPath, htmlPath };
}

async function saveFailureArtifacts(page, error) {
  const files = await saveArtifacts(page, "failure");
  console.error(`Se guardaron evidencias del error en ${files.screenshotPath} y ${files.htmlPath}`);
  console.error(error);
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    try {
      await locator.waitFor({ state: "visible", timeout: 3000 });
      await locator.click();
      return true;
    } catch {}
  }

  return false;
}

async function fillFirstVisible(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    try {
      await locator.waitFor({ state: "visible", timeout: 3000 });
      await locator.fill(value);
      return true;
    } catch {}
  }

  return false;
}

function getTargetHostnames() {
  const raw = (process.env.NOIP_HOSTNAME || process.env.NOIP_HOSTNAMES || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function fetchRecentNoIpCode({ since }) {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: requireEnv("GMAIL_EMAIL"),
      pass: requireEnv("GMAIL_APP_PASSWORD"),
    },
  });

  const senderFilter = (process.env.GMAIL_SENDER_FILTER || "No-IP Notices").toLowerCase();

  await client.connect();

  try {
    await client.mailboxOpen("INBOX");
    const ids = await client.search({ since });

    for (const id of [...ids].slice(-20).reverse()) {
      const message = await client.fetchOne(id, {
        envelope: true,
        source: true,
        internalDate: true,
      });

      if (!message) {
        continue;
      }

      if (message.internalDate && message.internalDate < since) {
        continue;
      }

      const fromText = (message.envelope?.from || [])
        .map((entry) => `${entry.name || ""} ${entry.address || ""}`.trim())
        .join(" ")
        .toLowerCase();

      const subjectText = String(message.envelope?.subject || "").toLowerCase();

      if (!fromText.includes(senderFilter) && !subjectText.includes("no-ip")) {
        continue;
      }

      const parsed = await simpleParser(message.source);
      const content = [
        parsed.subject || "",
        parsed.text || "",
        parsed.html ? String(parsed.html).replace(/<[^>]+>/g, " ") : "",
      ].join("\n");

      const code = extractCode(content);
      if (code) {
        return code;
      }
    }

    return null;
  } finally {
    await client.logout();
  }
}

async function waitForNoIpCode(triggeredAt) {
  const deadline = Date.now() + VERIFICATION_TIMEOUT_MS;
  const since = new Date(triggeredAt.getTime() - 15 * 1000);

  while (Date.now() < deadline) {
    const code = await fetchRecentNoIpCode({ since });
    if (code) {
      return code;
    }

    await delay(POLL_INTERVAL_MS);
  }

  throw new Error("No llego ningun codigo de verificacion de No-IP dentro del tiempo esperado.");
}

async function loginToNoIp(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

  const usernameFilled = await fillFirstVisible(
    page,
    [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[autocomplete="username"]',
    ],
    requireEnv("NOIP_USERNAME"),
  );

  const passwordFilled = await fillFirstVisible(
    page,
    [
      'input[name="password"]',
      'input[type="password"]',
      'input[autocomplete="current-password"]',
    ],
    requireEnv("NOIP_PASSWORD"),
  );

  if (!usernameFilled || !passwordFilled) {
    throw new Error("No se encontraron los campos de login de No-IP.");
  }

  const loginTriggeredAt = new Date();
  const clicked = await clickFirstVisible(page, [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Log in")',
    'button:has-text("Sign In")',
  ]);

  if (!clicked) {
    throw new Error("No se encontro el boton de login de No-IP.");
  }

  return loginTriggeredAt;
}

async function submitVerificationCode(page, code) {
  const sixBoxes = page.locator('input[maxlength="1"]');
  if ((await sixBoxes.count()) >= 6) {
    for (let i = 0; i < 6; i += 1) {
      await sixBoxes.nth(i).fill(code[i]);
    }
  } else {
    const codeFilled = await fillFirstVisible(page, [
      'input[name="code"]',
      'input[name="verification_code"]',
      'input[autocomplete="one-time-code"]',
      'input[inputmode="numeric"]',
    ], code);

    if (!codeFilled) {
      throw new Error("No se encontro el campo para ingresar el codigo de verificacion.");
    }
  }

  const clicked = await clickFirstVisible(page, [
    'button[type="submit"]',
    'button:has-text("Verify")',
    'button:has-text("Continue")',
    'button:has-text("Submit")',
  ]);

  if (!clicked) {
    throw new Error("No se encontro el boton para confirmar el codigo de verificacion.");
  }
}

async function waitForPostLogin(page) {
  const possibleLoggedInIndicators = [
    page.getByRole("link", { name: /dynamic dns/i }).first(),
    page.getByRole("link", { name: /no-ip hostnames/i }).first(),
    page.locator('a[href*="dynamic-dns"]').first(),
  ];

  const verificationIndicators = [
    page.locator('input[autocomplete="one-time-code"]').first(),
    page.locator('input[name="code"]').first(),
    page.locator('input[maxlength="1"]').nth(0),
  ];

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const locator of possibleLoggedInIndicators) {
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        return { needsVerification: false };
      }
    }

    for (const locator of verificationIndicators) {
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        return { needsVerification: true };
      }
    }

    await delay(1000);
  }

  return { needsVerification: true };
}

async function openHostnamesPage(page) {
  for (const url of HOSTNAMES_URL_CANDIDATES) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      const hasHostPageSignals = await page.locator("body").innerText();
      if (/hostname|dynamic dns|confirm/i.test(hasHostPageSignals)) {
        return;
      }
    } catch {}
  }

  const clickedDynamicDns = await clickFirstVisible(page, [
    'a:has-text("Dynamic DNS")',
    'button:has-text("Dynamic DNS")',
  ]);

  if (!clickedDynamicDns) {
    throw new Error("No se pudo abrir la seccion Dynamic DNS en No-IP.");
  }

  await clickFirstVisible(page, [
    'a:has-text("No-IP Hostnames")',
    'button:has-text("No-IP Hostnames")',
  ]);
}

async function locateConfirmAction(page, hostname) {
  const buttonSelectors = [
    'button:has-text("Confirm")',
    'a:has-text("Confirm")',
    'button:has-text("Renew")',
    'a:has-text("Renew")',
  ];

  if (hostname) {
    const row = page.locator(`tr:has-text("${hostname}")`).first();
    if ((await row.count()) > 0) {
      for (const selector of buttonSelectors) {
        const locator = row.locator(selector).first();
        if ((await locator.count()) > 0) {
          return locator;
        }
      }
    }

    const card = page.locator(`text=${hostname}`).first();
    if ((await card.count()) > 0) {
      for (const selector of buttonSelectors) {
        const locator = card.locator("xpath=ancestor-or-self::*[1]").locator(selector).first();
        if ((await locator.count()) > 0) {
          return locator;
        }
      }
    }
  }

  for (const selector of buttonSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  return null;
}

async function readVisibleConfirmationText(page) {
  const bodyText = await page.locator("body").innerText();
  const lines = bodyText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.find((line) => /confirmed|renewed|success|active/i.test(line)) || null;
}

async function confirmHostname(page, hostname) {
  const action = await locateConfirmAction(page, hostname);
  if (!action) {
    return {
      status: "not-needed",
      message: hostname
        ? `No se encontro boton de confirmacion para ${hostname}. Es posible que todavia no necesite renovacion.`
        : "No se encontro ningun boton de confirmacion. Es posible que no haya hostnames pendientes de renovar.",
    };
  }

  await action.waitFor({ state: "visible", timeout: 15000 });
  await action.click();

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const message = await readVisibleConfirmationText(page);
    if (message) {
      return { status: "confirmed", message };
    }
    await delay(1000);
  }

  throw new Error("No se detecto un mensaje de confirmacion luego de pulsar el boton Confirm.");
}

async function main() {
  requireEnv("NOIP_USERNAME");
  requireEnv("NOIP_PASSWORD");
  requireEnv("GMAIL_EMAIL");
  requireEnv("GMAIL_APP_PASSWORD");

  const browser = await chromium.launch({
    headless: process.argv.includes("--headless") || toBool(process.env.HEADLESS, false),
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const hostnames = getTargetHostnames();

  try {
    console.log("Abriendo No-IP e iniciando sesion...");
    const loginTriggeredAt = await loginToNoIp(page);

    console.log("Esperando la respuesta del login...");
    const loginState = await waitForPostLogin(page);

    if (loginState.needsVerification) {
      console.log("Buscando el codigo en Gmail...");
      const code = await waitForNoIpCode(loginTriggeredAt);
      console.log(`Codigo encontrado: ${code}`);

      console.log("Ingresando codigo de verificacion...");
      await submitVerificationCode(page, code);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
    } else {
      console.log("No-IP no pidio verificacion por email en esta sesion.");
    }

    console.log("Navegando a la pagina de hostnames...");
    await openHostnamesPage(page);

    const targets = hostnames.length > 0 ? hostnames : [null];
    const results = [];

    for (const hostname of targets) {
      console.log(hostname ? `Procesando hostname ${hostname}...` : "Procesando el primer hostname pendiente...");
      const result = await confirmHostname(page, hostname);
      results.push({ hostname: hostname || "(primero disponible)", ...result });
    }

    const successFiles = await saveArtifacts(page, "success");
    console.log("Resultado final:");
    for (const result of results) {
      console.log(`- ${result.hostname}: ${result.status} - ${result.message}`);
    }
    console.log(`Capturas guardadas en ${successFiles.screenshotPath} y ${successFiles.htmlPath}`);
  } catch (error) {
    await saveFailureArtifacts(page, error);
    process.exitCode = 1;
  } finally {
    await context.close();
    await browser.close();
  }
}

main();

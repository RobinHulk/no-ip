require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");

const LOGIN_URL = "https://www.noip.com/login";
const GMAIL_URL = "https://mail.google.com/mail/u/0/#inbox";
const HOSTNAMES_URL_CANDIDATES = [
  "https://my.noip.com/",
  "https://my.noip.com/dynamic-dns",
  "https://my.noip.com/dynamic-dns/hostnames",
  "https://www.noip.com/members/dns/",
];
const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");
const USER_DATA_DIR = path.join(process.cwd(), ".playwright-profile");
const VERIFICATION_TIMEOUT_MS = Number(process.env.VERIFICATION_TIMEOUT_MS || 180000);
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 10000);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  }
  return value;
}

function normalizeSecret(value) {
  return String(value || "").trim();
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

function buildGmailSearchQuery() {
  const senderFilter = process.env.GMAIL_SENDER_FILTER || "No-IP";
  return `newer_than:2d "${senderFilter}"`;
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

async function ensureGmailInboxReady(gmailPage) {
  await gmailPage.goto(GMAIL_URL, { waitUntil: "domcontentloaded" });

  const deadline = Date.now() + VERIFICATION_TIMEOUT_MS;
  let promptedManualLogin = false;

  while (Date.now() < deadline) {
    const url = gmailPage.url();
    const bodyText = await gmailPage.locator("body").innerText().catch(() => "");

    const inboxReady =
      url.startsWith("https://mail.google.com") &&
      ((await gmailPage.locator('input[placeholder*="Search mail"]').count()) > 0 ||
        (await gmailPage.locator('input[aria-label*="Search mail"]').count()) > 0 ||
        /compose|inbox|primary/i.test(bodyText));

    if (inboxReady) {
      return;
    }

    if (
      !promptedManualLogin &&
      (/accounts\.google\.com/.test(url) ||
        /choose an account|sign in|iniciar sesion|elige una cuenta/i.test(bodyText))
    ) {
      console.log("Gmail requiere sesion en el navegador. Completala manualmente en la ventana abierta y el script seguira solo.");
      promptedManualLogin = true;
    }

    await gmailPage.waitForTimeout(1000);
  }

  throw new Error("No se pudo dejar Gmail listo en el inbox dentro del tiempo esperado.");
}

async function searchLatestNoIpMail(gmailPage) {
  const query = buildGmailSearchQuery();
  const searchInput = gmailPage
    .locator('input[placeholder*="Search mail"], input[aria-label*="Search mail"]')
    .first();

  await searchInput.waitFor({ state: "visible", timeout: 15000 });
  await searchInput.fill(query);
  await searchInput.press("Enter");
  await gmailPage.waitForLoadState("domcontentloaded");
  await gmailPage.waitForTimeout(3000);
}

async function openFirstMailCandidate(gmailPage) {
  const rowSelectors = [
    'tr[role="row"]',
    'div[role="main"] table tr',
    'div[role="main"] [data-legacy-thread-id]',
  ];

  for (const selector of rowSelectors) {
    const row = gmailPage.locator(selector).first();
    if ((await row.count()) === 0) {
      continue;
    }

    try {
      await row.waitFor({ state: "visible", timeout: 5000 });
      await row.click();
      await gmailPage.waitForTimeout(2000);
      return true;
    } catch {}
  }

  return false;
}

async function extractCodeFromOpenMail(gmailPage) {
  const bodyText = await gmailPage.locator("body").innerText().catch(() => "");
  return extractCode(bodyText);
}

async function waitForNoIpCode(gmailPage, triggeredAt) {
  const deadline = Date.now() + VERIFICATION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await ensureGmailInboxReady(gmailPage);
    await searchLatestNoIpMail(gmailPage);

    const noResultsText = await gmailPage.locator("body").innerText().catch(() => "");
    if (/no messages matched your search|did not match any messages/i.test(noResultsText)) {
      await delay(POLL_INTERVAL_MS);
      await gmailPage.goto(GMAIL_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
      continue;
    }

    const opened = await openFirstMailCandidate(gmailPage);
    if (!opened) {
      await delay(POLL_INTERVAL_MS);
      await gmailPage.goto(GMAIL_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
      continue;
    }

    const code = await extractCodeFromOpenMail(gmailPage);
    if (code) {
      return code;
    }

    await clickFirstVisible(gmailPage, [
      'div[role="button"][aria-label*="Back to Search Results"]',
      'div[role="button"][aria-label*="Back to Inbox"]',
      'div[role="button"][aria-label*="Atrás"]',
    ]);
    await gmailPage.waitForTimeout(1000);
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
    '#clogs-captcha-button',
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
  const verificationIndicators = [
    page.locator('input[autocomplete="one-time-code"]').first(),
    page.locator('input[name="code"]').first(),
    page.locator('input[maxlength="1"]').nth(0),
  ];

  const loginErrorPatterns = [
    /incorrect/i,
    /invalid/i,
    /required/i,
    /captcha/i,
    /try again/i,
    /not recognized/i,
    /unable to/i,
    /failed/i,
  ];

  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.startsWith("https://my.noip.com")) {
      return { needsVerification: false };
    }

    if (url.includes("/2fa/verify")) {
      return { needsVerification: true };
    }

    for (const locator of verificationIndicators) {
      if ((await locator.count()) > 0 && (await locator.isVisible().catch(() => false))) {
        return { needsVerification: true };
      }
    }

    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText().catch(() => "");

    if (/verify your email/i.test(bodyText) && /6-digit code/i.test(bodyText)) {
      return { needsVerification: true };
    }

    if (/sign in/i.test(title) && /username or email/i.test(bodyText) && /password/i.test(bodyText)) {
      const errorLine = bodyText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => loginErrorPatterns.some((pattern) => pattern.test(line)));

      if (errorLine) {
        return { needsVerification: false, loginFailed: true, message: errorLine };
      }
    }

    if (url.includes("/login") && !/sign in/i.test(title)) {
      await delay(1000);
      continue;
    }

    if (!/sign in/i.test(title) && !url.includes("/login")) {
      return { needsVerification: false };
    }

    await delay(1000);
  }

  const finalUrl = page.url();
  const finalTitle = await page.title().catch(() => "");
  if (finalUrl.includes("/login") || /sign in/i.test(finalTitle)) {
    return {
      needsVerification: false,
      loginFailed: true,
      message: "No-IP permanecio en la pagina de login despues del submit.",
    };
  }

  return { needsVerification: false };
}

async function openHostnamesPage(page) {
  const isAuthenticatedPage = async () => {
    const url = page.url();
    const title = await page.title().catch(() => "");
    return !url.includes("/login") && !url.includes("/2fa/verify") && !/sign in|log in/i.test(title);
  };

  const isHostnamesPage = async () => {
    const url = page.url();
    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText().catch(() => "");

    if (/404|page not found/i.test(title) || /404|page not found/i.test(bodyText)) {
      return false;
    }

    return (
      !/sign in|log in/i.test(title) &&
      (/hostname/i.test(bodyText) || /confirm/i.test(bodyText) || /renew/i.test(bodyText) || /dynamic dns/i.test(url))
    );
  };

  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  if (await isHostnamesPage()) {
    return;
  }

  if (await isAuthenticatedPage()) {
    const clickedFromAuthenticatedUi = await clickFirstVisible(page, [
      'header a[href*="dynamic-dns"]',
      'nav a[href*="dynamic-dns"]',
      'aside a[href*="dynamic-dns"]',
      'header a:has-text("Dynamic DNS")',
      'nav a:has-text("Dynamic DNS")',
      'aside a:has-text("Dynamic DNS")',
      'a:has-text("My Services")',
      'a:has-text("Personal Hostnames")',
      'a:has-text("No-IP Hostnames")',
    ]);

    if (clickedFromAuthenticatedUi) {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      const clickedSecondLevel = await clickFirstVisible(page, [
        'a:has-text("No-IP Hostnames")',
        'a:has-text("Personal Hostnames")',
        'a:has-text("Hostnames")',
        'button:has-text("No-IP Hostnames")',
      ]);

      if (clickedSecondLevel) {
        await page.waitForLoadState("domcontentloaded");
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      }

      if (await isHostnamesPage()) {
        return;
      }
    }
  }

  for (const url of HOSTNAMES_URL_CANDIDATES) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

      if (await isHostnamesPage()) {
        return;
      }
    } catch {}
  }

  const clickedDynamicDns = await clickFirstVisible(page, [
    'header a:has-text("Dynamic DNS")',
    'nav a:has-text("Dynamic DNS")',
    'aside a:has-text("Dynamic DNS")',
    'a:has-text("Dynamic DNS")',
    'button:has-text("Dynamic DNS")',
  ]);

  if (!clickedDynamicDns) {
    throw new Error("No se pudo abrir la seccion Dynamic DNS en No-IP.");
  }

  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const clickedHostnames = await clickFirstVisible(page, [
    'a:has-text("No-IP Hostnames")',
    'a:has-text("Personal Hostnames")',
    'a:has-text("Hostnames")',
    'button:has-text("No-IP Hostnames")',
  ]);

  if (clickedHostnames) {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  }

  if (!(await isHostnamesPage())) {
    throw new Error("No se pudo llegar a la pagina de hostnames luego del login.");
  }
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

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: process.argv.includes("--headless") || toBool(process.env.HEADLESS, false),
  });
  const page = await context.newPage();
  const hostnames = getTargetHostnames();
  const gmailPage = await context.newPage();

  try {
    console.log("Abriendo No-IP e iniciando sesion...");
    const loginTriggeredAt = await loginToNoIp(page);

    console.log("Esperando la respuesta del login...");
    const loginState = await waitForPostLogin(page);

    if (loginState.loginFailed) {
      throw new Error(loginState.message || "No-IP no completo el login.");
    }

    if (loginState.needsVerification) {
      console.log("Buscando el codigo en Gmail abierto en el navegador...");
      const code = await waitForNoIpCode(gmailPage, loginTriggeredAt);
      console.log(`Codigo encontrado: ${code}`);

      console.log("Ingresando codigo de verificacion...");
      await page.bringToFront();
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
  }
}

main();

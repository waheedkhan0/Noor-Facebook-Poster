import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import cron from 'node-cron';
import fs from 'fs';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { loadConfig } from './admin/config.js';
import { addHistoryEntry } from './admin/history.js';
import { addLog } from './admin/logger.js';
import { startAdminServer, botState } from './admin/server.js';

dotenv.config();
puppeteer.use(StealthPlugin());

const extensionPath = path.resolve('./fewfeed');

let browser;
let browserProcess = null;
let page;
let runtimeCookies = null;
let cronTask = null;
let isCleaningUp = false;

const launchBrowser = async () => {
  const config = loadConfig();
  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: config.headless,
        args: [
          `--disable-extensions-except=${extensionPath}`,
          `--load-extension=${extensionPath}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-zygote',
          ...(config.headless ? ['--headless=new'] : [])
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
      });
      browserProcess = browser.process();
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      page.setDefaultNavigationTimeout(60000);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.resourceType() === 'image') {
          request.abort();
        } else {
          request.continue();
        }
      });
    }
    return page;
  } catch (error) {
    addLog('error', `Error launching browser: ${error.message}`);
    throw error;
  }
};

const loadCookies = async (page) => {
  const config = loadConfig();
  try {
    let cookies;

    if (config.nodeEnv === 'production') {
      if (runtimeCookies) {
        addLog('info', 'Using cookies from runtime memory');
        cookies = runtimeCookies;
      } else {
        addLog('info', 'Loading initial cookies from environment variable');
        try {
          cookies = JSON.parse(config.facebookCookies);
          if (!Array.isArray(cookies)) {
            throw new Error('Invalid cookie format');
          }
          runtimeCookies = cookies;
        } catch (parseError) {
          addLog('error', `Error parsing cookies: ${parseError.message}`);
          return false;
        }
      }
    } else {
      addLog('info', 'Loading cookies from file in development mode');
      const cookiesPath = path.resolve('cookies.json');
      if (!fs.existsSync(cookiesPath)) {
        addLog('info', 'No cookies file found');
        return false;
      }
      try {
        cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      } catch (fileError) {
        addLog('error', `Error reading cookies from file: ${fileError.message}`);
        return false;
      }
    }

    if (Array.isArray(cookies) && cookies.length > 0) {
      cookies = cookies.map(cookie => {
        if (cookie.sameSite === null || cookie.sameSite === undefined) {
          cookie.sameSite = "none";
        }
        return cookie;
      });

      await page.setCookie(...cookies);
      addLog('info', 'Cookies loaded successfully');
      return true;
    } else {
      addLog('info', 'No valid cookies found');
      return false;
    }
  } catch (error) {
    addLog('error', `Error in loadCookies: ${error.message}`);
    return false;
  }
};

const saveCookies = async (page) => {
  const config = loadConfig();
  try {
    const cookies = await page.cookies();
    const validatedCookies = cookies.map(cookie => {
      if (cookie.sameSite === null || cookie.sameSite === undefined) {
        cookie.sameSite = "none";
      }
      return cookie;
    });

    if (config.nodeEnv === 'production') {
      runtimeCookies = validatedCookies;
      addLog('info', 'Cookies updated in runtime memory');
    } else {
      const cookiesPath = path.resolve('cookies.json');
      fs.writeFileSync(cookiesPath, JSON.stringify(validatedCookies, null, 2));
      addLog('info', 'Cookies saved to file');
    }

    return true;
  } catch (error) {
    addLog('error', `Error saving cookies: ${error.message}`);
    return false;
  }
};

const getNextNumber = (max) => {
  return Math.floor(Math.random() * max) + 1;
};

const getRandomHadithNumber = (max) => {
  return Math.floor(Math.random() * max) + 1;
};

const getSequentialHadith = async () => {
  const config = loadConfig();
  const hadithNumber = getRandomHadithNumber(config.maxHadithNumber);
  const url = `https://api.hadith.gading.dev/books/bukhari/${hadithNumber}`;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.data && data.data.contents) {
        return { text: data.data.contents.arab, number: hadithNumber };
      }

      addLog('error', `Invalid hadith data structure for #${hadithNumber}`);
      return { text: 'اَللَّهُمَّ صَلِّ وَسَلِّمْ وَباَرِكْ عَلىَ سَيِّدِناَ وَمَوْلاَناَ مُحَمَّدٍ', number: hadithNumber };
    } catch (error) {
      addLog('error', `Attempt ${attempt} failed for hadith #${hadithNumber}: ${error.message}`);
      if (attempt === config.maxRetries) {
        return { text: 'اَللَّهُمَّ صَلِّ وَسَلِّمْ وَباَرِكْ عَلىَ سَيِّدِناَ وَمَوْلاَناَ مُحَمَّدٍ', number: hadithNumber };
      }
      await new Promise(resolve => setTimeout(resolve, config.retryDelayMs));
    }
  }
};

const getQuranImage = async () => {
  const config = loadConfig();
  const pageNumber = getNextNumber(config.maxQuranPage);
  const quranImagesDir = path.resolve('quran-images');
  const imagePath = path.join(quranImagesDir, `${pageNumber}.jpg`);

  try {
    await fs.promises.access(imagePath);
    return { success: true, path: imagePath, pageNumber };
  } catch (error) {
    addLog('error', `Cannot access Quran image page ${pageNumber}: ${error.message}`);
    return { success: false, error: `Could not find Quran page ${pageNumber}` };
  }
};

export const automatePosting = async () => {
  const config = loadConfig();
  botState.status = 'posting';
  addLog('info', 'Starting automated posting...');

  try {
    const page = await launchBrowser();
    const cookiesLoaded = await loadCookies(page);
    const quranImage = await getQuranImage();

    await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const emailInput = await page.$('input[name="email"]');
    if (emailInput !== null) {
      addLog('info', 'Logging in as cookies are not valid or expired');
      await emailInput.type(config.fbEmail, { delay: 0 });
      await page.type('input[name="pass"]', config.fbPassword, { delay: 0 });
      await Promise.all([
        page.evaluate(() => document.querySelector('form')?.requestSubmit()),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      ]);
      await saveCookies(page);
    } else {
      addLog('info', 'Using existing session');
    }

    await saveCookies(page);
    await delay(1000);

    const targetUrl = 'https://v2.fewfeed.com/tool/auto-post-fb-group';
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    addLog('info', `Navigated to ${targetUrl}`);

    const hadithResult = await getSequentialHadith();
    await page.waitForSelector('textarea[placeholder="Write something..."]', { timeout: 30000 });

    if (!quranImage.success) {
      addLog('error', 'Failed to access Quran image, stopping process');
      throw new Error('Quran image access failed');
    }

    const postText = `${hadithResult.text}\n\nQuran Page ${quranImage.pageNumber}`;
    await page.type('textarea[placeholder="Write something..."]', postText, { delay: 0 });
    addLog('info', 'Text entered into the textarea');

    const svgSelector = 'svg.w-6.h-6.text-green-400.cursor-pointer';
    await page.waitForSelector(svgSelector, { timeout: 30000 });
    await page.click(svgSelector);
    addLog('info', 'Clicked upload button');

    const uploadInputSelector = 'input[type="file"]';
    await page.waitForSelector(uploadInputSelector, { timeout: 30000 });
    const inputUploadHandle = await page.$(uploadInputSelector);

    addLog('info', `Uploading Quran page ${quranImage.pageNumber}`);

    try {
      await delay(2000);

      await page.evaluate(() => {
        const delayLabels = Array.from(document.querySelectorAll('label, div'))
          .filter(el => el.textContent.includes('Delay'));

        if (delayLabels.length > 0) {
          const delayLabel = delayLabels[0];
          const delayInput = delayLabel.nextElementSibling?.querySelector('input[type="number"]') ||
                             delayLabel.parentElement?.querySelector('input[type="number"]');

          if (delayInput) {
            delayInput.value = "10";
            delayInput.dispatchEvent(new Event('input', { bubbles: true }));
            delayInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }

        const allInputs = document.querySelectorAll('input[type="number"]');
        if (allInputs.length >= 2) {
          const delayInput = allInputs[1];
          delayInput.value = "10";
          delayInput.dispatchEvent(new Event('input', { bubbles: true }));
          delayInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });

      const inputElements = await page.$$('input[type="number"]');
      if (inputElements.length >= 2) {
        await inputElements[1].click({ clickCount: 3 });
        await delay(500);
        await page.keyboard.type('30');
      }
    } catch (error) {
      addLog('error', `Error setting delay value: ${error.message}`);
    }

    await inputUploadHandle.uploadFile(quranImage.path);
    addLog('info', 'Quran page image uploaded successfully');

    await delay(5000);

    const checkboxInTableHeaderSelector = 'th.px-5.py-3.bg-white.text-left.font-semibold.text-gray-100.uppercase.tracking-wider.flex.space-x-1.items-center.h-full input[type="checkbox"].w-4.h-4.text-blue-600';
    await page.waitForSelector(checkboxInTableHeaderSelector, { timeout: 30000 });
    await page.click(checkboxInTableHeaderSelector);

    const postButtonSelector = 'button.w-full.py-2.bg-blue-500.text-white.hover\\:bg-blue-600.transition-all.delay-75.font-bold.rounded-md.shadow-sm';
    await page.waitForSelector(postButtonSelector, { timeout: 30000 });
    await page.click(postButtonSelector);
    addLog('info', 'Post button clicked');

    botState.lastPostTime = new Date().toISOString();
    botState.lastPageNumber = quranImage.pageNumber;
    botState.lastHadithNumber = hadithResult.number;

    addHistoryEntry({
      timestamp: new Date().toISOString(),
      quranPage: quranImage.pageNumber,
      hadithNumber: hadithResult.number,
      hadithText: hadithResult.text,
      status: 'success',
    });

    botState.status = 'waiting';
    const delayMs = config.postDelayMinutes * 60 * 1000;
    addLog('info', `Waiting ${config.postDelayMinutes} minutes for posts to complete...`);
    await delay(delayMs);
    addLog('info', 'Wait completed');

    botState.status = 'idle';
  } catch (error) {
    addLog('error', `Error in automation: ${error.message}`);
    botState.status = 'error';
    addHistoryEntry({
      timestamp: new Date().toISOString(),
      quranPage: null,
      hadithNumber: null,
      hadithText: null,
      status: `error: ${error.message}`,
    });
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      browser = null;
      browserProcess = null;
      page = null;
      addLog('info', 'Browser closed');
    }
    if (botState.status !== 'error') {
      botState.status = 'idle';
    }
  }
};

export const testLogin = async () => {
  addLog('info', 'Testing Facebook login...');
  try {
    if (!browser) {
      await launchBrowser();
    }

    const cookiesLoaded = await loadCookies(page);
    if (!cookiesLoaded) {
      addLog('info', 'No valid cookies found, attempting fresh login...');
    }

    await page.goto('https://www.facebook.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    addLog('info', `Current URL after navigation: ${page.url()}`);

    const needsLogin = await page.evaluate(() => {
      return !document.cookie.includes('c_user');
    });

    if (needsLogin) {
      addLog('info', 'Not logged in, attempting login...');
      const config = loadConfig();

      try {
        await page.waitForSelector('input[name="email"]', { timeout: 20000 });
      } catch {
        addLog('error', `Login form not found (input[name="email"]). Current URL: ${page.url()}`);

        const diagnostics = await page.evaluate(() => ({
          title: document.title,
          inputs: Array.from(document.querySelectorAll('input')).map(i => ({ id: i.id, name: i.name, type: i.type, placeholder: i.placeholder })),
          buttons: Array.from(document.querySelectorAll('button')).map(b => ({ id: b.id, name: b.name, text: b.textContent?.trim()?.substring(0, 30) })),
          forms: document.forms.length,
          bodyText: document.body?.innerText?.substring(0, 500),
          html: document.documentElement?.innerHTML?.substring(0, 3000)
        }));

        addLog('error', `Page title: ${diagnostics.title}`);
        addLog('error', `Inputs found: ${JSON.stringify(diagnostics.inputs)}`);
        addLog('error', `Buttons found: ${JSON.stringify(diagnostics.buttons)}`);
        addLog('error', `Forms: ${diagnostics.forms}`);
        addLog('error', `Body text: ${diagnostics.bodyText}`);

        await page.screenshot({ path: 'login-debug.png', fullPage: true }).catch(() => {});
        botState.loginStatus = 'failed';
        return false;
      }

      await page.type('input[name="email"]', config.fbEmail);
      await page.type('input[name="pass"]', config.fbPassword);
      await Promise.all([
        page.evaluate(() => document.querySelector('form')?.requestSubmit()),
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      ]);

      const loginSuccessful = await page.evaluate(() => {
        return document.cookie.includes('c_user');
      });

      if (loginSuccessful) {
        addLog('info', 'Login successful!');
        await saveCookies(page);
        botState.loginStatus = 'success';
        return true;
      } else {
        addLog('error', 'Login failed. Check credentials.');
        botState.loginStatus = 'failed';
        return false;
      }
    } else {
      addLog('info', 'Already logged in!');
      botState.loginStatus = 'success';
      return true;
    }
  } catch (error) {
    addLog('error', `Error during login test: ${error.message}`);
    botState.loginStatus = 'failed';
    return false;
  } finally {
    if (browser) {
      await browser.close();
      browser = null;
      browserProcess = null;
      page = null;
      addLog('info', 'Browser closed after login test');
    }
  }
};

export const restartCron = () => {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  setupCron();
};

const setupCron = () => {
  const config = loadConfig();
  if (!config.botEnabled) {
    addLog('info', 'Bot is disabled in config. Skipping cron setup.');
    return;
  }

  if (cronTask) {
    cronTask.stop();
  }

  cronTask = cron.schedule(config.cronSchedule, () => {
    addLog('info', `Starting automation task at ${new Date().toLocaleString()}...`);
    automatePosting().catch(error => {
      addLog('error', `Failed to complete automation task: ${error.message}`);
      if (browser) {
        browser.close().catch(() => {});
        browser = null;
        browserProcess = null;
        page = null;
      }
    });
  });

  addLog('info', `Cron scheduled: ${config.cronSchedule}`);
  updateNextPostTime();
};

const updateNextPostTime = () => {
  const config = loadConfig();
  try {
    const parts = config.cronSchedule.split(' ');
    if (parts.length >= 5) {
      const minute = parseInt(parts[0]);
      const hour = parts[1].split(',').map(h => parseInt(h));
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const upcoming = hour.map(h => {
        const d = new Date(today);
        d.setHours(h, minute, 0, 0);
        if (d <= now) d.setDate(d.getDate() + 1);
        return d;
      });
      upcoming.sort((a, b) => a - b);
      botState.nextPostTime = upcoming[0]?.toISOString() || null;
    }
  } catch (err) {
    addLog('error', `Failed to calculate next post time: ${err.message}`);
  }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const killBrowserProcess = () => {
  if (browserProcess && typeof browserProcess.kill === 'function') {
    try {
      browserProcess.kill('SIGKILL');
      addLog('info', 'Browser process forcefully killed');
    } catch (error) {
      addLog('error', `Error killing browser process: ${error.message}`);
    }
    browserProcess = null;
  }
};

const cleanup = async (exitCode = 0) => {
  if (isCleaningUp) return;
  isCleaningUp = true;

  if (browser) {
    try {
      await Promise.race([
        browser.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 10000))
      ]);
      addLog('info', 'Browser closed during cleanup');
    } catch (error) {
      addLog('error', `Error closing browser during cleanup: ${error.message}`);
      killBrowserProcess();
    }
    browser = null;
    browserProcess = null;
    page = null;
  } else if (browserProcess) {
    killBrowserProcess();
  }

  process.exit(exitCode);
};

process.on('SIGTERM', () => cleanup());
process.on('SIGINT', () => cleanup());
process.on('uncaughtException', (error) => {
  addLog('error', `Uncaught exception: ${error.message}`);
  cleanup(1);
});
process.on('unhandledRejection', (reason) => {
  addLog('error', `Unhandled rejection: ${reason}`);
  cleanup(1);
});

startAdminServer();

const config = loadConfig();
addLog('info', `Application started. Cron: ${config.cronSchedule}, Bot enabled: ${config.botEnabled}`);

testLogin().then(loginSuccessful => {
  if (loginSuccessful) {
    addLog('info', 'Login test passed. Setting up scheduled tasks...');
    setupCron();
  } else {
    addLog('error', 'Login test failed. Bot will not run until login is fixed. Use admin panel to configure credentials or test login.');
  }
}).catch(error => {
  addLog('error', `Fatal error during login test: ${error.message}`);
});

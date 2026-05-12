import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CONFIG_PATH = path.resolve('admin/config.json');

const DEFAULTS = {
  cronSchedule: process.env.CRON_SCHEDULE || '0 14,18 * * *',
  postDelayMinutes: parseInt(process.env.POST_DELAY_MINUTES || '180'),
  headless: process.env.NODE_ENV === 'production' || process.env.HEADLESS === 'true',
  maxRetries: 3,
  retryDelayMs: 5000,
  maxHadithNumber: 7008,
  maxQuranPage: 604,
  adminPort: parseInt(process.env.ADMIN_PORT || '3000'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPasswordHash: '',
  fbEmail: process.env.FB_EMAIL || '',
  fbPassword: process.env.FB_PASSWORD || '',
  facebookCookies: process.env.FACEBOOK_COOKIES || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  botEnabled: true,
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
};

const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

export const verifyPassword = (password, hash) => {
  return hashPassword(password) === hash;
};

export const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const merged = { ...DEFAULTS, ...data };
      if (!merged.adminPasswordHash && merged.adminPassword) {
        merged.adminPasswordHash = hashPassword(merged.adminPassword);
      }
      return merged;
    }
  } catch (err) {
    console.error('Error loading config:', err.message);
  }
  const config = { ...DEFAULTS };
  config.adminPasswordHash = hashPassword(config.adminPassword);
  saveConfig(config);
  return config;
};

export const saveConfig = (config) => {
  try {
    const toSave = { ...config };
    if (toSave.adminPassword) {
      toSave.adminPasswordHash = hashPassword(toSave.adminPassword);
    }
    delete toSave.adminPassword;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving config:', err.message);
    return false;
  }
};

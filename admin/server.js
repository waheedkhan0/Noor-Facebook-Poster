import express from 'express';
import session from 'express-session';
import path from 'path';
import { loadConfig, saveConfig, verifyPassword } from './config.js';
import { loadHistory, clearHistory } from './history.js';
import { loadLogs, clearLogs, addLog } from './logger.js';

export let botState = {
  status: 'idle',
  lastPostTime: null,
  nextPostTime: null,
  lastPageNumber: null,
  lastHadithNumber: null,
  loginStatus: null,
  cronJob: null,
};

export const startAdminServer = () => {
  const config = loadConfig();
  const app = express();
  const PORT = config.adminPort || 3000;

  app.set('view engine', 'ejs');
  app.set('views', path.resolve('admin/views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(session({
    secret: process.env.SESSION_SECRET || 'quran-poster-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 },
  }));

  const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated) return next();
    res.redirect('/admin/login');
  };

  // ---- Auth Routes ----

  app.get('/admin/login', (req, res) => {
    if (req.session && req.session.authenticated) return res.redirect('/admin/dashboard');
    res.render('login', { error: null });
  });

  app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    const config = loadConfig();
    if (username === config.adminUsername && verifyPassword(password, config.adminPasswordHash)) {
      req.session.authenticated = true;
      addLog('info', `Admin login: ${username}`);
      return res.redirect('/admin/dashboard');
    }
    res.render('login', { error: 'Invalid username or password' });
  });

  app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
  });

  // ---- Protected Routes ----

  app.get('/admin/dashboard', requireAuth, (req, res) => {
    const config = loadConfig();
    const history = loadHistory();
    const logs = loadLogs().slice(0, 20);
    res.render('dashboard', { config, state: botState, history, logs });
  });

  app.get('/admin/config', requireAuth, (req, res) => {
    const config = loadConfig();
    res.render('config', { config, saved: false, error: null, maskPassword: true });
  });

  app.post('/admin/config', requireAuth, (req, res) => {
    try {
      const current = loadConfig();
      const updated = { ...current };

      const fields = [
        'cronSchedule', 'postDelayMinutes', 'headless',
        'maxRetries', 'retryDelayMs', 'maxHadithNumber', 'maxQuranPage',
        'adminPort', 'adminUsername', 'fbEmail', 'fbPassword',
        'facebookCookies', 'nodeEnv', 'botEnabled', 'adminPassword',
      ];

      for (const field of fields) {
        if (req.body[field] !== undefined && req.body[field] !== '') {
          const val = req.body[field];
          if (field === 'headless' || field === 'botEnabled') {
            updated[field] = val === 'true' || val === true;
          } else if (['postDelayMinutes', 'maxRetries', 'retryDelayMs', 'maxHadithNumber', 'maxQuranPage', 'adminPort'].includes(field)) {
            updated[field] = parseInt(val, 10);
          } else {
            updated[field] = val;
          }
        }
      }

      if (!req.body.adminPassword || req.body.adminPassword === '') {
        delete updated.adminPassword;
      }

      if (saveConfig(updated)) {
        addLog('info', 'Configuration updated via admin panel');
        const fresh = loadConfig();
        res.render('config', { config: fresh, saved: true, error: null, maskPassword: true });
      } else {
        res.render('config', { config: current, saved: false, error: 'Failed to save config', maskPassword: true });
      }
    } catch (err) {
      const config = loadConfig();
      res.render('config', { config, saved: false, error: err.message, maskPassword: true });
    }
  });

  app.get('/admin/logs', requireAuth, (req, res) => {
    const logs = loadLogs();
    res.render('logs', { logs });
  });

  app.post('/admin/action/clear-logs', requireAuth, (req, res) => {
    clearLogs();
    addLog('info', 'Logs cleared via admin panel');
    res.redirect('/admin/logs');
  });

  app.post('/admin/action/clear-history', requireAuth, (req, res) => {
    clearHistory();
    addLog('info', 'Post history cleared via admin panel');
    res.redirect('/admin/dashboard');
  });

  app.post('/admin/action/test-login', requireAuth, async (req, res) => {
    try {
      const { testLogin } = await import('../index.js');
      const result = await testLogin();
      if (result) {
        botState.loginStatus = 'success';
        addLog('info', 'Login test successful');
      } else {
        botState.loginStatus = 'failed';
        addLog('error', 'Login test failed');
      }
    } catch (err) {
      botState.loginStatus = 'failed';
      addLog('error', `Login test error: ${err.message}`);
    }
    res.redirect('/admin/dashboard');
  });

  app.post('/admin/action/post-now', requireAuth, async (req, res) => {
    if (botState.status === 'posting' || botState.status === 'waiting') {
      addLog('warn', 'Manual post skipped - bot is already active');
      return res.redirect('/admin/dashboard');
    }
    addLog('info', 'Manual post triggered from admin panel');
    botState.status = 'posting';
    setTimeout(async () => {
      try {
        const { automatePosting } = await import('../index.js');
        await automatePosting();
      } catch (err) {
        addLog('error', `Manual post failed: ${err.message}`);
        botState.status = 'error';
      }
    }, 100);
    res.redirect('/admin/dashboard');
  });

  app.post('/admin/action/restart-cron', requireAuth, async (req, res) => {
    try {
      const { restartCron } = await import('../index.js');
      restartCron();
      addLog('info', 'Cron jobs restarted via admin panel');
    } catch (err) {
      addLog('error', `Cron restart failed: ${err.message}`);
    }
    res.redirect('/admin/dashboard');
  });

  // ---- API Routes ----

  app.get('/admin/api/status', requireAuth, (req, res) => {
    const config = loadConfig();
    res.json({
      state: botState,
      config: {
        cronSchedule: config.cronSchedule,
        postDelayMinutes: config.postDelayMinutes,
        headless: config.headless,
        botEnabled: config.botEnabled,
        nodeEnv: config.nodeEnv,
      },
    });
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  app.get('/', (req, res) => {
    if (req.session && req.session.authenticated) {
      return res.redirect('/admin/dashboard');
    }
    res.redirect('/admin/login');
  });

  app.listen(PORT, () => {
    addLog('info', `Admin panel started on port ${PORT}`);
    console.log(`Admin panel: http://localhost:${PORT}`);
  });

  return app;
};

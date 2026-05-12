import fs from 'fs';
import path from 'path';

const LOG_PATH = path.resolve('admin/logs.json');

const MAX_LOGS = 1000;

export const loadLogs = () => {
  try {
    if (fs.existsSync(LOG_PATH)) {
      return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading logs:', err.message);
  }
  return [];
};

export const addLog = (level, message, data = null) => {
  const logs = loadLogs();
  logs.unshift({
    level,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify(logs, null, 2));
  } catch (err) {
    console.error('Error saving log:', err.message);
  }
  const prefix = level === 'error' ? '[ERROR]' : level === 'warn' ? '[WARN]' : '[INFO]';
  console.log(`${prefix} ${message}`);
};

export const clearLogs = () => {
  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify([], null, 2));
    return true;
  } catch (err) {
    console.error('Error clearing logs:', err.message);
    return false;
  }
};

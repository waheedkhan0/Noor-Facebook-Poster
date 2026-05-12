import fs from 'fs';
import path from 'path';

const HISTORY_PATH = path.resolve('admin/history.json');

export const loadHistory = () => {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading history:', err.message);
  }
  return [];
};

export const addHistoryEntry = (entry) => {
  const history = loadHistory();
  entry.timestamp = entry.timestamp || new Date().toISOString();
  history.unshift(entry);
  if (history.length > 500) history.length = 500;
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Error saving history:', err.message);
  }
};

export const clearHistory = () => {
  try {
    fs.writeFileSync(HISTORY_PATH, JSON.stringify([], null, 2));
    return true;
  } catch (err) {
    console.error('Error clearing history:', err.message);
    return false;
  }
};

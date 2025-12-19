const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'factory.db');

function loadComponentsFromDb(databasePath) {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database not found at ${databasePath}. Run "npm run build-db" to create it.`);
  }

  const db = new Database(databasePath, { readonly: true });
  const rows = db.prepare('SELECT id, type, x, y, defaultPosition, flammable, lastInspected FROM components').all();
  db.close();

  return rows.map((row) => ({
    ...row,
    flammable: Boolean(row.flammable)
  }));
}

function computeVersionHash(components) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(components));
  return hash.digest('hex');
}

let cachedComponents = [];
let versionHash = '';

function refreshCache() {
  cachedComponents = loadComponentsFromDb(dbPath);
  versionHash = computeVersionHash(cachedComponents);
}

refreshCache();

app.get('/components', (req, res) => {
  res.json({
    version: versionHash,
    components: cachedComponents
  });
});

app.get('/components/version', (req, res) => {
  res.json({ version: versionHash });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(port, () => {
  console.log(`Factory floor server running on port ${port}`);
});

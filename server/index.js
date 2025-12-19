const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 3000;
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'factory.db');
const polygonsPath = path.join(__dirname, '..', 'data', 'polygons.json');

function loadComponentsFromDb(databasePath) {
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database not found at ${databasePath}. Run "npm run build-db" to create it.`);
  }

  const db = new Database(databasePath, { readonly: true });
  const rows = db.prepare(
    'SELECT id, type, x, y, defaultPosition, flammable, lastInspected, testedPressure, attributes FROM components'
  ).all();
  db.close();

  return rows.map((row) => ({
    ...row,
    flammable: Boolean(row.flammable),
    attributes: row.attributes ? JSON.parse(row.attributes) : {}
  }));
}

function computeVersionHash(components) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(components));
  return hash.digest('hex');
}

let cachedComponents = [];
let versionHash = '';
let lastDbMtimeMs = 0;
let cachedPolygons = [];
let lastPolygonsMtimeMs = 0;

function refreshCache() {
  const stats = fs.statSync(dbPath);
  cachedComponents = loadComponentsFromDb(dbPath);
  versionHash = computeVersionHash(cachedComponents);
  lastDbMtimeMs = stats.mtimeMs;
}

function refreshCacheIfNeeded() {
  try {
    const stats = fs.statSync(dbPath);
    if (lastDbMtimeMs === 0 || stats.mtimeMs !== lastDbMtimeMs) {
      refreshCache();
    }
  } catch (error) {
    console.error('Failed to refresh component cache:', error.message);
  }
}

function refreshPolygonsIfNeeded() {
  try {
    if (!fs.existsSync(polygonsPath)) {
      cachedPolygons = [];
      return;
    }
    const stats = fs.statSync(polygonsPath);
    if (lastPolygonsMtimeMs === 0 || stats.mtimeMs !== lastPolygonsMtimeMs) {
      const raw = fs.readFileSync(polygonsPath, 'utf8');
      cachedPolygons = JSON.parse(raw);
      lastPolygonsMtimeMs = stats.mtimeMs;
    }
  } catch (error) {
    console.error('Failed to refresh polygon data:', error.message);
  }
}

refreshCache();
refreshPolygonsIfNeeded();

app.get('/components', (req, res) => {
  refreshCacheIfNeeded();
  res.json({
    version: versionHash,
    components: cachedComponents
  });
});

app.get('/components/version', (req, res) => {
  refreshCacheIfNeeded();
  res.json({ version: versionHash });
});

app.get('/polygons', (req, res) => {
  refreshPolygonsIfNeeded();
  res.json({ polygons: cachedPolygons });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(port, () => {
  console.log(`Factory floor server running on port ${port}`);
});

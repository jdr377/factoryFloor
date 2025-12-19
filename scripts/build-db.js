const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataPath = path.join(__dirname, '..', 'data', 'components.json');
const dbPath = path.join(__dirname, '..', 'data', 'factory.db');

if (!fs.existsSync(dataPath)) {
  console.error(`Missing data file at ${dataPath}.`);
  process.exit(1);
}

const raw = fs.readFileSync(dataPath, 'utf8');
const components = JSON.parse(raw);

const db = new Database(dbPath);

db.exec(`
  DROP TABLE IF EXISTS components;
  CREATE TABLE components (
    id TEXT PRIMARY KEY,
    type TEXT,
    x INTEGER,
    y INTEGER,
    defaultPosition TEXT,
    flammable INTEGER,
    lastInspected TEXT
  );
`);

const insert = db.prepare(`
  INSERT INTO components (id, type, x, y, defaultPosition, flammable, lastInspected)
  VALUES (@id, @type, @x, @y, @defaultPosition, @flammable, @lastInspected)
`);

const insertMany = db.transaction((items) => {
  items.forEach((item) => insert.run({
    ...item,
    flammable: item.flammable ? 1 : 0
  }));
});

insertMany(components);

console.log(`Seeded ${components.length} components into ${dbPath}`);

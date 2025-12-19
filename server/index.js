const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'public');
const dataDir = path.join(__dirname, '..', 'data');

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

app.get('/data/components.json', (req, res) => {
  try {
    const components = readJson(path.join(dataDir, 'components.json'));
    res.json(components);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read components.json' });
  }
});

app.get('/data/polygons.json', (req, res) => {
  try {
    const polygons = readJson(path.join(dataDir, 'polygons.json'));
    res.json(polygons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read polygons.json' });
  }
});

app.use(express.static(publicDir));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(port, () => {
  console.log(`Factory floor server running on port ${port}`);
});

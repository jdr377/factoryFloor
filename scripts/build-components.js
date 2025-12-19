const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'data', 'components');
const outputPath = path.join(__dirname, '..', 'data', 'components.json');

function toTypeFromFileName(fileName) {
  const base = path.basename(fileName, '.json');
  const words = base.split(/[-_\s]+/).filter(Boolean);
  if (words.length === 0) return null;
  const singularize = (word) => {
    if (word.endsWith('ies') && word.length > 3) {
      return `${word.slice(0, -3)}y`;
    }
    if (/(ses|xes|ches|shes|zes|oes)$/.test(word)) {
      return word.slice(0, -2);
    }
    if (word.endsWith('s') && word.length > 1) {
      return word.slice(0, -1);
    }
    return word;
  };
  const normalized = words.map((word, index) => {
    let clean = word;
    if (index === words.length - 1) {
      clean = singularize(clean);
    }
    return clean.charAt(0).toUpperCase() + clean.slice(1);
  });
  return normalized.join('');
}

function readJsonArray(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }
  return parsed;
}

if (!fs.existsSync(sourceDir)) {
  console.warn(`Missing ${sourceDir}. Nothing to merge.`);
  process.exit(0);
}

const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith('.json'));
const merged = [];

files.forEach((file) => {
  const filePath = path.join(sourceDir, file);
  const typeFromFile = toTypeFromFileName(file);
  const entries = readJsonArray(filePath);
  entries.forEach((item) => {
    if (!item.type && typeFromFile) {
      merged.push({ ...item, type: typeFromFile });
    } else {
      merged.push(item);
    }
  });
});

fs.writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
console.log(`Merged ${files.length} files into data/components.json (${merged.length} components).`);

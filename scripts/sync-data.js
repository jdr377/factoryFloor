const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'data');
const targetDir = path.join(__dirname, '..', 'public', 'data');

const filesToCopy = ['components.json', 'polygons.json'];

fs.mkdirSync(targetDir, { recursive: true });

filesToCopy.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (!fs.existsSync(sourcePath)) {
    console.warn(`Skipping missing file: ${sourcePath}`);
    return;
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(`Copied ${file} -> public/data/${file}`);
});

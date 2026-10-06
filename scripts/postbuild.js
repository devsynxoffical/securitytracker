const fs = require('fs');
const path = require('path');

const adminOutDir = path.join(__dirname, '..', 'apps', 'admin', 'out');
const rootIndexHtml = path.join(__dirname, '..', 'index.html');
const publicDir = path.join(__dirname, '..', 'public');

if (fs.existsSync(adminOutDir)) {
  console.log(`[postbuild] Copying static assets from ${adminOutDir}...`);

  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Copy apps/admin/out/index.html to root index.html
  const srcIndex = path.join(adminOutDir, 'index.html');
  if (fs.existsSync(srcIndex)) {
    fs.copyFileSync(srcIndex, rootIndexHtml);
    console.log(`[postbuild] Copied ${srcIndex} -> ${rootIndexHtml}`);
  }

  // Copy all assets to public/
  function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  copyRecursive(adminOutDir, publicDir);
  console.log(`[postbuild] Synchronized all assets into public/`);
} else {
  console.log(`[postbuild] Notice: ${adminOutDir} does not exist yet.`);
}

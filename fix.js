const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== 'dist') walk(p);
    } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      let c = fs.readFileSync(p, 'utf8');
      let changed = false;
      if (c.includes('\\`')) {
        c = c.replace(/\\`/g, '`');
        changed = true;
      }
      if (c.includes('\\${')) {
        c = c.replace(/\\\$\{/g, '${');
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(p, c);
        console.log('Fixed', p);
      }
    }
  }
}
walk('.');

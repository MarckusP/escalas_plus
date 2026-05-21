const { spawnSync } = require('child_process');
const fs = require('fs');
const ls = spawnSync('docker', ['logs', 'escalas-plus-backend-1']);
fs.writeFileSync('out.txt', ls.stdout);
fs.writeFileSync('err.txt', ls.stderr);
console.log('Done');

const fs = require('node:fs');
const path = require('node:path');
module.exports = () => {
  const directory = process.env.WASLA_ENDPOINT_COVERAGE;
  const lines = name => {
    const file = path.join(directory, name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  };
  const inventory = new Set(lines('inventory'));
  const statuses = new Map();
  for (const hit of lines('hits')) {
    const [method, route, status] = hit.split(' ');
    const key = `${method} ${route}`;
    if (!statuses.has(key)) statuses.set(key, new Set());
    statuses.get(key).add(Number(status));
  }
  const missing = [...inventory].filter(route => !statuses.has(route));
  const withoutSuccess = [...inventory].filter(route => ![...(statuses.get(route) || [])].some(status => status >= 200 && status < 400));
  console.log(`Endpoint inventory: ${inventory.size - missing.length}/${inventory.size} exercised; ${inventory.size - withoutSuccess.length}/${inventory.size} with a successful response`);
  if (withoutSuccess.length) console.log('Without successful response:\n' + withoutSuccess.join('\n'));
  fs.unlinkSync(path.join(directory, 'inventory'));
  if (fs.existsSync(path.join(directory, 'hits'))) fs.unlinkSync(path.join(directory, 'hits'));
  fs.rmdirSync(directory);
  if (!inventory.size || missing.length || withoutSuccess.length) throw Error(`Incomplete endpoint coverage: ${missing.join(', ')}`);
};

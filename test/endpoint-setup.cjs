const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
module.exports = () => {
  process.env.WASLA_ENDPOINT_COVERAGE = fs.mkdtempSync(path.join(os.tmpdir(), 'wasla-endpoints-'));
};

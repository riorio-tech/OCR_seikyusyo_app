const fs = require('fs');
const path = require('path');

const key = process.env.GCP_KEY_JSON;
if (!key) {
  console.error('GCP_KEY_JSON env is not set');
  process.exit(1);
}
const filePath = path.join(__dirname, '../src/lib/gcp-key.json');
fs.writeFileSync(filePath, key);
console.log('gcp-key.json written'); 
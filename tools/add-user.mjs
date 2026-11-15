// Adds an email to the WaterBreak invite list (stored as a SHA-256 hash so addresses aren't public).
// Usage: node tools/add-user.mjs someone@gmail.com [another@gmail.com ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const file = new URL('../config.js', import.meta.url);
let src = readFileSync(file, 'utf8');
for (const email of process.argv.slice(2)) {
  const h = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  if (src.includes(h)) { console.log('already invited:', email); continue; }
  src = src.replace(/allowedEmailSha256: \[\n/, m => `${m}    '${h}',\n`);
  console.log('invited:', email);
}
writeFileSync(file, src);

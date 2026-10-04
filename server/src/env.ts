import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Must be imported BEFORE anything that reads process.env, because ES module
// imports are evaluated in declaration order.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const candidate of [
  path.join(__dirname, '..', '.env'),
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), 'server', '.env'),
]) {
  if (fs.existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change-')) {
  console.warn(
    '[env] WARNING: JWT_SECRET is unset or still the placeholder value. ' +
      'Set a strong random secret before exposing this server.',
  );
}

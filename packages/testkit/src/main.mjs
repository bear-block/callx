import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** True when the module runs as the entry point, including through an npm bin symlink. */
export function isMain(moduleUrl) {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}

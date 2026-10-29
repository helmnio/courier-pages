import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('..', import.meta.url));
/**
 * Where screenplays live. STUDIO_DATA wins; an existing install keeps using its data folder
 * inside the app; a fresh install uses a visible folder in the user's Documents.
 */
function chooseDataDirectory() {
  if (process.env.STUDIO_DATA) return path.resolve(process.env.STUDIO_DATA);
  const inApp = path.join(root, 'data');
  if (existsSync(path.join(inApp, 'studio.sqlite'))) return inApp;
  return path.join(os.homedir(), 'Documents', 'Courier Pages');
}
export const dataDirectory = chooseDataDirectory();
export const port = Number(process.env.PORT ?? 4310);

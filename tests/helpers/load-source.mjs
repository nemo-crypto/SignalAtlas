import {build} from 'esbuild';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join} from 'node:path';
export async function loadSource(path) {
  const dir = await mkdtemp(fileURLToPath(new URL('.compiled-', import.meta.url)));
  try {
    const result = await build({entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false});
    const filename = join(dir, 'source.mjs');
    await writeFile(filename, result.outputFiles[0].text);
    return await import(pathToFileURL(filename).href);
  } finally {await rm(dir, {recursive: true, force: true});}
}

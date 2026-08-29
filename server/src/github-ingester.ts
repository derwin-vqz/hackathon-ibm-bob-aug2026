import tar from 'tar';
import { Readable } from 'stream';

export const CODELOAD_ORIGIN = 'https://codeload.github.com';
export const DEFAULT_REF = 'HEAD';

const SUPPORTED_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORE_PATHS = /(node_modules|dist|build|\.next|coverage|__tests__|\.git)/;

function generateDownloadUrl(owner: string, repo: string, ref: string): string {
  const escapedRef = ref.split('/').map(encodeURIComponent).join('/');
  return `${CODELOAD_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tar.gz/${escapedRef}`;
}

export async function downloadRepo(
  owner: string,
  repo: string,
  ref: string
): Promise<Map<string, string>> {
  const downloadUrl = generateDownloadUrl(owner, repo, ref);
  
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`GitHub codeload error ${res.status}: ${res.statusText}`);
  }

  if (!res.body) {
    throw new Error('Response body is empty');
  }

  const fileContents = new Map<string, string>();

  // Convierte res.body (Web API) a Node.js Stream
  const nodeStream = Readable.from(res.body as any);

  return new Promise((resolve, reject) => {
    nodeStream
      .pipe(tar.extract())
      .on('entry', async (entry) => {
        const path = entry.path;
        
        // Filtra: solo archivos relevantes, ignora carpetas ignoradas
        if (
          SUPPORTED_EXTENSIONS.test(path) &&
          !IGNORE_PATHS.test(path)
        ) {
          // Remueve el prefijo de carpeta del repo (ej: "react-main/src/...")
          const cleanPath = path.replace(/^[^/]+\//, '');
          
          try {
            const content = await streamToString(entry);
            fileContents.set(cleanPath, content);
            console.log(`  ✅ ${cleanPath}`);
          } catch (err) {
            console.warn(`  ⚠️ Error leyendo ${path}:`, err);
          }
        } else {
          entry.resume(); // Ignora archivos no relevantes
        }
      })
      .on('end', () => {
        console.log(`✅ Descarga completada: ${fileContents.size} archivos`);
        resolve(fileContents);
      })
      .on('error', reject);
  });
}

// Helper: convierte un stream a string
function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    stream.on('data', (chunk) => chunks.push(chunk.toString('utf-8')));
    stream.on('end', () => resolve(chunks.join('')));
    stream.on('error', reject);
  });
}
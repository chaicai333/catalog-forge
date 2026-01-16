import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface StoredFile {
  key: string;
  absolutePath: string;
}

export interface StorageAdapter {
  write: (relativePath: string, contents: Uint8Array) => Promise<StoredFile>;
  read: (relativePath: string) => Promise<Uint8Array>;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "..");
const configuredRoot = process.env.LOCAL_STORAGE_ROOT;
export const storageRoot = configuredRoot
  ? path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(repoRoot, configuredRoot)
  : path.resolve(repoRoot, "storage");

export const localStorageAdapter: StorageAdapter = {
  async write(relativePath, contents) {
    const absolutePath = path.join(storageRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
    return { key: relativePath, absolutePath };
  },
  async read(relativePath) {
    const absolutePath = path.join(storageRoot, relativePath);
    return fs.readFile(absolutePath);
  }
};

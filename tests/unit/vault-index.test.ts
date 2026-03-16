import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createTempVault, cleanupTempVault, createVaultIndex, writeVaultFile } from "../helpers.js";
import type { VaultIndex } from "../../src/vault-index.js";

let vaultPath: string;
let vault: VaultIndex;

beforeAll(async () => {
  vaultPath = await createTempVault();

  // Create a directory that only contains excluded content (.obsidian)
  await mkdir(path.join(vaultPath, "Projetos", ".obsidian"), { recursive: true });
  await writeVaultFile(vaultPath, "Projetos/.obsidian/app.json", '{"key": "value"}');

  // Create a normal indexed directory
  await writeVaultFile(vaultPath, "20-Projetos/note.md", "# Active project");

  vault = await createVaultIndex(vaultPath);
});

afterAll(async () => {
  vault.destroy();
  await cleanupTempVault(vaultPath);
});

describe("listDirEntries", () => {
  it("includes directories that exist on disk but aren't indexed", async () => {
    const entries = await vault.listDirEntries(".");
    const rels = entries.map((e) => e.rel);

    // 20-Projetos is indexed normally
    expect(rels).toContain("20-Projetos");

    // Projetos only has .obsidian (excluded) — should still appear via filesystem scan
    expect(rels).toContain("Projetos");

    const projetos = entries.find((e) => e.rel === "Projetos")!;
    expect(projetos).toBeDefined();
    expect(projetos.children_count).toBeGreaterThanOrEqual(1);
    expect(projetos.ctime).toBeGreaterThan(0);
    expect(projetos.mtime).toBeGreaterThan(0);
  });

  it("skips ghost directories not on filesystem", async () => {
    // Delete a directory from disk after indexing
    await mkdir(path.join(vaultPath, "ghost-dir"), { recursive: true });
    await writeVaultFile(vaultPath, "ghost-dir/temp.md", "temp");

    // Re-index so ghost-dir is in the index
    vault.destroy();
    const vault2 = await createVaultIndex(vaultPath);

    // Now remove the directory from disk
    await rm(path.join(vaultPath, "ghost-dir"), { recursive: true, force: true });

    const entries = await vault2.listDirEntries(".");
    const rels = entries.map((e) => e.rel);
    expect(rels).not.toContain("ghost-dir");

    vault2.destroy();
  });
});

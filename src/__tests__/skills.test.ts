/**
 * Tests for the skills engine: manifest validation, state management,
 * apply/uninstall lifecycle with atomic rollback.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { SkillManifestSchema } from "../skills/types.js";
import {
  initSkillsDir,
  isInitialized,
  readState,
  isSkillApplied,
  addAppliedSkill,
  removeAppliedSkill,
  snapshotFileToBase,
  getBaseFile,
} from "../skills/state.js";
import { createBackup, restoreBackup, hasBackup, clearBackup } from "../skills/backup.js";
import { applySkill } from "../skills/apply.js";
import { uninstallSkill } from "../skills/uninstall.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "coreclaw-skill-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("SkillManifestSchema", () => {
  it("validates a minimal manifest", () => {
    const result = SkillManifestSchema.safeParse({
      skill: "test-skill",
      description: "A test skill",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skill).toBe("test-skill");
      expect(result.data.adds).toEqual([]);
      expect(result.data.modifies).toEqual([]);
    }
  });

  it("validates a full manifest", () => {
    const result = SkillManifestSchema.safeParse({
      skill: "wordpress-adapter",
      version: "1.0.0",
      description: "WordPress integration",
      adds: ["src/wordpress.ts"],
      modifies: ["src/index.ts"],
      structured: {
        npm_dependencies: { "wp-api": "^1.0.0" },
        env_additions: ["WP_URL"],
      },
      depends: ["base-channel"],
      conflicts: ["old-wp-adapter"],
      test: "npm test",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty skill name", () => {
    const result = SkillManifestSchema.safeParse({
      skill: "",
      description: "bad",
    });
    expect(result.success).toBe(false);
  });
});

describe("Skills State", () => {
  it("initializes .coreclaw directory", () => {
    initSkillsDir(tmpDir);
    expect(isInitialized(tmpDir)).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".coreclaw", "state.json"))).toBe(true);
  });

  it("reads empty state", () => {
    initSkillsDir(tmpDir);
    const state = readState(tmpDir);
    expect(state.appliedSkills).toEqual([]);
    expect(state.engineVersion).toBe("0.1.0");
  });

  it("adds and removes applied skills", () => {
    initSkillsDir(tmpDir);
    addAppliedSkill({
      name: "test-skill",
      version: "1.0.0",
      appliedAt: new Date().toISOString(),
      fileHashes: { "src/test.ts": "abc123" },
      structuredOutcomes: {},
    }, tmpDir);

    expect(isSkillApplied("test-skill", tmpDir)).toBe(true);
    expect(isSkillApplied("other-skill", tmpDir)).toBe(false);

    removeAppliedSkill("test-skill", tmpDir);
    expect(isSkillApplied("test-skill", tmpDir)).toBe(false);
  });

  it("snapshots files to base and retrieves them", () => {
    initSkillsDir(tmpDir);
    const testFile = path.join(tmpDir, "src", "test.ts");
    fs.mkdirSync(path.dirname(testFile), { recursive: true });
    fs.writeFileSync(testFile, "original content");

    snapshotFileToBase("src/test.ts", tmpDir);
    expect(getBaseFile("src/test.ts", tmpDir)).toBe("original content");
  });
});

describe("Backup/Restore", () => {
  it("creates and restores backups", () => {
    initSkillsDir(tmpDir);
    const file = path.join(tmpDir, "test.txt");
    fs.writeFileSync(file, "original");

    createBackup(["test.txt"], tmpDir);
    expect(hasBackup(tmpDir)).toBe(true);

    // Modify the file
    fs.writeFileSync(file, "modified");

    // Restore should bring back original
    restoreBackup(tmpDir);
    expect(fs.readFileSync(file, "utf-8")).toBe("original");
    expect(hasBackup(tmpDir)).toBe(false);
  });

  it("clearBackup removes the backup", () => {
    initSkillsDir(tmpDir);
    fs.writeFileSync(path.join(tmpDir, "test.txt"), "x");
    createBackup(["test.txt"], tmpDir);
    expect(hasBackup(tmpDir)).toBe(true);

    clearBackup(tmpDir);
    expect(hasBackup(tmpDir)).toBe(false);
  });
});

describe("Apply + Uninstall lifecycle", () => {
  it("applies a skill that adds files", async () => {
    initSkillsDir(tmpDir);

    // Create a minimal skill
    const skillDir = path.join(tmpDir, "_skills", "add-test");
    fs.mkdirSync(path.join(skillDir, "add", "src"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "manifest.json"), JSON.stringify({
      skill: "add-test",
      description: "Adds a test file",
      adds: ["src/added.ts"],
    }));
    fs.writeFileSync(path.join(skillDir, "add", "src", "added.ts"), "export const x = 1;");

    const result = await applySkill(skillDir, tmpDir);

    expect(result.success).toBe(true);
    expect(result.filesAdded).toContain("src/added.ts");
    expect(fs.existsSync(path.join(tmpDir, "src", "added.ts"))).toBe(true);
    expect(isSkillApplied("add-test", tmpDir)).toBe(true);
  });

  it("uninstalls a skill (removes added files)", async () => {
    initSkillsDir(tmpDir);

    const skillDir = path.join(tmpDir, "_skills", "remove-test");
    fs.mkdirSync(path.join(skillDir, "add", "src"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "manifest.json"), JSON.stringify({
      skill: "remove-test",
      description: "Test for removal",
      adds: ["src/removable.ts"],
    }));
    fs.writeFileSync(path.join(skillDir, "add", "src", "removable.ts"), "export const y = 2;");

    await applySkill(skillDir, tmpDir);
    expect(fs.existsSync(path.join(tmpDir, "src", "removable.ts"))).toBe(true);

    const result = await uninstallSkill("remove-test", tmpDir);
    expect(result.success).toBe(true);
    expect(result.filesRemoved).toContain("src/removable.ts");
    expect(fs.existsSync(path.join(tmpDir, "src", "removable.ts"))).toBe(false);
    expect(isSkillApplied("remove-test", tmpDir)).toBe(false);
  });

  it("rejects applying the same skill twice", async () => {
    initSkillsDir(tmpDir);

    const skillDir = path.join(tmpDir, "_skills", "dupe-test");
    fs.mkdirSync(path.join(skillDir, "add"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "manifest.json"), JSON.stringify({
      skill: "dupe-test",
      description: "Dupe test",
      adds: [],
    }));

    const r1 = await applySkill(skillDir, tmpDir);
    expect(r1.success).toBe(true);

    const r2 = await applySkill(skillDir, tmpDir);
    expect(r2.success).toBe(false);
    expect(r2.error).toContain("already applied");
  });

  it("rejects skill with missing dependency", async () => {
    initSkillsDir(tmpDir);

    const skillDir = path.join(tmpDir, "_skills", "dep-test");
    fs.mkdirSync(path.join(skillDir, "add"), { recursive: true });
    fs.writeFileSync(path.join(skillDir, "manifest.json"), JSON.stringify({
      skill: "dep-test",
      description: "Depends on something",
      adds: [],
      depends: ["nonexistent-skill"],
    }));

    const result = await applySkill(skillDir, tmpDir);
    expect(result.success).toBe(false);
    expect(result.error).toContain("nonexistent-skill");
  });
});

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { M365Config } from "./types.js";
import { DEFAULT_M365_CONFIG } from "./types.js";

const CONFIG_DIR = "data";
const CONFIG_FILE = "email-config.enc.json";

/**
 * Encrypted config store for M365 credentials.
 * Uses AES-256-GCM with a key derived from a machine-local secret.
 * Config is stored in data/email-config.enc.json.
 */
export class EmailConfigStore {
  private readonly configPath: string;
  private readonly encryptionKey: Buffer;

  constructor(projectRoot: string = process.cwd()) {
    this.configPath = path.join(projectRoot, CONFIG_DIR, CONFIG_FILE);
    this.encryptionKey = this.deriveKey(projectRoot);
  }

  hasConfig(): boolean {
    return fs.existsSync(this.configPath);
  }

  save(config: M365Config): void {
    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    const encrypted = this.encrypt(JSON.stringify(config));
    fs.writeFileSync(this.configPath, encrypted);
  }

  load(): M365Config | null {
    if (!this.hasConfig()) return null;

    try {
      const encrypted = fs.readFileSync(this.configPath, "utf-8");
      const decrypted = this.decrypt(encrypted);
      return { ...DEFAULT_M365_CONFIG, ...JSON.parse(decrypted) as Partial<M365Config> };
    } catch {
      return null;
    }
  }

  delete(): void {
    if (fs.existsSync(this.configPath)) {
      fs.unlinkSync(this.configPath);
    }
  }

  /**
   * Returns a redacted version of the config (for display in GUI).
   * Client secret is masked.
   */
  loadRedacted(): (M365Config & { configured: boolean }) | null {
    const config = this.load();
    if (!config) return null;

    return {
      ...config,
      clientSecret: config.clientSecret ? "••••••••" + config.clientSecret.slice(-4) : "",
      configured: true,
    };
  }

  // ---------- Encryption ----------

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString("hex"),
      tag: tag.toString("hex"),
      data: encrypted.toString("hex"),
    });
  }

  private decrypt(ciphertext: string): string {
    const { iv, tag, data } = JSON.parse(ciphertext) as { iv: string; tag: string; data: string };
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return decipher.update(Buffer.from(data, "hex")) + decipher.final("utf-8");
  }

  /**
   * Derives an encryption key from a machine-local seed.
   * Not meant to protect against physical access — protects against
   * accidental exposure (e.g., committing data/ to git).
   */
  private deriveKey(projectRoot: string): Buffer {
    const seed = `coreclaw-email-${projectRoot}-${process.env["USER"] ?? "default"}`;
    return crypto.scryptSync(seed, "coreclaw-salt-v1", 32);
  }
}

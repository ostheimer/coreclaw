import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: "success" | "error";
  exitCode: number | null;
}

/**
 * Safely executes a binary with arguments, avoiding shell injection.
 * Uses execFile (not exec) to prevent command injection.
 */
export async function execFileNoThrow(
  file: string,
  args: string[] = [],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout ?? 30_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
    });
    return { stdout, stderr, status: "success", exitCode: 0 };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      status: "error",
      exitCode: error.code ?? 1,
    };
  }
}

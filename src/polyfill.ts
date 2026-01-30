// Polyfill for process in browser environment to avoid ReferenceError in some libraries
// especially for @modelcontextprotocol/sdk which might reference process
import { getFrontend } from "siyuan";

console.log(
  "[Siyuan Copilot] Initializing process polyfill (Dependency-free version)",
);

const target =
  typeof globalThis !== "undefined"
    ? globalThis
    : typeof window !== "undefined"
      ? window
      : typeof self !== "undefined"
        ? self
        : {};

const safeProcess = {
  env: {
    // @ts-ignore
    NODE_ENV:
      import.meta && import.meta.env ? import.meta.env.MODE : "production",
  },
  version: "",
  platform: "browser",
  nextTick: (cb: Function) => setTimeout(cb, 0),
  cwd: () => "/",
  // Mock stdio streams just in case
  stdin: {
    on: () => {},
    removeListener: () => {},
    read: () => null,
  },
  stdout: {
    on: () => {},
    removeListener: () => {},
    write: () => {},
  },
  stderr: {
    on: () => {},
    removeListener: () => {},
    write: () => {},
  },
};

function shouldPolyfill() {
  // 只有当 getFrontend 是浏览器时才生效
  // 但也要考虑到如果在桌面端，但 process 真的不存在（例如沙箱环境），可能也需要 polyfill？
  // 按照用户指令，严格限制在 browser 环境
  // getFrontend() 返回值可能是 "desktop", "desktop-window", "mobile", "browser-desktop" ,"browser-mobile"

  console.log(
    `[Siyuan Copilot] process: ${typeof (target as any)?.process} ${(target as any)?.process?.platform}`,
  );
  // 如果 process 已经完整存在，就不需要 polyfill
  if (
    typeof (target as any)?.process !== "undefined" &&
    (target as any)?.process?.platform
  ) {
    return false;
  }

  try {
    const frontend = getFrontend();
    console.log(`[Siyuan Copilot] Frontend type: ${frontend}`);
    // 浏览器环境列表
    const browserLike = ["mobile", "browser-desktop", "browser-mobile"];
    return browserLike.includes(frontend);
  } catch (e) {
    console.warn(
      "[Siyuan Copilot] Failed to get frontend type, falling back to process check",
      e,
    );
    // 如果无法获取 frontend，且 process 不存在，则 polyfill
    return typeof (target as any).process === "undefined";
  }
}

if (shouldPolyfill()) {
  if (typeof (target as any).process === "undefined") {
    console.log("[Siyuan Copilot] Polyfilling process (undefined)");
    (target as any).process = safeProcess;
  } else {
    // Merge if exists but missing properties (e.g. some partial polyfills might exist)
    console.log("[Siyuan Copilot] Polyfilling process (merging)");
    const existing = (target as any).process;
    if (!existing.platform) existing.platform = safeProcess.platform;
    if (!existing.env) existing.env = safeProcess.env;
    if (!existing.version) existing.version = safeProcess.version;
    if (!existing.nextTick) existing.nextTick = safeProcess.nextTick;
    if (!existing.cwd) existing.cwd = safeProcess.cwd;

    // Ensure stdio mocks exist
    if (!existing.stdin) existing.stdin = safeProcess.stdin;
    if (!existing.stdout) existing.stdout = safeProcess.stdout;
    if (!existing.stderr) existing.stderr = safeProcess.stderr;
  }

  // Double check and ensure window.process is set if we are in a window context
  if (typeof window !== "undefined") {
    try {
      if ((window as any).process !== (target as any).process) {
        console.log("[Siyuan Copilot] Syncing window.process");
        (window as any).process = (target as any).process;
      }
    } catch (e) {
      // ignore
    }
  }
} else {
  console.log("[Siyuan Copilot] Polyfill skipped.");
}

const exportProcess = (target || safeProcess) as any;

export const env = exportProcess.env;
export const version = exportProcess.version;
export const platform = exportProcess.platform;
export const nextTick = exportProcess.nextTick;
export const cwd = exportProcess.cwd;
export const stdin = exportProcess.stdin;
export const stdout = exportProcess.stdout;
export const stderr = exportProcess.stderr;

export default exportProcess;

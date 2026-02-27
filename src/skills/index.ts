export { applySkill } from "./apply.js";
export { uninstallSkill } from "./uninstall.js";
export { readManifest, listAvailableSkills, validatePreApply } from "./manifest.js";
export {
  initSkillsDir,
  isInitialized,
  readState,
  isSkillApplied,
  getAppliedSkill,
} from "./state.js";
export { createBackup, restoreBackup, hasBackup } from "./backup.js";
export { threeWayMerge } from "./merge.js";
export type {
  SkillManifest,
  SkillState,
  AppliedSkill,
  ApplyResult,
  UninstallResult,
  AvailableSkill,
} from "./types.js";

import { runEnvironmentalMaintenancePass } from "./environmental";
import { runGovernanceMaintenancePass } from "./governance";

const DEFAULT_INITIAL_DELAY_MS = 5_000;
const DEFAULT_INTERVAL_MINUTES = 60;

let schedulerStarted = false;
let schedulerInterval: NodeJS.Timeout | null = null;
let schedulerTimeout: NodeJS.Timeout | null = null;
let running = false;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runScheduledMaintenance() {
  if (running) return;

  running = true;
  try {
    await runGovernanceMaintenancePass();
    await runEnvironmentalMaintenancePass();
  } catch (error) {
    console.error("Management system maintenance scheduler failed", error);
  } finally {
    running = false;
  }
}

export function startManagementSystemMaintenanceScheduler() {
  if (schedulerStarted) return;
  if (process.env.MANAGEMENT_SYSTEM_MAINTENANCE_ENABLED === "false") return;

  schedulerStarted = true;

  const initialDelayMs = parsePositiveInt(
    process.env.MANAGEMENT_SYSTEM_MAINTENANCE_INITIAL_DELAY_MS,
    parsePositiveInt(
      process.env.GOVERNANCE_MAINTENANCE_INITIAL_DELAY_MS,
      DEFAULT_INITIAL_DELAY_MS,
    ),
  );
  const intervalMs =
    parsePositiveInt(
      process.env.MANAGEMENT_SYSTEM_MAINTENANCE_INTERVAL_MINUTES,
      parsePositiveInt(
        process.env.GOVERNANCE_MAINTENANCE_INTERVAL_MINUTES,
        DEFAULT_INTERVAL_MINUTES,
      ),
    ) *
    60 *
    1000;

  schedulerTimeout = setTimeout(() => {
    schedulerTimeout = null;
    if (!schedulerStarted) return;
    void runScheduledMaintenance();
    schedulerInterval = setInterval(() => {
      void runScheduledMaintenance();
    }, intervalMs);
  }, initialDelayMs);
}

export function stopManagementSystemMaintenanceScheduler() {
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  schedulerStarted = false;
}

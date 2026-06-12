import { schedule as cronSchedule, validate as cronValidate, type ScheduledTask } from "node-cron";
import { runGovernanceMaintenancePass } from "./governance";
import { runRegulatoryDocumentAlertsPass } from "../services/regulatory-documents/alerts";
import { runActionPlanEscalationPass, runActionPlanEffectivenessEscalationPass } from "../services/action-plans/escalation";

// --- Defaults ---
//
// The scheduler runs two independent passes with their own cadences:
//
//   • governance/LAIA maintenance: every hour, top of the hour
//   • regulatory documents alerts: once a day at 01:00 (server-local time)
//
// Both expressions are overridable via env vars. Set to empty string to disable
// a specific pass; set GOVERNANCE_MAINTENANCE_ENABLED=false to disable the
// scheduler entirely (e.g., in CI or local dev).
//
// On boot we also run both passes once after a short delay so deploys don't
// need to wait until the next cron tick to alert.

const DEFAULT_GOVERNANCE_CRON = "0 * * * *"; // every hour at :00
const DEFAULT_REGULATORY_CRON = "0 1 * * *"; // every day at 01:00 server-local
const DEFAULT_ACTION_PLAN_CRON = "0 9 * * *"; // every day at 09:00 server-local
const DEFAULT_INITIAL_DELAY_MS = 5_000;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

let schedulerStarted = false;
const tasks: ScheduledTask[] = [];

// Per-pass run-locks prevent overlap if a previous run is still in flight when
// the next tick fires.
const inFlight = new Set<string>();

async function runPass(name: string, fn: () => Promise<unknown>) {
  if (inFlight.has(name)) {
    console.log(`[scheduler] skipping ${name} — previous run still in flight`);
    return;
  }
  inFlight.add(name);
  const startedAt = Date.now();
  try {
    await fn();
    console.log(`[scheduler] ${name} completed in ${Date.now() - startedAt}ms`);
  } catch (error) {
    console.error(`[scheduler] ${name} failed`, error);
  } finally {
    inFlight.delete(name);
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function scheduleIfValid(label: string, expression: string, fn: () => Promise<unknown>, timezone: string) {
  if (!expression) {
    console.log(`[scheduler] ${label} disabled (empty cron expression)`);
    return;
  }
  if (!cronValidate(expression)) {
    console.error(`[scheduler] invalid cron expression for ${label}: "${expression}" — pass not scheduled`);
    return;
  }
  const task = cronSchedule(expression, () => { void runPass(label, fn); }, { timezone });
  tasks.push(task);
  console.log(`[scheduler] ${label} scheduled with "${expression}" (${timezone})`);
}

export function startGovernanceMaintenanceScheduler() {
  if (schedulerStarted) return;
  if (process.env.GOVERNANCE_MAINTENANCE_ENABLED === "false") {
    console.log("[scheduler] disabled by GOVERNANCE_MAINTENANCE_ENABLED=false");
    return;
  }

  schedulerStarted = true;

  const timezone = process.env.SCHEDULER_TIMEZONE ?? DEFAULT_TIMEZONE;
  const governanceCron = process.env.GOVERNANCE_MAINTENANCE_CRON ?? DEFAULT_GOVERNANCE_CRON;
  const regulatoryCron = process.env.REGULATORY_ALERTS_CRON ?? DEFAULT_REGULATORY_CRON;
  const actionPlanCron = process.env.ACTION_PLAN_ESCALATION_CRON ?? DEFAULT_ACTION_PLAN_CRON;
  const initialDelayMs = parsePositiveInt(
    process.env.GOVERNANCE_MAINTENANCE_INITIAL_DELAY_MS,
    DEFAULT_INITIAL_DELAY_MS,
  );

  // Boot warmup: run all passes once shortly after the server is up.
  setTimeout(() => {
    void runPass("governance-maintenance", runGovernanceMaintenancePass);
    void runPass("regulatory-alerts", runRegulatoryDocumentAlertsPass);
    void runPass("action-plan-escalation", runActionPlanEscalationPass);
    void runPass("action-plan-effectiveness-escalation", runActionPlanEffectivenessEscalationPass);
  }, initialDelayMs);

  scheduleIfValid("governance-maintenance", governanceCron, runGovernanceMaintenancePass, timezone);
  scheduleIfValid("regulatory-alerts", regulatoryCron, runRegulatoryDocumentAlertsPass, timezone);
  scheduleIfValid("action-plan-escalation", actionPlanCron, runActionPlanEscalationPass, timezone);
  scheduleIfValid("action-plan-effectiveness-escalation", actionPlanCron, runActionPlanEffectivenessEscalationPass, timezone);
}

export function stopGovernanceMaintenanceScheduler() {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  schedulerStarted = false;
}

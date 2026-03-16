import app from "./app";
import { startGovernanceMaintenanceScheduler } from "./lib/governance-scheduler";
import { seedQuestionnaire } from "./seeds/questionnaire";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

seedQuestionnaire().catch(console.error);
startGovernanceMaintenanceScheduler();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

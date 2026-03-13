import app from "./app";
import { seedQuestionnaire } from "./seeds/questionnaire";
import { db } from "@workspace/db";
import { usersTable, organizationsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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

async function cleanupUser() {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, "dev@webstar.studio"));
    if (user) {
      await db.delete(usersTable).where(eq(usersTable.id, user.id));
      await db.delete(organizationsTable).where(eq(organizationsTable.id, user.organizationId));
      console.log(`Cleaned up user dev@webstar.studio (id=${user.id}) and org (id=${user.organizationId})`);
    }
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}

cleanupUser();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

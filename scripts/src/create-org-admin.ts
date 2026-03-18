import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

type CliOptions = {
  email?: string;
  password?: string;
  name?: string;
  orgId?: number;
  help?: boolean;
};

function printUsage(): void {
  console.log(`
Uso:
  pnpm --filter @workspace/scripts create-org-admin --email <email> --password <senha> --name <nome> --org-id <id>

Exemplos:
  pnpm --filter @workspace/scripts create-org-admin --email admin@empresa.com --password "SenhaForte123" --name "Admin da Org" --org-id 1

Comportamento:
  - Se o usuário já existir, ele será promovido para role "org_admin" na organização informada.
  - --org-id é obrigatório.
`);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--email":
        options.email = argv[index + 1];
        index += 1;
        break;
      case "--password":
        options.password = argv[index + 1];
        index += 1;
        break;
      case "--name":
        options.name = argv[index + 1];
        index += 1;
        break;
      case "--org-id": {
        const rawValue = argv[index + 1];
        const parsed = Number(rawValue);
        if (!rawValue || Number.isNaN(parsed) || parsed <= 0) {
          throw new Error(`Invalid --org-id value: ${String(rawValue)}`);
        }
        options.orgId = parsed;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function loadDbModule() {
  return import("@workspace/db");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.email || !options.password || !options.name || options.orgId == null) {
    printUsage();
    throw new Error("--email, --password, --name and --org-id are required.");
  }

  const normalizedEmail = options.email.trim().toLowerCase();
  const normalizedName = options.name.trim();

  if (!normalizedEmail) {
    throw new Error("--email cannot be empty.");
  }

  if (!normalizedName) {
    throw new Error("--name cannot be empty.");
  }

  if (options.password.length < 8) {
    throw new Error("--password must have at least 8 characters.");
  }

  const { db, usersTable, organizationsTable } = await loadDbModule();

  // Verify organization exists
  const organization = await db.query.organizationsTable.findFirst({
    where: eq(organizationsTable.id, options.orgId),
    columns: { id: true, name: true },
  });

  if (!organization) {
    throw new Error(`Organization not found for --org-id=${options.orgId}`);
  }

  const passwordHash = await bcrypt.hash(options.password, 10);

  const existingUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, normalizedEmail),
  });

  if (existingUser) {
    const [updatedUser] = await db
      .update(usersTable)
      .set({
        name: normalizedName,
        passwordHash,
        organizationId: organization.id,
        role: "org_admin",
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, existingUser.id))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        organizationId: usersTable.organizationId,
        role: usersTable.role,
      });

    console.log("User updated successfully:");
    console.log(
      JSON.stringify(
        {
          action: "promoted_existing_user",
          organization: organization.name,
          user: updatedUser,
        },
        null,
        2,
      ),
    );
    return;
  }

  const [createdUser] = await db
    .insert(usersTable)
    .values({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      organizationId: organization.id,
      role: "org_admin",
    })
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      organizationId: usersTable.organizationId,
      role: usersTable.role,
    });

  console.log("User created successfully:");
  console.log(
    JSON.stringify(
      {
        action: "created_user",
        organization: organization.name,
        user: createdUser,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`create-org-admin failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      const dbModule = await loadDbModule();
      await dbModule.pool.end();
    } catch {
      // Ignore cleanup errors when the DB module was never initialized.
    }
  });

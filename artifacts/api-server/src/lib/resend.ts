import { Resend } from "resend";

type ReplitConnectorSettings = {
  settings?: {
    api_key?: string;
    from_email?: string;
  };
};

let connectionSettings: ReplitConnectorSettings | undefined;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X-Replit-Token not found for repl/depl");
  }

  const data = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  ).then((res) => res.json()) as { items?: ReplitConnectorSettings[] };

  connectionSettings = data.items?.[0];

  const settings = connectionSettings?.settings;

  if (!settings?.api_key) {
    throw new Error("Resend not connected: missing api_key");
  }

  if (!settings.from_email) {
    throw new Error("Resend not connected: missing from_email");
  }

  return {
    apiKey: settings.api_key,
    fromEmail: settings.from_email,
  };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

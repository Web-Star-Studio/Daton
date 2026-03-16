import { Resend } from "resend";

async function getCredentials() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required");
  }

  if (!fromEmail) {
    throw new Error("RESEND_FROM_EMAIL is required");
  }

  return {
    apiKey,
    fromEmail,
  };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

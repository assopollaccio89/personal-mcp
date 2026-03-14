import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
];

const TOKEN_PATH = path.resolve(process.env.TOKEN_PATH || "./tokens/token.json");

/**
 * Handles Google OAuth2 authentication.
 * If token.json exists, uses it; otherwise, prints auth URL to stdout.
 */
export async function getGoogleAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
  }

  const oAuth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI || "http://localhost:3003/oauth2callback"
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = fs.readFileSync(TOKEN_PATH, "utf8");
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  }

  // --- No Token Found: Start Flow ---
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n--- GOOGLE AUTH REQUIRED ---");
  console.log("1. Open this URL in your browser:\n", authUrl);
  console.log("\n2. Authorize the application and copy the 'code' from the URL parameter.");
  console.log("3. Add the code to the environment variable GOOGLE_AUTH_CODE and restart.");
  console.log("-----------------------------\n");

  const code = process.env.GOOGLE_AUTH_CODE;
  if (code) {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log("[Auth] Token saved to", TOKEN_PATH);
    return oAuth2Client;
  }

  throw new Error("Action Required: Complete Google Auth and set GOOGLE_AUTH_CODE.");
}

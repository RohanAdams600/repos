/**
 * Shared refresh-token -> access-token exchange for Google APIs (Gmail,
 * Calendar). Access tokens are short-lived (~1hr) and cached in-memory
 * per credential set — cheap to re-fetch, but no reason to hit Google's
 * token endpoint on every single API call.
 */
import { logger } from "./logger.js";

interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export async function getGoogleAccessToken(creds: GoogleCredentials): Promise<string> {
  const cacheKey = creds.refreshToken;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.error({ status: response.status, body }, "Google OAuth2 token refresh failed");
    throw new Error(`Google OAuth2 token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

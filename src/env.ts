export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ALERT: SendEmail;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Secret (wrangler secret put ALERT_TO). Must be a verified Email Routing destination address. */
  ALERT_TO: string;
}

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ALERT: SendEmail;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Must equal send_email[ALERT].destination_address in wrangler.jsonc. */
  ALERT_TO: string;
}

/**
 * HissabAI backend API configuration.
 *
 * API_BASE_URL must point to the running FastAPI backend.
 * In the Replit development environment this is the external dev-domain URL;
 * port 8000 is mapped to the default HTTPS port (80) by the Replit proxy.
 *
 * Update this value when the Replit dev domain changes or when deploying to
 * a production environment.
 *
 * The mobile app communicates ONLY with FastAPI.
 * Never set this to a Supabase or OpenAI URL.
 */
export const API_BASE_URL =
  'https://ae508cc4-3097-4e5f-908b-cbc76971a435-00-15xeicim3cyj.sisko.replit.dev';

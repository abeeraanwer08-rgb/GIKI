/**
 * HissabAI backend API configuration.
 *
 * The app talks ONLY to the FastAPI backend (never to Supabase or OpenAI).
 * Point it at your backend with the EXPO_PUBLIC_API_URL environment variable:
 *
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:8000 npx expo start
 *
 * Use your computer's LAN IP for a physical phone. The default,
 * http://10.0.2.2:8000, is how the Android emulator reaches your computer's
 * localhost. See the README for the full run instructions.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000').replace(/\/+$/, '');

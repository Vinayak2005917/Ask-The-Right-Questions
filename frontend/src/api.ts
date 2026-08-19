const REMOTE_API_URL = 'https://ask-the-right-questions.onrender.com';

/**
 * Base URL for backend API calls.
 * - In dev (`vite dev`), requests use relative paths, which vite.config.ts
 *   proxies to http://localhost:8000 (local fallback).
 * - In production (Vercel), requests go directly to the deployed Render backend.
 * - Override with the VITE_API_URL env var if needed.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ??
  (import.meta.env.DEV ? '' : REMOTE_API_URL);

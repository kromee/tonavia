import 'dotenv/config';
import { writeFile } from 'node:fs/promises';

const config = {
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID ?? '',
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? ''
};

await writeFile(
  new URL('../public/runtime-config.js', import.meta.url),
  `globalThis.__tonaviaConfig = ${JSON.stringify(config)};\n`,
  'utf8'
);

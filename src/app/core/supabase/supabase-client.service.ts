import { Injectable } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

interface RuntimeConfig {
  spotifyClientId: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
}

declare global {
  var __tonaviaConfig: Partial<RuntimeConfig> | undefined;
}

@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private readonly config = globalThis.__tonaviaConfig;
  private clientInstance?: SupabaseClient;

  get isConfigured(): boolean {
    return Boolean(this.config?.supabaseUrl && this.config?.supabasePublishableKey);
  }

  get client(): SupabaseClient {
    if (!this.isConfigured) {
      throw new Error('Supabase no está configurado.');
    }

    this.clientInstance ??= createClient(
      this.config!.supabaseUrl!,
      this.config!.supabasePublishableKey!,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true
        }
      }
    );
    return this.clientInstance;
  }

  async ensureAnonymousSession(): Promise<string> {
    const { data } = await this.client.auth.getSession();
    if (data.session?.user.id) {
      return data.session.user.id;
    }

    const { data: signInData, error } = await this.client.auth.signInAnonymously();
    if (error || !signInData.user) {
      throw error ?? new Error('No se pudo crear la sesión anónima.');
    }

    return signInData.user.id;
  }
}

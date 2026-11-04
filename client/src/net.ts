import { io, Socket } from 'socket.io-client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Sunucu adresi: build sırasında VITE_SERVER_URL verilmezse aynı origin (sunucu istemciyi kendisi sunar).
export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL || window.location.origin;

export interface ServerConfig { mode: 'demo' | 'supabase'; voice: boolean; supabaseUrl: string | null; supabaseAnonKey: string | null }
export interface Profile { id: string; username: string; avatar: string; level: number }
export interface FullProfile extends Profile { bio: string; charm: number; wealth: number }
export interface Wallet { diamonds: number; coins: number; canClaimDaily: boolean }

let socket: Socket | null = null;
let supabase: SupabaseClient | null = null;
let config: ServerConfig | null = null;

export async function loadConfig(): Promise<ServerConfig> {
  if (config) return config;
  const r = await fetch(`${SERVER_URL}/config`);
  config = await r.json();
  if (config!.mode === 'supabase') supabase = createClient(config!.supabaseUrl!, config!.supabaseAnonKey!);
  return config!;
}

export const getSupabase = () => supabase;
export const getSocket = () => socket;

export function call<T = any>(event: string, payload?: unknown): Promise<T & { ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, error: 'Bağlantı yok' } as any);
    const t = setTimeout(() => resolve({ ok: false, error: 'Zaman aşımı' } as any), 10_000);
    const done = (r: any) => { clearTimeout(t); resolve(r); };
    if (payload === undefined) socket.emit(event, done); else socket.emit(event, payload, done);
  });
}

export function connect(token: string): Promise<Socket> {
  socket?.disconnect();
  return new Promise((resolve, reject) => {
    const s = io(SERVER_URL, { auth: { token }, transports: ['websocket', 'polling'] });
    s.once('connect', () => { socket = s; resolve(s); });
    s.once('connect_error', (e) => { s.disconnect(); reject(e); });
  });
}

// ---------------- Kimlik
const DEMO_KEY = 'parti.demo';

export async function restoreSession(): Promise<string | null> {
  const cfg = await loadConfig();
  if (cfg.mode === 'demo') {
    try { return localStorage.getItem(DEMO_KEY); } catch { return null; }
  }
  const { data } = await supabase!.auth.getSession();
  return data.session?.access_token ?? null;
}

export function demoToken(name: string, avatar: string) {
  const t = `demo:${name}:${avatar}`;
  try { localStorage.setItem(DEMO_KEY, t); } catch { /* yoksay */ }
  return t;
}

export async function emailAuth(kind: 'login' | 'register', email: string, password: string, username?: string, avatar?: string) {
  const sb = supabase!;
  if (kind === 'register') {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username, avatar } } });
    if (error) throw new Error(trAuth(error.message));
    if (!data.session) throw new Error('Kayıt tamam! E-postana gelen onay bağlantısına tıklayıp giriş yap.');
    return data.session.access_token;
  }
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(trAuth(error.message));
  return data.session.access_token;
}

function trAuth(m: string) {
  if (/invalid login/i.test(m)) return 'E-posta veya şifre hatalı';
  if (/already registered/i.test(m)) return 'Bu e-posta zaten kayıtlı';
  if (/email not confirmed/i.test(m)) return 'E-posta henüz onaylanmamış';
  if (/password/i.test(m)) return 'Şifre en az 6 karakter olmalı';
  return m;
}

export async function logout() {
  try { localStorage.removeItem(DEMO_KEY); } catch { /* yoksay */ }
  await supabase?.auth.signOut();
  socket?.disconnect();
  socket = null;
}

/** Supabase token yenilendiğinde sunucuya bildir. */
export function watchTokenRefresh() {
  supabase?.auth.onAuthStateChange((_e, session) => {
    if (session?.access_token && socket) {
      socket.emit('token:refresh', { token: session.access_token });
      (socket.auth as any).token = session.access_token;
    }
  });
}

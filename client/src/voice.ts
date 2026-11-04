// LiveKit sesli oda bağlantısı. Sunucu LiveKit anahtarı yoksa sessizce devre dışı kalır.
import { Room, RoomEvent, Track } from 'livekit-client';
import { call } from './net';

type Listener = (speaking: Set<string>, status: VoiceStatus) => void;
export type VoiceStatus = 'off' | 'connecting' | 'on' | 'error';

let room: Room | null = null;
let status: VoiceStatus = 'off';
let speaking = new Set<string>();
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l(speaking, status));

export function onVoice(l: Listener) { listeners.add(l); l(speaking, status); return () => { listeners.delete(l); }; }

export async function joinVoice() {
  await leaveVoice();
  const r = await call<{ url?: string; token?: string; disabled?: boolean }>('voice:token');
  if (!r.ok || r.disabled || !r.url || !r.token) { status = 'off'; emit(); return; }
  status = 'connecting'; emit();
  const lk = new Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  lk.on(RoomEvent.ActiveSpeakersChanged, (ps) => { speaking = new Set(ps.map(p => p.identity)); emit(); });
  lk.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) { const el = track.attach(); el.style.display = 'none'; document.body.appendChild(el); }
  });
  lk.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach(el => el.remove()));
  lk.on(RoomEvent.Disconnected, () => { status = 'off'; speaking = new Set(); emit(); });
  try {
    await lk.connect(r.url, r.token);
    room = lk; status = 'on'; emit();
  } catch { status = 'error'; emit(); }
}

/** Koltuktaysa ve susturulmamışsa mikrofonu aç. */
export async function setMic(on: boolean) {
  if (!room) return false;
  try { await room.localParticipant.setMicrophoneEnabled(on); return true; }
  catch { return false; }
}

export async function leaveVoice() {
  const r = room; room = null;
  if (r) await r.disconnect();
  status = 'off'; speaking = new Set(); emit();
}

/** Mobil tarayıcılarda ses çalmak için kullanıcı etkileşimi gerekir. */
export function unlockAudio() { room?.startAudio().catch(() => {}); }

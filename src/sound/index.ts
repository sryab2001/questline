import { type AudioPlayer, type AudioSource, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';

import { readMeta, writeMeta } from '@/db/client';

const SOURCES = {
  tick: require('../../assets/sounds/tick.wav'),
  clear: require('../../assets/sounds/clear.wav'),
  quest: require('../../assets/sounds/quest.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  penalty: require('../../assets/sounds/penalty.wav'),
  purchase: require('../../assets/sounds/purchase.wav'),
} as const;

/** The Voice of the World: original announcer lines (scripts/voice/generate.mjs). */
const VOICES = {
  daily: require('../../assets/sounds/voice/daily.wav'),
  levelup: require('../../assets/sounds/voice/levelup.wav'),
  title: require('../../assets/sounds/voice/title.wav'),
  item: require('../../assets/sounds/voice/item.wav'),
  boss: require('../../assets/sounds/voice/boss.wav'),
  penalty: require('../../assets/sounds/voice/penalty.wav'),
  arise: require('../../assets/sounds/voice/arise.wav'),
  job: require('../../assets/sounds/voice/job.wav'),
  dungeon: require('../../assets/sounds/voice/dungeon.wav'),
  routine: require('../../assets/sounds/voice/routine.wav'),
  bounty: require('../../assets/sounds/voice/bounty.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;
type VoiceName = keyof typeof VOICES;

/** Moments that can have a voice line and a sound of your own. */
export const SOUND_EVENTS = {
  quest_clear: { label: 'Quest cleared', effect: 'clear' },
  daily_complete: { label: 'Daily Quest complete', effect: 'quest', voice: 'daily' },
  level_up: { label: 'Level up', effect: 'levelup', voice: 'levelup' },
  achievement: { label: 'Achievement or title', effect: 'levelup', voice: 'title' },
  item: { label: 'Item acquired', effect: 'purchase', voice: 'item' },
  boss: { label: 'Boss defeated', effect: 'levelup', voice: 'boss' },
  penalty: { label: 'Penalty', effect: 'penalty', voice: 'penalty' },
  arise: { label: 'Shadow extracted (Arise)', effect: 'levelup', voice: 'arise' },
  job: { label: 'Job change', effect: 'levelup', voice: 'job' },
  dungeon: { label: 'Dungeon cleared', effect: 'levelup', voice: 'dungeon' },
  routine: { label: 'Routine complete', effect: 'quest', voice: 'routine' },
  bounty: { label: 'Bounty earned', effect: 'levelup', voice: 'bounty' },
  purchase: { label: 'Store purchase', effect: 'purchase' },
} satisfies Record<string, { label: string; effect: SoundName; voice?: VoiceName }>;

export type SoundEvent = keyof typeof SOUND_EVENTS;

let enabled = true;
let ready = false;
const players = new Map<string, AudioPlayer>();

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

// ---------- device-local preferences (not synced) ----------

const VOICE_KEY = 'voice_on';
const PACK_KEY = 'sound_pack';

export function voiceEnabled() {
  return readMeta(VOICE_KEY) !== '0';
}

export function setVoiceEnabled(on: boolean) {
  writeMeta(VOICE_KEY, on ? '1' : '0');
}

/** Your own sound files, by event (file URIs inside the app's documents folder). */
export function readSoundPack(): Partial<Record<SoundEvent, string>> {
  try {
    return JSON.parse(readMeta(PACK_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeSoundPack(pack: Partial<Record<SoundEvent, string>>) {
  writeMeta(PACK_KEY, JSON.stringify(pack));
}

/** Lets you pick an audio file for an event; it's copied into the app so it keeps working. */
export async function chooseCustomSound(event: SoundEvent): Promise<boolean> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return false;
  const picked = res.assets[0];
  const dir = new Directory(Paths.document, 'sounds');
  dir.create({ idempotent: true, intermediates: true });
  const ext = (picked.name.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? '.mp3').toLowerCase();
  // A fresh name each time so a cached player never plays the old file.
  const dest = new File(dir, `${event}-${Date.now()}${ext}`);
  await new File(picked.uri).copy(dest, { overwrite: true });
  clearCustomSound(event);
  writeSoundPack({ ...readSoundPack(), [event]: dest.uri });
  return true;
}

export function clearCustomSound(event: SoundEvent) {
  const pack = readSoundPack();
  const uri = pack[event];
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
  players.get(uri)?.remove();
  players.delete(uri);
  delete pack[event];
  writeSoundPack(pack);
}

// ---------- playback ----------

function player(key: string, source: AudioSource, volume: number) {
  if (!ready) {
    ready = true;
    // Sound effects mix with music instead of pausing it.
    setAudioModeAsync({ interruptionMode: 'mixWithOthers', playsInSilentMode: false }).catch(() => {});
  }
  let p = players.get(key);
  if (!p) {
    p = createAudioPlayer(source);
    p.volume = volume;
    players.set(key, p);
  }
  return p;
}

function play(key: string, source: AudioSource, volume = 0.8) {
  try {
    const p = player(key, source, volume);
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Audio is decoration; ignore failures.
  }
}

/** Plays a sound effect if sounds are on. Never throws. */
export function playSound(name: SoundName) {
  if (!enabled) return;
  play(name, SOURCES[name], name === 'tick' ? 0.5 : 0.8);
}

/**
 * Plays a moment: your own file for it if you set one, otherwise its effect
 * followed by the Voice of the World line (when the voice is on).
 */
export function playEvent(event: SoundEvent) {
  if (!enabled) return;
  const custom = readSoundPack()[event];
  if (custom) return play(custom, { uri: custom }, 1);
  const def: { effect: SoundName; voice?: VoiceName } = SOUND_EVENTS[event];
  playSound(def.effect);
  if (def.voice && voiceEnabled()) {
    const voice = def.voice;
    setTimeout(() => play(`voice:${voice}`, VOICES[voice], 1), 450);
  }
}

/** Preview for settings: plays the event even if it's the same as the last one. */
export function previewEvent(event: SoundEvent) {
  const was = enabled;
  enabled = true;
  playEvent(event);
  enabled = was;
}

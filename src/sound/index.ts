import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const SOURCES = {
  tick: require('../../assets/sounds/tick.wav'),
  clear: require('../../assets/sounds/clear.wav'),
  quest: require('../../assets/sounds/quest.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  penalty: require('../../assets/sounds/penalty.wav'),
  purchase: require('../../assets/sounds/purchase.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

let enabled = true;
let ready = false;
const players = new Map<SoundName, AudioPlayer>();

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

function player(name: SoundName) {
  if (!ready) {
    ready = true;
    // Sound effects mix with music instead of pausing it.
    setAudioModeAsync({ interruptionMode: 'mixWithOthers', playsInSilentMode: false }).catch(() => {});
  }
  let p = players.get(name);
  if (!p) {
    p = createAudioPlayer(SOURCES[name]);
    p.volume = name === 'tick' ? 0.5 : 0.8;
    players.set(name, p);
  }
  return p;
}

/** Plays a sound effect if sounds are on. Never throws. */
export function playSound(name: SoundName) {
  if (!enabled) return;
  try {
    const p = player(name);
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // Audio is decoration; ignore failures.
  }
}

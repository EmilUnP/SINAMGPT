export const AUDIO_MIME = "audio/wav" as const;
export const AUDIO_SAMPLE_RATE = 16_000;
export const AUDIO_CHANNELS = 1;
export const AUDIO_BITS = 16;
export const MAX_AUDIO_SECONDS = 30;
export const MAX_AUDIO_MS = MAX_AUDIO_SECONDS * 1000;
export const MAX_CHAT_AUDIO = 1;
/** 16 kHz / 16-bit / mono / 30s is ~1 MB; leave headroom for the WAV header. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** Incoming file before we convert it to 16 kHz WAV. */
export const MAX_AUDIO_UPLOAD_BYTES = 20 * 1024 * 1024;

export const isAllowedAudioMime = (value: string): value is typeof AUDIO_MIME =>
  value.trim().toLowerCase() === AUDIO_MIME;

export const isWavBuffer = (buf: Buffer): boolean =>
  buf.length >= 12 &&
  buf.toString("ascii", 0, 4) === "RIFF" &&
  buf.toString("ascii", 8, 12) === "WAVE";

export const inspectWavPcm = (
  buf: Buffer,
):
  | {
      sampleRate: number;
      channels: number;
      bitsPerSample: number;
      durationMs: number;
    }
  | { error: string } => {
  if (!isWavBuffer(buf)) {
    return { error: "Recording must be WAV audio." };
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataBytes = 0;

  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start > buf.length) {
      return { error: "Invalid WAV file." };
    }
    if (id === "fmt ") {
      if (size < 16 || start + 16 > buf.length) {
        return { error: "Invalid WAV file." };
      }
      audioFormat = buf.readUInt16LE(start);
      channels = buf.readUInt16LE(start + 2);
      sampleRate = buf.readUInt32LE(start + 4);
      bitsPerSample = buf.readUInt16LE(start + 14);
    } else if (id === "data") {
      dataBytes = Math.min(size, Math.max(0, buf.length - start));
      break;
    }
    offset = start + size + (size % 2);
  }

  if (audioFormat !== 1) {
    return { error: "Use 16-bit PCM WAV audio." };
  }
  if (channels !== AUDIO_CHANNELS) {
    return { error: "Audio must be mono." };
  }
  if (sampleRate !== AUDIO_SAMPLE_RATE) {
    return { error: "Audio must be 16 kHz." };
  }
  if (bitsPerSample !== AUDIO_BITS) {
    return { error: "Use 16-bit PCM WAV audio." };
  }
  if (dataBytes <= 0) {
    return { error: "Invalid WAV file." };
  }

  const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
  const durationMs = Math.round((dataBytes / bytesPerSec) * 1000);
  if (durationMs > MAX_AUDIO_MS + 500) {
    return {
      error: `Recording must be ${MAX_AUDIO_SECONDS} seconds or less.`,
    };
  }

  return { sampleRate, channels, bitsPerSample, durationMs };
};

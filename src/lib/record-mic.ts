import {
  AUDIO_MIME,
  AUDIO_SAMPLE_RATE,
  MAX_AUDIO_MS,
} from "@/lib/audio-limits";

export type RecordedWav = {
  mime: typeof AUDIO_MIME;
  data: string;
  name: string;
  durationMs: number;
  blob: Blob;
  /** Peak sample amplitude 0–1. Very low usually means the wrong mic. */
  peak: number;
};

export type MicDevice = {
  deviceId: string;
  label: string;
};

export type MicSession = {
  stop: () => Promise<RecordedWav>;
  cancel: () => void;
  deviceId: string;
};

const pickRecorderMime = (): string => {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
};

const mixToMono = (buffer: AudioBuffer): Float32Array => {
  const length = buffer.length;
  const out = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  if (channels === 1) {
    out.set(buffer.getChannelData(0));
    return out;
  }
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i += 1) {
      out[i] += data[i] / channels;
    }
  }
  return out;
};

const resampleMono = (
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array => {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
};

const encodeWavPcm16 = (
  samples: Float32Array,
  sampleRate: number,
): ArrayBuffer => {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x2000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const decodeRecordedAudio = async (
  blob: Blob,
  AudioCtx: typeof AudioContext,
): Promise<AudioBuffer> => {
  const ctx = new AudioCtx();
  try {
    const raw = await blob.arrayBuffer();
    return await ctx.decodeAudioData(raw.slice(0));
  } finally {
    await ctx.close().catch(() => undefined);
  }
};

const toWavClip = async (blob: Blob): Promise<RecordedWav> => {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("AudioContext is not available");
  }

  const decoded = await decodeRecordedAudio(blob, AudioCtx);
  const mono = mixToMono(decoded);
  const resampled = resampleMono(mono, decoded.sampleRate, AUDIO_SAMPLE_RATE);
  const maxSamples = Math.floor((AUDIO_SAMPLE_RATE * MAX_AUDIO_MS) / 1000);
  const samples =
    resampled.length > maxSamples ? resampled.subarray(0, maxSamples) : resampled;
  const wav = encodeWavPcm16(samples, AUDIO_SAMPLE_RATE);
  const durationMs = Math.round((samples.length / AUDIO_SAMPLE_RATE) * 1000);
  const wavBlob = new Blob([wav], { type: AUDIO_MIME });
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }

  return {
    mime: AUDIO_MIME,
    data: arrayBufferToBase64(wav),
    name: "voice.wav",
    durationMs,
    blob: wavBlob,
    peak,
  };
};

export const isVirtualMicId = (deviceId: string): boolean => {
  const id = deviceId.trim().toLowerCase();
  return id === "default" || id === "communications";
};

export const listMicDevices = async (): Promise<MicDevice[]> => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const seen = new Set<string>();
  const hardware: MicDevice[] = [];
  const virtual: MicDevice[] = [];
  let unnamed = 0;
  for (const device of devices) {
    if (device.kind !== "audioinput" || !device.deviceId) continue;
    if (seen.has(device.deviceId)) continue;
    seen.add(device.deviceId);
    unnamed += 1;
    const raw = device.label.trim();
    const item: MicDevice = {
      deviceId: device.deviceId,
      label: raw || `Microphone ${unnamed}`,
    };
    if (isVirtualMicId(device.deviceId)) virtual.push(item);
    else hardware.push(item);
  }
  // Windows lists Default / Communications aliases — picking those always
  // follows the OS default. Prefer the real hardware entries.
  return hardware.length ? hardware : virtual;
};

const openMicStream = async (deviceId?: string): Promise<MediaStream> => {
  const media = navigator.mediaDevices;
  const extras: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  const want =
    deviceId && !isVirtualMicId(deviceId) ? deviceId.trim() : "";

  if (!want) {
    return media.getUserMedia({ audio: extras });
  }

  try {
    return await media.getUserMedia({
      audio: { ...extras, deviceId: { exact: want } },
    });
  } catch {
    // channelCount / processing flags can reject a valid mic; deviceId only.
    return await media.getUserMedia({
      audio: { deviceId: { exact: want } },
    });
  }
};

export const ensureMicPermission = async (deviceId?: string): Promise<void> => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone is not available");
  }
  const stream = await openMicStream(deviceId);
  for (const track of stream.getTracks()) track.stop();
};

export const startMicRecording = async (opts?: {
  onTick?: (elapsedMs: number, level: number) => void;
  onAutoStop?: (clip: RecordedWav) => void;
  maxMs?: number;
  deviceId?: string;
}): Promise<MicSession> => {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone is not available");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Microphone recording is not supported");
  }

  let stream = await openMicStream(opts?.deviceId);

  const requested =
    opts?.deviceId && !isVirtualMicId(opts.deviceId) ? opts.deviceId : "";
  const track = stream.getAudioTracks()[0];
  if (requested && track) {
    const actual = String(track.getSettings().deviceId || "");
    if (actual && actual !== requested) {
      try {
        await track.applyConstraints({ deviceId: { exact: requested } });
      } catch {
        for (const t of stream.getTracks()) t.stop();
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: requested } },
        });
      }
    }
  }

  const usedDeviceId =
    requested ||
    stream.getAudioTracks()[0]?.getSettings().deviceId ||
    opts?.deviceId ||
    "";

  const mimeType = pickRecorderMime();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  const maxMs = opts?.maxMs ?? MAX_AUDIO_MS;
  const startedAt = Date.now();
  let tickTimer: number | null = null;
  let maxTimer: number | null = null;
  let settled = false;
  let stopPromise: Promise<RecordedWav> | null = null;

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  let meterCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let meterBuf: Uint8Array | null = null;
  if (AudioCtx) {
    meterCtx = new AudioCtx();
    const source = meterCtx.createMediaStreamSource(stream);
    analyser = meterCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    meterBuf = new Uint8Array(analyser.fftSize);
  }

  const readLevel = (): number => {
    if (!analyser || !meterBuf) return 0;
    analyser.getByteTimeDomainData(meterBuf as Uint8Array<ArrayBuffer>);
    let peak = 0;
    for (let i = 0; i < meterBuf.length; i += 1) {
      const a = Math.abs(meterBuf[i] - 128) / 128;
      if (a > peak) peak = a;
    }
    return peak;
  };

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const stopTracks = () => {
    for (const track of stream.getTracks()) track.stop();
    if (tickTimer != null) window.clearInterval(tickTimer);
    if (maxTimer != null) window.clearTimeout(maxTimer);
    tickTimer = null;
    maxTimer = null;
    void meterCtx?.close().catch(() => undefined);
    meterCtx = null;
    analyser = null;
  };

  const finish = (): Promise<RecordedWav> => {
    if (stopPromise) return stopPromise;
    stopPromise = new Promise<RecordedWav>((resolve, reject) => {
      recorder.onstop = () => {
        stopTracks();
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        void toWavClip(blob).then(resolve, reject);
      };
      recorder.onerror = () => {
        stopTracks();
        reject(new Error("Microphone recording failed"));
      };
      if (recorder.state !== "inactive") recorder.stop();
      else {
        stopTracks();
        reject(new Error("Microphone recording failed"));
      }
    });
    return stopPromise;
  };

    const session: MicSession = {
      stop: () => {
        settled = true;
        return finish();
      },
      cancel: () => {
        settled = true;
        recorder.ondataavailable = null;
        recorder.onstop = () => undefined;
        stopTracks();
        if (recorder.state !== "inactive") recorder.stop();
      },
      deviceId: usedDeviceId,
    };

  void meterCtx?.resume().catch(() => undefined);
  recorder.start(200);
  tickTimer = window.setInterval(() => {
    opts?.onTick?.(Date.now() - startedAt, readLevel());
  }, 200);
  maxTimer = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    void finish().then(
      (clip) => opts?.onAutoStop?.(clip),
      () => undefined,
    );
  }, maxMs);

  return session;
};

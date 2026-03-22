import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.80;
const VIDEO_BITRATE = "1300k";

function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export type ProgressCallback = (status: string) => void;

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  onProgress?.("Loading video compressor...");
  ffmpeg = new FFmpeg();

  // Same-origin URLs can be used directly (no toBlobURL needed)
  const base = window.location.origin;
  await ffmpeg.load({
    coreURL: `${base}/ffmpeg/ffmpeg-core.js`,
    wasmURL: `${base}/ffmpeg/ffmpeg-core.wasm`,
    classWorkerURL: `${base}/ffmpeg/worker.js`,
  });

  return ffmpeg;
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    if (file.type === "image/jpeg" && file.size < 500_000) {
      bitmap.close();
      return file;
    }
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg",
  });

  console.log(`Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
  return compressed;
}

async function compressVideoNative(file: File, onProgress?: ProgressCallback): Promise<File> {
  onProgress?.("Compressing video...");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Failed to load video"));
  });

  // Scale down if needed
  const maxDim = 1080;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
  const outW = Math.round(video.videoWidth * scale);
  const outH = Math.round(video.videoHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  const canvasStream = canvas.captureStream(30);

  // Get audio directly from the video element's capture stream
  // video.muted silences speaker output but captureStream() still captures the audio track
  const videoStream = (video as any).captureStream() as MediaStream;
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...videoStream.getAudioTracks(),
  ]);

  // Pick best available codec
  const codecs = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  const mimeType = codecs.find((c) => MediaRecorder.isTypeSupported(c)) || "";

  const recorder = new MediaRecorder(stream, {
    mimeType: mimeType || undefined,
    videoBitsPerSecond: 1_300_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorder.onerror = () => reject(new Error("MediaRecorder error"));
  });

  recorder.start(1000); // collect data every second

  // Draw frames to canvas as video plays
  const duration = video.duration;
  video.currentTime = 0;
  await video.play();

  const drawFrame = () => {
    if (video.ended || video.paused) return;
    ctx.drawImage(video, 0, 0, outW, outH);
    const pct = Math.min(99, Math.round((video.currentTime / duration) * 100));
    onProgress?.(`Compressing video: ${pct}%`);
    requestAnimationFrame(drawFrame);
  };
  requestAnimationFrame(drawFrame);

  await new Promise<void>((resolve) => {
    video.onended = () => resolve();
  });

  // Draw one last frame to be safe
  ctx.drawImage(video, 0, 0, outW, outH);
  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());

  const blob = await done;
  URL.revokeObjectURL(url);

  if (blob.size === 0) {
    onProgress?.("Video compression failed, using original");
    return file;
  }

  const ext = recorder.mimeType.includes("mp4") ? ".mp4" : ".webm";
  const type = recorder.mimeType.includes("mp4") ? "video/mp4" : "video/webm";
  const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ext), { type });

  const origMB = (file.size / 1024 / 1024).toFixed(1);
  const compMB = (compressed.size / 1024 / 1024).toFixed(1);
  console.log(`Compressed video (native) ${file.name}: ${origMB}MB → ${compMB}MB`);
  onProgress?.(`Video compressed: ${origMB}MB → ${compMB}MB`);

  return compressed;
}

async function compressVideoFFmpeg(file: File, onProgress?: ProgressCallback): Promise<File> {
  const ff = await getFFmpeg(onProgress);

  let duration = 0;

  ff.on("log", ({ message }) => {
    console.log("[ffmpeg]", message);
    const durMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
    if (durMatch && durMatch[1] && durMatch[2] && durMatch[3]) {
      duration = parseInt(durMatch[1]) * 3600 + parseInt(durMatch[2]) * 60 + parseFloat(durMatch[3]);
    }
  });

  ff.on("progress", ({ progress, time }) => {
    const pct = Math.min(99, Math.round(progress * 100));
    if (pct > 0) {
      onProgress?.(`Compressing video: ${pct}%`);
    }
  });

  onProgress?.("Compressing video: reading file...");
  const inputExt = getExtension(file.name) || ".mp4";
  const inputName = `input${inputExt}`;

  await ff.writeFile(inputName, await fetchFile(file));

  onProgress?.("Compressing video: starting...");
  const exitCode = await ff.exec([
    "-i", inputName,
    "-c:v", "libvpx",
    "-b:v", VIDEO_BITRATE,
    "-crf", "30",
    "-c:a", "libopus",
    "-b:a", "96k",
    "-deadline", "realtime",
    "-cpu-used", "5",
    "-vf", `scale=-2:'min(1080,ih)'`,
    "-y",
    "output.webm",
  ]);

  console.log("[ffmpeg] exit code:", exitCode);

  if (exitCode !== 0) {
    console.warn("[ffmpeg] non-zero exit code, returning original");
    onProgress?.("Video compression failed, using original");
    await ff.deleteFile(inputName).catch(() => {});
    return file;
  }

  const outputData = await ff.readFile("output.webm");
  const outputBytes = outputData as Uint8Array;

  // Clean up virtual filesystem
  await ff.deleteFile(inputName).catch(() => {});
  await ff.deleteFile("output.webm").catch(() => {});

  if (outputBytes.byteLength === 0) {
    console.warn("[ffmpeg] produced empty output");
    onProgress?.("Video compression failed, using original");
    return file;
  }

  const blob = new Blob([outputBytes as BlobPart], { type: "video/webm" });
  const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".webm"), {
    type: "video/webm",
  });

  const origMB = (file.size / 1024 / 1024).toFixed(1);
  const compMB = (compressed.size / 1024 / 1024).toFixed(1);
  console.log(`Compressed video ${file.name}: ${origMB}MB → ${compMB}MB`);
  onProgress?.(`Video compressed: ${origMB}MB → ${compMB}MB`);

  return compressed;
}

export async function compressVideo(file: File, onProgress?: ProgressCallback): Promise<File> {
  try {
    if (isMobile()) {
      return await compressVideoNative(file, onProgress);
    }
    return await compressVideoFFmpeg(file, onProgress);
  } catch (err) {
    console.error("Video compression error:", err);
    onProgress?.("Video compression failed, using original");
    return file;
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : "";
}

export async function compressFiles(files: File[], onProgress?: ProgressCallback): Promise<File[]> {
  const results: File[] = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;
    if (file.type.startsWith("image/")) {
      onProgress?.(`Compressing image ${i + 1}/${total}...`);
      results.push(await compressImage(file));
    } else if (file.type.startsWith("video/")) {
      results.push(await compressVideo(file, onProgress));
    } else {
      results.push(file);
    }
  }
  return results;
}

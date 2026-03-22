import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.80;
const VIDEO_BITRATE = "1300k";

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

export async function compressVideo(file: File, onProgress?: ProgressCallback): Promise<File> {
  try {
    const ff = await getFFmpeg(onProgress);

    let duration = 0;

    ff.on("log", ({ message }) => {
      console.log("[ffmpeg]", message);
      const durMatch = message.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (durMatch) {
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

    const blob = new Blob([outputBytes], { type: "video/webm" });
    const compressed = new File([blob], file.name.replace(/\.[^.]+$/, ".webm"), {
      type: "video/webm",
    });

    const origMB = (file.size / 1024 / 1024).toFixed(1);
    const compMB = (compressed.size / 1024 / 1024).toFixed(1);
    console.log(`Compressed video ${file.name}: ${origMB}MB → ${compMB}MB`);
    onProgress?.(`Video compressed: ${origMB}MB → ${compMB}MB`);

    return compressed;
  } catch (err) {
    console.error("[ffmpeg] error:", err);
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

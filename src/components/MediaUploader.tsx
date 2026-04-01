import React, { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { compressImage, compressVideo, type ProgressCallback } from "../lib/compress";

export interface StagedFile {
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface MediaFile {
  id: number;
  original: File;
  previewUrl: string;
  compressed: File | null; // null = still compressing
  staged: StagedFile | null; // null = still uploading
  status: string; // "compressing", "uploading", progress text, "done", "upload failed"
}

interface Props {
  mediaFiles: MediaFile[];
  setMediaFiles: React.Dispatch<React.SetStateAction<MediaFile[]>>;
  postToken: string;
}

let nextId = 0;

async function compressSingle(file: File, onProgress: ProgressCallback): Promise<File> {
  if (file.type.startsWith("image/")) {
    return compressImage(file);
  }
  if (file.type.startsWith("video/")) {
    return compressVideo(file, onProgress);
  }
  return file;
}

export function MediaUploader({ mediaFiles, setMediaFiles, postToken }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const accepted = Array.from(newFiles).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      );
      if (accepted.length === 0) return;

      const entries: MediaFile[] = accepted.map((f) => ({
        id: nextId++,
        original: f,
        previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
        compressed: null,
        staged: null,
        status: "compressing",
      }));

      setMediaFiles((prev) => [...prev, ...entries]);

      for (const entry of entries) {
        const fileId = entry.id;
        compressSingle(entry.original, (status) => {
          setMediaFiles((prev) =>
            prev.map((mf) => (mf.id === fileId ? { ...mf, status } : mf))
          );
        })
          .then(async (compressed) => {
            setMediaFiles((prev) =>
              prev.map((mf) => (mf.id === fileId ? { ...mf, compressed, status: "uploading" } : mf))
            );

            try {
              const fd = new FormData();
              fd.append("file", compressed);
              const res = await fetch(`/api/stage-upload/${postToken}`, { method: "POST", body: fd });
              if (!res.ok) throw new Error("Upload failed");
              const staged: StagedFile = await res.json();
              setMediaFiles((prev) =>
                prev.map((mf) => (mf.id === fileId ? { ...mf, staged, status: "done" } : mf))
              );
            } catch {
              setMediaFiles((prev) =>
                prev.map((mf) => (mf.id === fileId ? { ...mf, status: "upload failed" } : mf))
              );
            }
          });
      }
    },
    [setMediaFiles, postToken]
  );

  const removeFile = (id: number) => {
    setMediaFiles((prev) => {
      const removed = prev.find((mf) => mf.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((mf) => mf.id !== id);
    });
  };

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="*/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-gray-500">
          Tap to add photos/videos, or drag & drop
        </p>
      </div>
      {mediaFiles.length > 0 && (
        <div className="mt-2 flex gap-2 flex-wrap">
          {mediaFiles.map((mf) => (
            <div key={mf.id} className="relative">
              {mf.original.type.startsWith("image/") ? (
                <img
                  src={mf.previewUrl}
                  className={`w-16 h-16 object-cover rounded ${mf.staged ? "" : "opacity-50"}`}
                  alt=""
                />
              ) : (
                <div
                  className={`w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500 ${mf.staged ? "" : "opacity-50"}`}
                >
                  Video
                </div>
              )}
              {!mf.staged && mf.status !== "upload failed" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {mf.status === "upload failed" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
                  <span className="text-white text-xs">!</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeFile(mf.id)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
      {mediaFiles.some((mf) => !mf.staged && mf.status !== "upload failed") && (
        <p className="mt-2 text-xs text-blue-500">
          {mediaFiles.find((mf) => !mf.staged && mf.status !== "compressing" && mf.status !== "uploading" && mf.status !== "upload failed")?.status ||
            (mediaFiles.some((mf) => mf.status === "uploading") ? "Uploading..." : "Compressing...")}
        </p>
      )}
    </div>
  );
}

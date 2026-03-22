import React, { useRef, useState, useCallback } from "react";
import { compressImage, compressVideo, type ProgressCallback } from "../lib/compress";

export interface MediaFile {
  id: number;
  original: File;
  compressed: File | null; // null = still compressing
  status: string; // "compressing", "done", or progress text
}

interface Props {
  mediaFiles: MediaFile[];
  setMediaFiles: React.Dispatch<React.SetStateAction<MediaFile[]>>;
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

export function MediaUploader({ mediaFiles, setMediaFiles }: Props) {
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
        compressed: null,
        status: "compressing",
      }));

      setMediaFiles((prev) => [...prev, ...entries]);

      // Kick off compression for each file
      for (const entry of entries) {
        const fileId = entry.id;
        compressSingle(entry.original, (status) => {
          setMediaFiles((prev) =>
            prev.map((mf) => (mf.id === fileId ? { ...mf, status } : mf))
          );
        }).then((compressed) => {
          setMediaFiles((prev) =>
            prev.map((mf) =>
              mf.id === fileId ? { ...mf, compressed, status: "done" } : mf
            )
          );
        });
      }
    },
    [setMediaFiles]
  );

  const removeFile = (id: number) => {
    setMediaFiles((prev) => prev.filter((mf) => mf.id !== id));
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
                  src={URL.createObjectURL(mf.original)}
                  className={`w-16 h-16 object-cover rounded ${mf.compressed ? "" : "opacity-50"}`}
                  alt=""
                />
              ) : (
                <div
                  className={`w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500 ${mf.compressed ? "" : "opacity-50"}`}
                >
                  Video
                </div>
              )}
              {!mf.compressed && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
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
      {mediaFiles.some((mf) => !mf.compressed) && (
        <p className="mt-2 text-xs text-blue-500">
          {mediaFiles.find((mf) => !mf.compressed && mf.status !== "compressing")?.status ||
            "Compressing..."}
        </p>
      )}
    </div>
  );
}

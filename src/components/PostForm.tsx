import React, { useState } from "react";
import { MediaUploader, type MediaFile } from "./MediaUploader";

interface Props {
  postToken: string;
  userName: string;
  onPostCreated: () => void;
}

export function PostForm({ postToken, userName, onPostCreated }: Props) {
  const [body, setBody] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const compressing = mediaFiles.some((mf) => !mf.compressed);
  const hasContent = body.trim() || mediaFiles.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasContent || compressing) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("body", body.trim());
      for (const mf of mediaFiles) {
        if (mf.compressed) {
          formData.append("files", mf.compressed);
        }
      }

      const res = await fetch(`/api/posts/${postToken}`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setBody("");
        setMediaFiles([]);
        onPostCreated();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <p className="text-sm text-gray-500 mb-2">
        Posting as <span className="font-medium text-gray-700">{userName}</span>
      </p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What's happening? (Markdown supported)"
        className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
        rows={3}
      />
      <div className="mt-2">
        <MediaUploader mediaFiles={mediaFiles} setMediaFiles={setMediaFiles} />
      </div>
      <button
        type="submit"
        disabled={submitting || !hasContent || compressing}
        className="mt-3 w-full bg-blue-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? "Posting..." : compressing ? "Compressing media..." : "Post"}
      </button>
    </form>
  );
}

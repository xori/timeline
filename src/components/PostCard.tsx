import React, { useState } from "react";
import { UserBadge } from "./UserBadge";
import { MediaGallery } from "./MediaGallery";
import { MediaUploader, type MediaFile } from "./MediaUploader";
import { renderMarkdown } from "../lib/markdown";

interface MediaItem {
  id: number;
  filename: string;
  original_name: string;
  mime_type: string;
}

interface Post {
  id: number;
  body: string;
  created_at: string;
  user_name: string;
  avatar_color: string;
  media: MediaItem[];
}

export function PostCard({
  post,
  canDelete,
  onDelete,
  onEdit,
  postToken,
  shareToken,
}: {
  post: Post;
  canDelete?: boolean;
  onDelete?: (id: number) => void;
  onEdit?: (updatedPost: any) => void;
  postToken?: string;
  shareToken?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [existingMedia, setExistingMedia] = useState<MediaItem[]>(post.media || []);
  const [removedMediaIds, setRemovedMediaIds] = useState<number[]>([]);
  const [newMediaFiles, setNewMediaFiles] = useState<MediaFile[]>([]);
  const [saving, setSaving] = useState(false);

  const html = renderMarkdown(post.body);
  const date = new Date(post.created_at + "Z");
  const timeStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const handleShare = async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/t/${shareToken}/post/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {}
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revokeMediaPreviews = (files: MediaFile[]) => {
    files.forEach((mf) => { if (mf.previewUrl) URL.revokeObjectURL(mf.previewUrl); });
  };

  const startEdit = () => {
    setEditBody(post.body);
    setExistingMedia(post.media || []);
    setRemovedMediaIds([]);
    revokeMediaPreviews(newMediaFiles);
    setNewMediaFiles([]);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    revokeMediaPreviews(newMediaFiles);
    setIsEditing(false);
  };

  const removeExistingMedia = (id: number) => {
    setExistingMedia((prev) => prev.filter((m) => m.id !== id));
    setRemovedMediaIds((prev) => [...prev, id]);
  };

  const handleSave = async () => {
    if (!postToken) return;
    const pending = newMediaFiles.some((mf) => !mf.staged && mf.status !== "upload failed");
    if (pending) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("body", editBody.trim());
      for (const id of removedMediaIds) {
        formData.append("remove_media", String(id));
      }
      formData.append(
        "staged_files",
        JSON.stringify(newMediaFiles.filter((mf) => mf.staged).map((mf) => mf.staged))
      );

      const res = await fetch(`/api/posts/${postToken}/${post.id}`, {
        method: "PATCH",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        revokeMediaPreviews(newMediaFiles);
        onEdit?.({ ...post, body: data.post.body, media: data.media });
        setIsEditing(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const pending = newMediaFiles.some((mf) => !mf.staged && mf.status !== "upload failed");
  const hasContent = editBody.trim() || existingMedia.length > 0 || newMediaFiles.some((mf) => mf.staged);
  const canSave = hasContent && !pending && !saving;

  return (
    <div
      id={`post-${post.id}`}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 transition-all duration-500"
      style={{ borderLeftWidth: "4px", borderLeftColor: post.avatar_color }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <UserBadge name={post.user_name} color={post.avatar_color} />
          <span className="text-xs text-gray-400">{timeStr}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && shareToken && (
            <button
              onClick={handleShare}
              className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
            >
              {copied ? "Copied!" : "Share"}
            </button>
          )}
          {!isEditing && postToken && onEdit && (
            <button
              onClick={startEdit}
              className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
            >
              Edit
            </button>
          )}
          {!isEditing && canDelete && onDelete && (
            <button
              onClick={() => onDelete(post.id)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"
            rows={3}
          />
          {existingMedia.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {existingMedia.map((m) => (
                <div key={m.id} className="relative">
                  {m.mime_type.startsWith("image/") ? (
                    <img
                      src={`/uploads/${m.filename}`}
                      className="w-16 h-16 object-cover rounded"
                      alt=""
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">
                      Video
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeExistingMedia(m.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2">
            <MediaUploader mediaFiles={newMediaFiles} setMediaFiles={setNewMediaFiles} postToken={postToken!} />
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 bg-blue-500 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : pending ? "Uploading..." : "Save"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="flex-1 border border-gray-300 text-gray-600 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="prose prose-sm max-w-none text-gray-700"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <MediaGallery media={post.media || []} />
        </>
      )}
    </div>
  );
}

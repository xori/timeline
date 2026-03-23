import React, { useState } from "react";
import { UserBadge } from "./UserBadge";
import { MediaGallery } from "./MediaGallery";
import { renderMarkdown } from "../lib/markdown";

interface Post {
  id: number;
  body: string;
  created_at: string;
  user_name: string;
  avatar_color: string;
  media: any[];
}

export function PostCard({
  post,
  canDelete,
  onDelete,
  shareToken,
}: {
  post: Post;
  canDelete?: boolean;
  onDelete?: (id: number) => void;
  shareToken?: string;
}) {
  const [copied, setCopied] = useState(false);
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
      // Fallback for non-HTTPS contexts
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
          {shareToken && (
            <button
              onClick={handleShare}
              className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
            >
              {copied ? "Copied!" : "Share"}
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={() => onDelete(post.id)}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <div
        className="prose prose-sm max-w-none text-gray-700"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <MediaGallery media={post.media || []} />
    </div>
  );
}

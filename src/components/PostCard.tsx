import React from "react";
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
}: {
  post: Post;
  canDelete?: boolean;
  onDelete?: (id: number) => void;
}) {
  const html = renderMarkdown(post.body);
  const date = new Date(post.created_at + "Z");
  const timeStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4"
      style={{ borderLeftWidth: "4px", borderLeftColor: post.avatar_color }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <UserBadge name={post.user_name} color={post.avatar_color} />
          <span className="text-xs text-gray-400">{timeStr}</span>
        </div>
        {canDelete && onDelete && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Delete
          </button>
        )}
      </div>
      <div
        className="prose prose-sm max-w-none text-gray-700"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <MediaGallery media={post.media || []} />
    </div>
  );
}

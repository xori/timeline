import React, { useEffect, useState, useCallback } from "react";
import { PostCard } from "./PostCard";
import { PostForm } from "./PostForm";

interface Props {
  viewToken?: string;
  postToken?: string;
}

export function Timeline({ viewToken, postToken }: Props) {
  const [posts, setPosts] = useState<any[]>([]);
  const [timelineName, setTimelineName] = useState("");
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      if (postToken) {
        const userRes = await fetch(`/api/user/${postToken}`);
        if (!userRes.ok) { setError("Invalid link"); setLoading(false); return; }
        const userData = await userRes.json();
        setUser(userData.user);
        setTimelineName(userData.user.timeline_name);

        const timelineRes = await fetch(`/api/timeline/${userData.user.view_token}`);
        if (!timelineRes.ok) { setError("Timeline not found"); setLoading(false); return; }
        const timelineData = await timelineRes.json();
        setPosts(timelineData.posts);
      } else if (viewToken) {
        const res = await fetch(`/api/timeline/${viewToken}`);
        if (!res.ok) { setError("Invalid link"); setLoading(false); return; }
        const data = await res.json();
        setPosts(data.posts);
        setTimelineName(data.timeline.name);
      }
    } catch {
      setError("Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [viewToken, postToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (postId: number) => {
    if (!postToken) return;
    const res = await fetch(`/api/posts/${postToken}/${postId}`, { method: "DELETE" });
    if (res.ok) fetchData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-800 text-center">{timelineName}</h1>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6">
        {postToken && user && (
          <PostForm
            postToken={postToken}
            userName={user.name}
            onPostCreated={fetchData}
          />
        )}
        {posts.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No posts yet.</p>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              canDelete={!!user && post.user_id === user.id}
              onDelete={handleDelete}
            />
          ))
        )}
      </main>
    </div>
  );
}

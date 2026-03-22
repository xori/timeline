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
  const [pushSupported, setPushSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [effectiveViewToken, setEffectiveViewToken] = useState(viewToken || "");

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

  // Set effectiveViewToken from user data when using postToken route
  useEffect(() => {
    if (user?.view_token) setEffectiveViewToken(user.view_token);
  }, [user]);

  // Check push notification support and existing subscription
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushSupported(true);
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setIsSubscribed(true);
      });
    });
  }, []);

  const handleSubscribe = async () => {
    if (!effectiveViewToken) return;
    setPushLoading(true);
    try {
      const res = await fetch("/api/vapid-public-key");
      const { publicKey } = await res.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });
      await fetch(`/api/push/subscribe/${effectiveViewToken}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      setIsSubscribed(true);
    } catch (err) {
      console.error("Failed to subscribe:", err);
    } finally {
      setPushLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!effectiveViewToken) return;
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/unsubscribe/${effectiveViewToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Failed to unsubscribe:", err);
    } finally {
      setPushLoading(false);
    }
  };

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
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center">
        <div className="w-24">
          {postToken && effectiveViewToken && (
            <a
              href={`/t/${effectiveViewToken}`}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Public link
            </a>
          )}
        </div>
        <h1 className="text-lg font-semibold text-gray-800 text-center flex-1">{timelineName}</h1>
        <div className="w-24 flex justify-end">
          {pushSupported && (
            <button
              onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
              disabled={pushLoading}
              className={`text-sm px-3 py-1 rounded-full disabled:opacity-50 ${isSubscribed ? "border border-gray-300 text-gray-600 hover:bg-gray-100" : "bg-green-500 text-white hover:bg-green-600"}`}
            >
              {pushLoading ? "..." : isSubscribed ? "Unsubscribe" : "Notify me"}
            </button>
          )}
        </div>
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

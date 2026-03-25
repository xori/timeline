import React, { useEffect, useState, useCallback, useRef } from "react";
import { PostCard } from "./PostCard";
import { PostForm } from "./PostForm";

interface Props {
  viewToken?: string;
  postToken?: string;
  focusPostId?: number;
}

export function Timeline({ viewToken, postToken, focusPostId }: Props) {
  const [posts, setPosts] = useState<any[]>([]);
  const [timelineName, setTimelineName] = useState("");
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [effectiveViewToken, setEffectiveViewToken] = useState(viewToken || "");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const resolveViewToken = useCallback(async (): Promise<string | null> => {
    if (postToken) {
      const userRes = await fetch(`/api/user/${postToken}`);
      if (!userRes.ok) {
        setError("Invalid link");
        setLoading(false);
        return null;
      }
      const userData = await userRes.json();
      setUser(userData.user);
      setTimelineName(userData.user.timeline_name);
      return userData.user.view_token;
    } else if (viewToken) {
      return viewToken;
    }
    return null;
  }, [viewToken, postToken]);

  const fetchPage = useCallback(async (vt: string, cursor?: string) => {
    const params = new URLSearchParams({ limit: "20" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`/api/timeline/${vt}?${params}`);
    if (!res.ok) throw new Error("Timeline not found");
    return res.json();
  }, []);

  // Initial load
  const fetchData = useCallback(async () => {
    try {
      const vt = await resolveViewToken();
      if (!vt) return;

      let data;
      if (focusPostId) {
        // Fetch all posts from newest down to the focused post
        const params = new URLSearchParams({ until_post: String(focusPostId) });
        const res = await fetch(`/api/timeline/${vt}?${params}`);
        if (!res.ok) throw new Error("Timeline not found");
        data = await res.json();
        // If the post wasn't found (empty result), fall back to normal load
        if (data.posts.length === 0) {
          data = await fetchPage(vt);
        }
      } else {
        data = await fetchPage(vt);
      }
      setPosts(data.posts);
      setNextCursor(data.nextCursor);
      if (!postToken) setTimelineName(data.timeline.name);
    } catch {
      setError("Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [resolveViewToken, fetchPage, postToken, focusPostId]);

  // Load more pages
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const vt = effectiveViewToken || viewToken;
    if (!vt) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(vt, nextCursor);
      setPosts((prev) => [...prev, ...data.posts]);
      setNextCursor(data.nextCursor);
    } catch {
      // silently fail, user can scroll again
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, effectiveViewToken, viewToken, fetchPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Scroll to focused post after load
  useEffect(() => {
    if (!focusPostId || loading || posts.length === 0) return;
    const el = document.getElementById(`post-${focusPostId}`);
    if (el) {
      // Small delay to ensure layout is settled
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-blue-400", "ring-offset-2");
        setTimeout(
          () => el.classList.remove("ring-2", "ring-blue-400", "ring-offset-2"),
          3000,
        );
      });
    }
  }, [focusPostId, loading, posts]);

  // Set effectiveViewToken from user data when using postToken route
  useEffect(() => {
    if (user?.view_token) setEffectiveViewToken(user.view_token);
  }, [user]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // Refresh after posting — reload from scratch to get the new post at the top
  const handlePostCreated = useCallback(async () => {
    const vt = effectiveViewToken || viewToken;
    if (!vt) return;
    const data = await fetchPage(vt);
    setPosts(data.posts);
    setNextCursor(data.nextCursor);
  }, [effectiveViewToken, viewToken, fetchPage]);

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
    const res = await fetch(`/api/posts/${postToken}/${postId}`, {
      method: "DELETE",
    });
    if (res.ok) setPosts((prev) => prev.filter((p) => p.id !== postId));
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
        <h1
          className="text-lg font-semibold text-gray-800 text-center flex-1 cursor-pointer"
          onClick={() => window.location.reload()}
        >
          {timelineName}
        </h1>
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
            onPostCreated={handlePostCreated}
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
              shareToken={effectiveViewToken || viewToken}
            />
          ))
        )}
        <div ref={sentinelRef} className="h-1" />
        {loadingMore && (
          <p className="text-center text-gray-400 py-4">Loading more...</p>
        )}
      </main>
    </div>
  );
}

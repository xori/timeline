import { serve } from "bun";
import { join, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import webpush from "web-push";
import sharp from "sharp";
import {
  getTimelineByViewToken,
  getUserByPostToken,
  getTimelinePosts,
  getPostMedia,
  createPost,
  createMedia,
  deletePost,
  getPost,
  getPostWithUser,
  getPostsUntilPost,
  getAllTimelinesWithUsers,
  getOrCreateVapidKeys,
  addPushSubscription,
  removePushSubscription,
  getSubscriptionsForTimeline,
  updatePost,
  deleteMedia,
} from "./db";

const isProduction = process.env.NODE_ENV === "production";
const DIST_DIR = join(import.meta.dir, "..", "dist");

// In development, use Bun's HTML import for HMR/bundling
// In production, serve prebuilt files from dist/
const index = isProduction ? undefined : (await import("./index.html")).default;

const vapidKeys = getOrCreateVapidKeys();
webpush.setVapidDetails(
  "mailto:evan@verworn.ca",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

const UPLOADS_DIR = join(import.meta.dir, "..", "data", "uploads");
const THUMBS_DIR = join(import.meta.dir, "..", "data", "thumbs");
mkdirSync(UPLOADS_DIR, { recursive: true });
mkdirSync(THUMBS_DIR, { recursive: true });

const THUMB_WIDTH = 200;
const thumbLocks = new Map<string, Promise<string>>();

async function getOrCreateThumb(filename: string): Promise<string | null> {
  const thumbPath = join(THUMBS_DIR, filename);
  if (await Bun.file(thumbPath).exists()) return thumbPath;

  const origPath = join(UPLOADS_DIR, filename);
  if (!(await Bun.file(origPath).exists())) return null;

  // Deduplicate concurrent requests for the same thumbnail
  if (thumbLocks.has(filename)) {
    await thumbLocks.get(filename);
    return thumbPath;
  }

  const promise = sharp(origPath)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 60 })
    .toFile(thumbPath)
    .then(() => thumbPath);

  thumbLocks.set(filename, promise);
  try {
    await promise;
  } finally {
    thumbLocks.delete(filename);
  }
  return thumbPath;
}

function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const FFMPEG_CORE_DIR = join(
  import.meta.dir,
  "..",
  "node_modules",
  "@ffmpeg",
  "core",
  "dist",
  "esm",
);
const FFMPEG_ESM_DIR = join(
  import.meta.dir,
  "..",
  "node_modules",
  "@ffmpeg",
  "ffmpeg",
  "dist",
  "esm",
);

const server = serve({
  port: process.env.PORT || 3000,
  hostname: "0.0.0.0",
  maxRequestBodySize: 500 * 1024 * 1024, // 500MB
  routes: {
    "/api/timeline/:viewToken": {
      async GET(req) {
        const timeline = getTimelineByViewToken(req.params.viewToken);
        if (!timeline) return new Response("Not found", { status: 404 });
        const url = new URL(req.url);

        // If until_post is set, fetch all posts from newest down to that post
        const untilPost = url.searchParams.get("until_post");
        if (untilPost) {
          const posts = getPostsUntilPost(timeline.id, Number(untilPost));
          if (!posts) return Response.json({ timeline, posts: [], nextCursor: null });
          const postsWithMedia = posts.map((p) => ({ ...p, media: getPostMedia(p.id) }));
          const lastPost = posts[posts.length - 1];
          const nextCursor = `${lastPost.created_at}|${lastPost.id}`;
          return Response.json({ timeline, posts: postsWithMedia, nextCursor });
        }

        const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
        const cursor = url.searchParams.get("cursor") || undefined;
        const posts = getTimelinePosts(timeline.id, limit, cursor);
        const postsWithMedia = posts.map((p) => ({
          ...p,
          media: getPostMedia(p.id),
        }));
        const nextCursor = posts.length === limit
          ? `${posts[posts.length - 1].created_at}|${posts[posts.length - 1].id}`
          : null;
        return Response.json({ timeline, posts: postsWithMedia, nextCursor });
      },
    },

    "/api/user/:postToken": {
      async GET(req) {
        const user = getUserByPostToken(req.params.postToken);
        if (!user) return new Response("Not found", { status: 404 });
        return Response.json({ user });
      },
    },

    "/api/stage-upload/:postToken": {
      async POST(req) {
        const user = getUserByPostToken(req.params.postToken);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const formData = await req.formData();
        const file = formData.get("file") as File;
        if (!file || file.size === 0) return new Response("No file", { status: 400 });

        const ext = file.name.split(".").pop() || "bin";
        const filename = `${crypto.randomUUID()}.${ext}`;
        await Bun.write(join(UPLOADS_DIR, filename), file);

        return Response.json({
          filename,
          original_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        });
      },
    },

    "/api/posts/:postToken": {
      async POST(req) {
        const user = getUserByPostToken(req.params.postToken);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const formData = await req.formData();
        const body = (formData.get("body") as string) || "";
        const stagedFiles = JSON.parse((formData.get("staged_files") as string) || "[]") as {
          filename: string; original_name: string; mime_type: string; size_bytes: number;
        }[];

        if (!body.trim() && stagedFiles.length === 0) {
          return new Response("Empty post", { status: 400 });
        }

        const post = createPost(user.id, user.timeline_id, body);

        for (const sf of stagedFiles) {
          createMedia(post.id, sf.filename, sf.original_name, sf.mime_type, sf.size_bytes);
        }

        // Fire-and-forget push notifications
        const subs = getSubscriptionsForTimeline(user.timeline_id);
        if (subs.length > 0) {
          const notifBody = body.trim()
            ? `${user.name}: ${body.slice(0, 100)}${body.length > 100 ? "..." : ""}`
            : `${user.name} shared ${stagedFiles.length > 1 ? `${stagedFiles.length} files` : stagedFiles[0]?.mime_type?.startsWith("video/") ? "a video" : "a photo"}`;
          const payload = JSON.stringify({
            title: user.timeline_name,
            body: notifBody,
            tag: `timeline-${user.timeline_id}`,
            url: `/t/${user.view_token}`,
          });
          Promise.allSettled(
            subs.map((sub) =>
              webpush
                .sendNotification(
                  {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.key_p256dh, auth: sub.key_auth },
                  },
                  payload,
                )
                .catch((err: any) => {
                  if (err.statusCode === 410 || err.statusCode === 404) {
                    removePushSubscription(user.timeline_id, sub.endpoint);
                  }
                }),
            ),
          );
        }

        return Response.json({ post, media: getPostMedia(post.id) });
      },
    },

    "/api/posts/:postToken/:postId": {
      async PATCH(req) {
        const user = getUserByPostToken(req.params.postToken);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const postId = Number(req.params.postId);
        const post = getPost(postId);
        if (!post || post.user_id !== user.id) {
          return new Response("Forbidden", { status: 403 });
        }

        const formData = await req.formData();
        const body = (formData.get("body") as string) || "";
        const removeMediaIds = formData.getAll("remove_media").map(Number).filter(Boolean);
        const stagedFiles = JSON.parse((formData.get("staged_files") as string) || "[]") as {
          filename: string; original_name: string; mime_type: string; size_bytes: number;
        }[];

        // Validate: must have body or remaining/new media
        const existingMediaCount = getPostMedia(postId).length;
        const remainingCount = existingMediaCount - removeMediaIds.length + stagedFiles.length;
        if (!body.trim() && remainingCount <= 0) {
          return new Response("Empty post", { status: 400 });
        }

        // Delete removed media files from disk and DB
        for (const mediaId of removeMediaIds) {
          const media = deleteMedia(mediaId, postId);
          if (media) {
            try {
              const path = join(UPLOADS_DIR, media.filename);
              const fs = await import("node:fs/promises");
              await fs.unlink(path).catch(() => {});
            } catch {}
          }
        }

        // Link staged files to this post
        for (const sf of stagedFiles) {
          createMedia(postId, sf.filename, sf.original_name, sf.mime_type, sf.size_bytes);
        }

        updatePost(postId, user.id, body);
        return Response.json({ post: getPost(postId), media: getPostMedia(postId) });
      },

      async DELETE(req) {
        const user = getUserByPostToken(req.params.postToken);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const postId = Number(req.params.postId);
        const post = getPost(postId);
        if (!post || post.user_id !== user.id) {
          return new Response("Forbidden", { status: 403 });
        }

        const { deleted, mediaFiles } = deletePost(postId, user.id);
        if (deleted) {
          for (const m of mediaFiles) {
            try {
              const path = join(UPLOADS_DIR, (m as any).filename);
              (await Bun.file(path).exists()) && Bun.write(path, "");
              const fs = await import("node:fs/promises");
              await fs.unlink(path).catch(() => {});
            } catch {}
          }
        }
        return Response.json({ deleted });
      },
    },

    "/ffmpeg/*": async (req) => {
      const url = new URL(req.url);
      const filename = url.pathname.replace("/ffmpeg/", "");
      const cacheHeaders = { "Cache-Control": "public, max-age=31536000, immutable" };
      if (filename === "ffmpeg-core.wasm") {
        return new Response(Bun.file(join(FFMPEG_CORE_DIR, filename)), {
          headers: { "Content-Type": "application/wasm", ...cacheHeaders },
        });
      }
      if (filename === "ffmpeg-core.js") {
        return new Response(Bun.file(join(FFMPEG_CORE_DIR, filename)), {
          headers: { "Content-Type": "text/javascript", ...cacheHeaders },
        });
      }
      // Serve ESM modules (worker.js, errors.js, const.js, etc.)
      if (filename.endsWith(".js")) {
        const file = Bun.file(join(FFMPEG_ESM_DIR, filename));
        if (await file.exists()) {
          return new Response(file, {
            headers: { "Content-Type": "text/javascript", ...cacheHeaders },
          });
        }
      }
      return new Response("Not found", { status: 404 });
    },

    "/thumbs/*": async (req) => {
      const url = new URL(req.url);
      const filename = url.pathname.replace("/thumbs/", "");
      const thumbPath = await getOrCreateThumb(filename);
      if (thumbPath) {
        return new Response(Bun.file(thumbPath), {
          headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        });
      }
      return new Response("Not found", { status: 404 });
    },

    "/uploads/*": async (req) => {
      const url = new URL(req.url);
      const filePath = join(UPLOADS_DIR, url.pathname.replace("/uploads/", ""));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        });
      }
      return new Response("Not found", { status: 404 });
    },

    "/api/vapid-public-key": {
      GET() {
        return Response.json({ publicKey: vapidKeys.publicKey });
      },
    },

    "/api/push/subscribe/:viewToken": {
      async POST(req) {
        const timeline = getTimelineByViewToken(req.params.viewToken);
        if (!timeline) return new Response("Not found", { status: 404 });
        const { subscription } = await req.json();
        addPushSubscription(
          timeline.id,
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
        );
        return Response.json({ ok: true });
      },
    },

    "/api/push/unsubscribe/:viewToken": {
      async POST(req) {
        const timeline = getTimelineByViewToken(req.params.viewToken);
        if (!timeline) return new Response("Not found", { status: 404 });
        const { endpoint } = await req.json();
        removePushSubscription(timeline.id, endpoint);
        return Response.json({ ok: true });
      },
    },

    // OG meta tags for post link previews
    "/t/:viewToken/post/:postId": async (req) => {
      // In dev, fetch from our own server to get Bun-bundled HTML (the /* catch-all).
      // In prod, read the pre-built dist file directly.
      let html: string;
      if (isProduction) {
        html = await Bun.file(join(DIST_DIR, "index.html")).text();
      } else {
        const res = await fetch(new URL("/", req.url));
        html = await res.text();
      }

      const timeline = getTimelineByViewToken(req.params.viewToken);
      if (!timeline) return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      const post = getPostWithUser(Number(req.params.postId));
      if (!post || post.timeline_id !== timeline.id) return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });

      const media = getPostMedia(post.id);
      const firstImage = media.find((m: any) => m.mime_type?.startsWith("image/"));
      const origin = new URL(req.url).origin;

      const description = post.body?.trim()
        ? `${post.user_name}: ${post.body.slice(0, 200)}`
        : `${post.user_name} shared ${media.length > 1 ? `${media.length} files` : firstImage ? "a photo" : "a video"}`;

      const ogTags = [
        `<meta property="og:title" content="${escapeAttr(timeline.name)}" />`,
        `<meta property="og:description" content="${escapeAttr(description)}" />`,
        `<meta property="og:url" content="${origin}/t/${timeline.view_token}/post/${post.id}" />`,
        `<meta property="og:type" content="article" />`,
        firstImage && `<meta property="og:image" content="${origin}/uploads/${firstImage.filename}" />`,
        `<meta name="twitter:card" content="${firstImage ? "summary_large_image" : "summary"}" />`,
      ].filter(Boolean).join("\n    ");

      const injected = html.replace("</head>", `    ${ogTags}\n  </head>`);

      return new Response(injected, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },

    "/sw.js": async () => {
      return new Response(Bun.file(join(import.meta.dir, "sw.js")), {
        headers: {
          "Content-Type": "application/javascript",
          "Service-Worker-Allowed": "/",
        },
      });
    },

    // SPA fallback: serve index.html for all non-API routes
    "/*": isProduction
      ? async (req: Request) => {
          const url = new URL(req.url);
          const requested = resolve(DIST_DIR, url.pathname.slice(1));
          // Serve static dist assets if they exist, otherwise SPA fallback
          if (requested.startsWith(DIST_DIR)) {
            const file = Bun.file(requested);
            if (await file.exists()) return new Response(file);
          }
          return new Response(Bun.file(join(DIST_DIR, "index.html")));
        }
      : index!,
  },

  development: !isProduction && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);

const timelines = getAllTimelinesWithUsers();
if (timelines.length === 0) {
  console.log(
    "\nNo timelines found. Run: bun src/seed.ts <timeline-name> <user1> [user2] ...",
  );
} else {
  for (const t of timelines) {
    console.log(`\nTimeline: ${t.name}`);
    console.log(`  View: ${server.url}t/${t.view_token}`);
    for (const u of t.users) {
      console.log(`  ${u.name} post URL: ${server.url}p/${u.post_token}`);
    }
  }
}

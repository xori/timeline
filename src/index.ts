import { serve } from "bun";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import index from "./index.html";
import {
  getTimelineByViewToken,
  getUserByPostToken,
  getTimelinePosts,
  getPostMedia,
  createPost,
  createMedia,
  deletePost,
  getPost,
  getAllTimelinesWithUsers,
} from "./db";

const UPLOADS_DIR = join(import.meta.dir, "..", "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

const FFMPEG_CORE_DIR = join(import.meta.dir, "..", "node_modules", "@ffmpeg", "core", "dist", "esm");
const FFMPEG_ESM_DIR = join(import.meta.dir, "..", "node_modules", "@ffmpeg", "ffmpeg", "dist", "esm");

const server = serve({
  maxRequestBodySize: 500 * 1024 * 1024, // 500MB
  routes: {
    "/api/timeline/:viewToken": {
      async GET(req) {
        const timeline = getTimelineByViewToken(req.params.viewToken);
        if (!timeline) return new Response("Not found", { status: 404 });
        const posts = getTimelinePosts(timeline.id);
        const postsWithMedia = posts.map((p) => ({
          ...p,
          media: getPostMedia(p.id),
        }));
        return Response.json({ timeline, posts: postsWithMedia });
      },
    },

    "/api/user/:postToken": {
      async GET(req) {
        const user = getUserByPostToken(req.params.postToken);
        if (!user) return new Response("Not found", { status: 404 });
        return Response.json({ user });
      },
    },

    "/api/posts/:postToken": {
      async POST(req) {
        const user = getUserByPostToken(req.params.postToken);
        if (!user) return new Response("Unauthorized", { status: 401 });

        const formData = await req.formData();
        const body = formData.get("body") as string || "";
        const files = formData.getAll("files") as File[];

        if (!body.trim() && files.length === 0) {
          return new Response("Empty post", { status: 400 });
        }

        const post = createPost(user.id, user.timeline_id, body);

        for (const file of files) {
          if (file.size === 0) continue;
          const ext = file.name.split(".").pop() || "bin";
          const filename = `${crypto.randomUUID()}.${ext}`;
          await Bun.write(join(UPLOADS_DIR, filename), file);
          createMedia(post.id, filename, file.name, file.type, file.size);
        }

        return Response.json({ post, media: getPostMedia(post.id) });
      },
    },

    "/api/posts/:postToken/:postId": {
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
              await Bun.file(path).exists() && Bun.write(path, "");
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
      if (filename === "ffmpeg-core.wasm") {
        return new Response(Bun.file(join(FFMPEG_CORE_DIR, filename)), {
          headers: { "Content-Type": "application/wasm" },
        });
      }
      if (filename === "ffmpeg-core.js") {
        return new Response(Bun.file(join(FFMPEG_CORE_DIR, filename)), {
          headers: { "Content-Type": "text/javascript" },
        });
      }
      // Serve ESM modules (worker.js, errors.js, const.js, etc.)
      if (filename.endsWith(".js")) {
        const file = Bun.file(join(FFMPEG_ESM_DIR, filename));
        if (await file.exists()) {
          return new Response(file, { headers: { "Content-Type": "text/javascript" } });
        }
      }
      return new Response("Not found", { status: 404 });
    },

    "/uploads/*": async (req) => {
      const url = new URL(req.url);
      const filePath = join(UPLOADS_DIR, url.pathname.replace("/uploads/", ""));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    },

    // SPA fallback: serve index.html for all non-API routes
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);

const timelines = getAllTimelinesWithUsers();
if (timelines.length === 0) {
  console.log("\nNo timelines found. Run: bun src/seed.ts <timeline-name> <user1> [user2] ...");
} else {
  for (const t of timelines) {
    console.log(`\nTimeline: ${t.name}`);
    console.log(`  View: ${server.url}t/${t.view_token}`);
    for (const u of t.users) {
      console.log(`  ${u.name} post URL: ${server.url}p/${u.post_token}`);
    }
  }
}

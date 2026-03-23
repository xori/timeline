import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(import.meta.dir, "..", "data");
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "timeline.db"));

db.run("PRAGMA journal_mode = WAL");
db.run("PRAGMA foreign_keys = ON");

db.run(`CREATE TABLE IF NOT EXISTS timelines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  view_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timeline_id INTEGER NOT NULL REFERENCES timelines(id),
  name TEXT NOT NULL,
  post_token TEXT NOT NULL UNIQUE,
  avatar_color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.run(`CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  timeline_id INTEGER NOT NULL REFERENCES timelines(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.run(`CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.run(`CREATE TABLE IF NOT EXISTS vapid_keys (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);

db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timeline_id INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  key_p256dh TEXT NOT NULL,
  key_auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(timeline_id, endpoint)
)`);

// Query helpers

export function getTimelineByViewToken(viewToken: string) {
  return db.query("SELECT * FROM timelines WHERE view_token = ?").get(viewToken) as any;
}

export function getUserByPostToken(postToken: string) {
  return db.query(`
    SELECT u.*, t.view_token, t.name as timeline_name
    FROM users u JOIN timelines t ON u.timeline_id = t.id
    WHERE u.post_token = ?
  `).get(postToken) as any;
}

export function getTimelinePosts(timelineId: number, limit = 20, cursor?: string) {
  if (cursor) {
    // cursor format: "created_at|id"
    const [cursorDate, cursorId] = cursor.split("|") as [string, string];
    return db.query(`
      SELECT p.*, u.name as user_name, u.avatar_color
      FROM posts p JOIN users u ON p.user_id = u.id
      WHERE p.timeline_id = ?
        AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ?
    `).all(timelineId, cursorDate, cursorDate, Number(cursorId), limit) as any[];
  }
  return db.query(`
    SELECT p.*, u.name as user_name, u.avatar_color
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.timeline_id = ?
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT ?
  `).all(timelineId, limit) as any[];
}

export function getPostMedia(postId: number) {
  return db.query("SELECT * FROM media WHERE post_id = ?").all(postId) as any[];
}

export function createPost(userId: number, timelineId: number, body: string) {
  const result = db.query(
    "INSERT INTO posts (user_id, timeline_id, body) VALUES (?, ?, ?) RETURNING *"
  ).get(userId, timelineId, body) as any;
  return result;
}

export function createMedia(postId: number, filename: string, originalName: string, mimeType: string, sizeBytes: number) {
  return db.query(
    "INSERT INTO media (post_id, filename, original_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?) RETURNING *"
  ).get(postId, filename, originalName, mimeType, sizeBytes) as any;
}

export function deletePost(postId: number, userId: number) {
  // Get media files before deleting
  const mediaFiles = db.query("SELECT filename FROM media WHERE post_id = ?").all(postId) as any[];
  const deleted = db.query("DELETE FROM posts WHERE id = ? AND user_id = ?").run(postId, userId);
  return { deleted: deleted.changes > 0, mediaFiles };
}

export function getPost(postId: number) {
  return db.query("SELECT * FROM posts WHERE id = ?").get(postId) as any;
}

export function getPostWithUser(postId: number) {
  return db.query(`
    SELECT p.*, u.name as user_name, u.avatar_color
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.id = ?
  `).get(postId) as any;
}

export function getPostsUntilPost(timelineId: number, postId: number) {
  // Fetch all posts from newest down to and including the target post
  const target = db.query("SELECT created_at FROM posts WHERE id = ? AND timeline_id = ?").get(postId, timelineId) as any;
  if (!target) return null;
  return db.query(`
    SELECT p.*, u.name as user_name, u.avatar_color
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.timeline_id = ?
      AND (p.created_at > ? OR (p.created_at = ? AND p.id >= ?))
    ORDER BY p.created_at DESC, p.id DESC
  `).all(timelineId, target.created_at, target.created_at, postId) as any[];
}

export function createTimeline(name: string, viewToken: string) {
  return db.query(
    "INSERT INTO timelines (name, view_token) VALUES (?, ?) RETURNING *"
  ).get(name, viewToken) as any;
}

export function createUser(timelineId: number, name: string, postToken: string, avatarColor: string) {
  return db.query(
    "INSERT INTO users (timeline_id, name, post_token, avatar_color) VALUES (?, ?, ?, ?) RETURNING *"
  ).get(timelineId, name, postToken, avatarColor) as any;
}

export function getAllTimelinesWithUsers() {
  const timelines = db.query("SELECT * FROM timelines").all() as any[];
  return timelines.map((t) => ({
    ...t,
    users: db.query("SELECT * FROM users WHERE timeline_id = ?").all(t.id) as any[],
  }));
}

export function getOrCreateVapidKeys() {
  const existing = db.query("SELECT * FROM vapid_keys WHERE id = 1").get() as any;
  if (existing) return { publicKey: existing.public_key, privateKey: existing.private_key };

  const webpush = require("web-push");
  const keys = webpush.generateVAPIDKeys();
  db.query("INSERT INTO vapid_keys (id, public_key, private_key) VALUES (1, ?, ?)").run(keys.publicKey, keys.privateKey);
  return keys;
}

export function addPushSubscription(timelineId: number, endpoint: string, p256dh: string, auth: string) {
  return db.query(`
    INSERT INTO push_subscriptions (timeline_id, endpoint, key_p256dh, key_auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(timeline_id, endpoint) DO UPDATE SET key_p256dh = excluded.key_p256dh, key_auth = excluded.key_auth
  `).run(timelineId, endpoint, p256dh, auth);
}

export function removePushSubscription(timelineId: number, endpoint: string) {
  return db.query("DELETE FROM push_subscriptions WHERE timeline_id = ? AND endpoint = ?").run(timelineId, endpoint);
}

export function getSubscriptionsForTimeline(timelineId: number) {
  return db.query("SELECT * FROM push_subscriptions WHERE timeline_id = ?").all(timelineId) as any[];
}

export default db;

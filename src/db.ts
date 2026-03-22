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

export function getTimelinePosts(timelineId: number) {
  return db.query(`
    SELECT p.*, u.name as user_name, u.avatar_color
    FROM posts p JOIN users u ON p.user_id = u.id
    WHERE p.timeline_id = ?
    ORDER BY p.created_at DESC
  `).all(timelineId) as any[];
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

export default db;

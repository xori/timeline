# Timeline

A shared photo and text timeline app for groups. Create a timeline, invite people with personal posting links, and everyone's updates appear on a single chronological feed — perfect for trips, events, or any shared experience.

## Features

- **Multi-user timelines** — each person gets a unique posting link, no accounts needed
- **Photo and video uploads** — drag-and-drop media with client-side video compression via FFmpeg WASM
- **Push notifications** — opt-in browser notifications when someone posts
- **Markdown support** — posts render with full markdown formatting
- **Lazy-loaded thumbnails** — server-generated thumbnails for fast initial loads, full images loaded on scroll
- **Link previews** — shared post URLs include Open Graph meta tags
- **Scrapbook export** — generate a printable HTML scrapbook from any timeline
- **Mark as done** — close a timeline when the event is over, with optional subscriber notification

## Tech stack

[Bun](https://bun.sh) server with SQLite (`bun:sqlite`), React 19 frontend with Tailwind CSS, and Sharp for image processing.

## Getting started

```bash
bun install
```

Create a timeline with one or more users:

```bash
bun seed <timeline-name> <user1> [user2] ...
```

This prints a **view URL** (read-only feed) and a **post URL** per user (lets them create posts).

Start the dev server:

```bash
bun dev
```

## Production

```bash
bun run build
bun start
```

## Scrapbook

Generate a printable landscape-oriented HTML scrapbook from a timeline's posts and photos:

```bash
bun src/scrapbook.ts <view-token>
```

Outputs a self-contained HTML file with all images embedded as base64. Open it in a browser and print to PDF. The layout adapts automatically — photo-heavy posts get mosaic grids, text-only posts get journal columns, and posts with many photos span multiple pages.

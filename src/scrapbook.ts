import db from "./db";
import { renderMarkdown } from "./lib/markdown";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const UPLOADS_DIR = join(import.meta.dir, "..", "data", "uploads");

const viewToken = process.argv[2];
if (!viewToken) {
  console.error("Usage: bun src/scrapbook.ts <view-token>");
  process.exit(1);
}

const timeline = db
  .query("SELECT * FROM timelines WHERE view_token = ?")
  .get(viewToken) as any;
if (!timeline) {
  console.error(`Timeline not found for token: ${viewToken}`);
  process.exit(1);
}

const posts = db
  .query(
    `SELECT p.*, u.name as user_name, u.avatar_color
     FROM posts p JOIN users u ON p.user_id = u.id
     WHERE p.timeline_id = ?
     ORDER BY p.created_at ASC`,
  )
  .all(timeline.id) as any[];

const allMedia = db
  .query(
    `SELECT m.* FROM media m
     JOIN posts p ON m.post_id = p.id
     WHERE p.timeline_id = ?`,
  )
  .all(timeline.id) as any[];

const mediaByPost = new Map<number, any[]>();
for (const m of allMedia) {
  const list = mediaByPost.get(m.post_id) || [];
  list.push(m);
  mediaByPost.set(m.post_id, list);
}

function imageToDataUrl(filename: string, mimeType: string): string | null {
  try {
    const buf = readFileSync(join(UPLOADS_DIR, filename));
    return `data:${mimeType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "Z").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDay(day: string): string {
  return new Date(day + "T00:00:00Z").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function imgTag(m: any): string {
  const url = imageToDataUrl(m.filename, m.mime_type);
  return url ? `<img src="${url}" alt="${m.original_name}" />` : "";
}

type PostInfo = {
  post: any;
  images: any[];
  hasBody: boolean;
  bodyHtml: string;
};

function analyzePost(post: any): PostInfo {
  const media = mediaByPost.get(post.id) || [];
  const images = media.filter((m: any) => m.mime_type?.startsWith("image/"));
  const hasBody = !!post.body?.trim();
  const bodyHtml = hasBody ? renderMarkdown(post.body) : "";
  return { post, images, hasBody, bodyHtml };
}

function postHeader(p: any): string {
  return `<div class="post-header">
    <span class="avatar" style="background:${p.avatar_color}">${p.user_name.charAt(0).toUpperCase()}</span>
    <span class="post-author">${p.user_name}</span>
    <span class="post-time">${formatDate(p.created_at)}</span>
  </div>`;
}

// --- Layout renderers ---
// Each takes a slice of PostInfos and returns the inner HTML for a .page

// Hero: 1 post with a big image, text beside it
function layoutHero(items: PostInfo[]): string {
  const item = items[0]!;
  const img = imgTag(item.images[0]);
  return `<div class="layout-hero bleed">
    <div class="hero-image">${img}</div>
    <div class="hero-text">
      ${postHeader(item.post)}
      ${item.hasBody ? `<div class="post-body">${item.bodyHtml}</div>` : ""}
    </div>
  </div>`;
}

// Feature: image(s) on top, caption below
function layoutFeature(items: PostInfo[]): string {
  const item = items[0]!;
  const count = item.images.length;
  let imageSection: string;
  if (count === 1) {
    imageSection = `<div class="feature-image">${imgTag(item.images[0])}</div>`;
  } else {
    const cls = count <= 2 ? "mosaic-2" : count <= 4 ? "mosaic-4" : "mosaic-6";
    imageSection = `<div class="feature-image layout-mosaic ${cls}">${item.images.map(imgTag).join("\n")}</div>`;
  }
  return `<div class="layout-feature bleed">
    ${imageSection}
    <div class="feature-caption">
      ${postHeader(item.post)}
      ${item.hasBody ? `<div class="post-body">${item.bodyHtml}</div>` : ""}
    </div>
  </div>`;
}

// Mosaic: multiple images filling the page in a grid
function layoutMosaic(items: PostInfo[], dayLabel?: string): string {
  const allImages = items.flatMap((it) => it.images);
  const count = allImages.length;
  const cls = count <= 2 ? "mosaic-2" : count <= 4 ? "mosaic-4" : "mosaic-6";
  const hasCaptions = items.some((it) => it.hasBody);
  const bleedClass = hasCaptions ? "bleed" : "bleed-all";
  return `<div class="${bleedClass}">
    <div class="layout-mosaic ${cls}">
      ${allImages.map((m) => imgTag(m)).join("\n")}
    </div>
    ${hasCaptions ? `<div class="mosaic-captions">${items.filter((it) => it.hasBody).map((it) => `<div class="mosaic-caption">${postHeader(it.post)}<div class="post-body">${it.bodyHtml}</div></div>`).join("")}</div>` : ""}
  </div>`;
}

// Journal: text-only posts in a multi-column layout
function layoutJournal(items: PostInfo[]): string {
  const cols = items.length >= 3 ? 3 : items.length;
  return `<div class="layout-journal cols-${cols}">
    ${items.map((it) => `<article class="journal-entry">
      ${postHeader(it.post)}
      <div class="post-body">${it.bodyHtml}</div>
    </article>`).join("\n")}
  </div>`;
}

// Cards: mixed content in equal cards (default fallback)
function layoutCards(items: PostInfo[]): string {
  const cols = items.length === 1 ? 1 : items.length === 2 ? 2 : items.length <= 4 ? 2 : 3;
  return `<div class="layout-cards cols-${cols}">
    ${items.map((it) => {
      const imageCount = it.images.length;
      const galleryClass = imageCount === 1 ? "gallery-1" : imageCount === 2 ? "gallery-2" : imageCount >= 3 ? "gallery-3" : "";
      return `<article class="card">
        ${postHeader(it.post)}
        ${it.hasBody ? `<div class="post-body">${it.bodyHtml}</div>` : ""}
        ${imageCount > 0 ? `<div class="gallery ${galleryClass}">${it.images.map(imgTag).join("\n")}</div>` : ""}
      </article>`;
    }).join("\n")}
  </div>`;
}

// Magazine: left side has 1 big image, right side has text posts stacked
function layoutMagazine(items: PostInfo[]): string {
  const withImg = items.find((it) => it.images.length > 0);
  const rest = items.filter((it) => it !== withImg);
  if (!withImg) return layoutCards(items);
  return `<div class="layout-magazine bleed">
    <div class="magazine-image">${imgTag(withImg.images[0])}</div>
    <div class="magazine-sidebar">
      <article class="card">
        ${postHeader(withImg.post)}
        ${withImg.hasBody ? `<div class="post-body">${withImg.bodyHtml}</div>` : ""}
        ${withImg.images.length > 1 ? `<div class="gallery gallery-${Math.min(withImg.images.length - 1, 3)}">${withImg.images.slice(1).map(imgTag).join("\n")}</div>` : ""}
      </article>
      ${rest.map((it) => `<article class="card">
        ${postHeader(it.post)}
        ${it.hasBody ? `<div class="post-body">${it.bodyHtml}</div>` : ""}
        ${it.images.length > 0 ? `<div class="gallery gallery-${Math.min(it.images.length, 3)}">${it.images.map(imgTag).join("\n")}</div>` : ""}
      </article>`).join("\n")}
    </div>
  </div>`;
}

// --- Page assembly ---

const MOSAIC_PER_PAGE = 6;

type PageSlot = { items: PostInfo[]; dayLabel: string; continuation?: boolean };

function splitLargePost(item: PostInfo, dayLabel: string): PageSlot[] {
  if (item.images.length <= MOSAIC_PER_PAGE) {
    return [{ items: [item], dayLabel }];
  }

  const pages: PageSlot[] = [];
  const chunks: any[][] = [];
  for (let i = 0; i < item.images.length; i += MOSAIC_PER_PAGE) {
    chunks.push(item.images.slice(i, i + MOSAIC_PER_PAGE));
  }

  // First page: hero with first image + text
  pages.push({
    items: [{ ...item, images: [item.images[0]] }],
    dayLabel,
  });

  // Remaining pages: mosaic grids of images (no text repeated)
  for (let i = 1; i < chunks.length; i++) {
    pages.push({
      items: [{ ...item, images: chunks[i], hasBody: false, bodyHtml: "" }],
      dayLabel,
      continuation: true,
    });
  }

  // If first chunk had more than 1, insert a mosaic page for images 1..chunk0.length
  if (chunks[0].length > 1) {
    pages.splice(1, 0, {
      items: [{ ...item, images: chunks[0].slice(1), hasBody: false, bodyHtml: "" }],
      dayLabel,
      continuation: true,
    });
  }

  return pages;
}

function paginatePosts(analyzed: PostInfo[]): PageSlot[] {
  const byDate = new Map<string, PostInfo[]>();
  for (const a of analyzed) {
    const day = a.post.created_at.split(" ")[0];
    const list = byDate.get(day) || [];
    list.push(a);
    byDate.set(day, list);
  }

  const pages: PageSlot[] = [];
  for (const [day, dayItems] of byDate) {
    const dayLabel = formatDay(day);
    let remaining = [...dayItems];

    while (remaining.length > 0) {
      const first = remaining[0];

      // Large photo post: split across multiple pages
      if (first.images.length > MOSAIC_PER_PAGE) {
        pages.push(...splitLargePost(remaining.shift()!, dayLabel));
        continue;
      }

      const totalImages = remaining.reduce((s, it) => s + it.images.length, 0);
      const textOnly = remaining.filter((it) => !it.images.length && it.hasBody);
      const withImages = remaining.filter((it) => it.images.length > 0);

      if (remaining.length === 1 && first.images.length === 1) {
        pages.push({ items: remaining.splice(0, 1), dayLabel });
      } else if (remaining.length === 1 && first.images.length > 1) {
        pages.push({ items: remaining.splice(0, 1), dayLabel });
      } else if (withImages.length >= 2 && totalImages >= 3 && textOnly.length === 0) {
        // Collect images across posts, split into mosaic pages of up to MOSAIC_PER_PAGE
        const taken: PostInfo[] = [];
        let imgCount = 0;
        while (remaining.length > 0 && remaining[0].images.length > 0) {
          if (imgCount + remaining[0].images.length > MOSAIC_PER_PAGE && imgCount > 0) break;
          imgCount += remaining[0].images.length;
          taken.push(remaining.shift()!);
        }
        pages.push({ items: taken, dayLabel });
      } else if (textOnly.length >= 2 && withImages.length === 0) {
        const take = Math.min(remaining.length, 4);
        pages.push({ items: remaining.splice(0, take), dayLabel });
      } else if (withImages.length === 1 && textOnly.length >= 1) {
        const imgPost = withImages[0];
        const texts = textOnly.slice(0, 3);
        const taken = [imgPost, ...texts];
        remaining = remaining.filter((it) => !taken.includes(it));
        pages.push({ items: taken, dayLabel });
      } else {
        const take = Math.min(remaining.length, 4);
        pages.push({ items: remaining.splice(0, take), dayLabel });
      }
    }
  }
  return pages;
}

function selectLayout(slot: PageSlot): string {
  const { items, continuation } = slot;
  const totalImages = items.reduce((s, it) => s + it.images.length, 0);
  const allText = items.every((it) => !it.images.length && it.hasBody);
  const allPhotos = items.every((it) => it.images.length > 0) && !items.some((it) => it.hasBody);

  if (continuation) return layoutMosaic(items);
  if (items.length === 1 && totalImages === 1 && items[0].hasBody) return layoutHero(items);
  if (items.length === 1 && totalImages === 1 && !items[0].hasBody) return layoutFeature(items);
  if (items.length === 1 && totalImages > 1) return layoutFeature(items);
  if (allText) return layoutJournal(items);
  if (totalImages >= 3 && (allPhotos || !items.some((it) => it.hasBody))) return layoutMosaic(items);
  if (items.some((it) => it.images.length > 0) && items.some((it) => !it.images.length && it.hasBody)) return layoutMagazine(items);

  return layoutCards(items);
}

function renderPage(slot: PageSlot, pageIndex: number): string {
  const content = selectLayout(slot);
  const label = slot.continuation ? `${slot.dayLabel} (cont.)` : slot.dayLabel;
  return `
    <section class="page">
      <h2 class="day-header">${label}</h2>
      ${content}
    </section>`;
}

// --- Generate ---

const analyzed = posts.map(analyzePost);
const pages = paginatePosts(analyzed);
const imageCount = allMedia.filter((m: any) => m.mime_type?.startsWith("image/")).length;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${timeline.name} — Scrapbook</title>
  <style>
    @page {
      size: landscape;
      margin: 0;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
    }

    :root { --bleed: 0.4in; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Georgia", "Times New Roman", serif;
      background: #faf8f5;
      color: #2c2c2c;
    }

    /* --- Cover --- */
    .cover {
      height: 100vh;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      page-break-after: always;
    }
    .cover h1 { font-size: 3.5rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.5rem; }
    .cover .subtitle { font-size: 1.2rem; opacity: 0.85; font-style: italic; }

    /* --- Page --- */
    .page {
      padding: var(--bleed);
      height: 100vh;
      display: flex; flex-direction: column;
      overflow: hidden;
    }
    .day-header {
      font-size: 1.1rem; font-weight: 600; color: #5a4e8a;
      border-bottom: 2px solid #e0daf0;
      padding-bottom: 0.25rem; margin-bottom: 0.6rem;
      flex-shrink: 0;
    }

    /* Pull image-heavy layouts to the page edge */
    .bleed {
      margin: 0 calc(-1 * var(--bleed)) calc(-1 * var(--bleed));
    }
    .bleed-all {
      margin: calc(-0.6rem - 2px) calc(-1 * var(--bleed)) calc(-1 * var(--bleed));
    }

    /* --- Shared --- */
    .post-header { display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.3rem; }
    .avatar {
      width: 1.3rem; height: 1.3rem; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      color: white; font-size: 0.65rem; font-weight: 700; flex-shrink: 0;
    }
    .post-author { font-weight: 600; font-size: 0.75rem; }
    .post-time { font-size: 0.6rem; color: #999; margin-left: auto; }
    .post-body { font-size: 0.78rem; line-height: 1.5; }
    .post-body p { margin-bottom: 0.25em; }
    .post-body p:last-child { margin-bottom: 0; }

    img { border-radius: 0.35rem; display: block; object-fit: cover; }
    .bleed img, .bleed-all img { border-radius: 0; }

    /* --- Hero: big image left, text right --- */
    .layout-hero {
      flex: 1; display: grid;
      grid-template-columns: 1.6fr 1fr;
      gap: 0; min-height: 0;
    }
    .hero-image { overflow: hidden; }
    .hero-image img { width: 100%; height: 100%; object-fit: cover; }
    .hero-text {
      display: flex; flex-direction: column; justify-content: center;
      padding: 1rem var(--bleed) 1rem 1rem;
    }

    /* --- Feature: image top, caption below --- */
    .layout-feature {
      flex: 1; display: flex; flex-direction: column; min-height: 0;
    }
    .feature-image {
      flex: 1; overflow: hidden; min-height: 0;
    }
    .feature-image img { width: 100%; height: 100%; object-fit: cover; }
    .feature-caption {
      padding: 0.4rem var(--bleed) var(--bleed);
      flex-shrink: 0;
    }

    /* --- Mosaic --- */
    .layout-mosaic {
      flex: 1; display: grid; gap: 3px;
      min-height: 0; overflow: hidden;
    }
    .layout-mosaic img { width: 100%; height: 100%; object-fit: cover; }
    .mosaic-2 { grid-template-columns: 1fr 1fr; }
    .mosaic-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .mosaic-6 { grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr; }
    .mosaic-captions {
      flex-shrink: 0; padding: 0.4rem var(--bleed) var(--bleed);
      display: flex; gap: 1rem;
    }
    .mosaic-caption { flex: 1; }

    /* --- Journal: text columns --- */
    .layout-journal {
      flex: 1; display: grid; gap: 1rem; align-content: start;
    }
    .layout-journal.cols-1 { grid-template-columns: 1fr; }
    .layout-journal.cols-2 { grid-template-columns: 1fr 1fr; }
    .layout-journal.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .journal-entry {
      background: white; border: 1px solid #e8e4ef;
      border-radius: 0.5rem; padding: 0.75rem;
      box-shadow: 1px 2px 6px rgba(0,0,0,0.04);
    }

    /* --- Cards: generic grid --- */
    .layout-cards {
      flex: 1; display: grid; gap: 0.6rem; align-content: start;
    }
    .layout-cards.cols-1 { grid-template-columns: 1fr; }
    .layout-cards.cols-2 { grid-template-columns: 1fr 1fr; }
    .layout-cards.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
    .card {
      background: white; border: 1px solid #e8e4ef;
      border-radius: 0.5rem; padding: 0.65rem;
      box-shadow: 1px 2px 6px rgba(0,0,0,0.04);
    }
    .card .gallery { margin-top: 0.35rem; }

    .gallery { border-radius: 0.35rem; overflow: hidden; }
    .gallery img { width: 100%; }
    .gallery-1 img { max-height: 16rem; }
    .gallery-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; }
    .gallery-2 img { max-height: 10rem; }
    .gallery-3 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; }
    .gallery-3 img { max-height: 8rem; }

    /* --- Magazine: big image left, sidebar right --- */
    .layout-magazine {
      flex: 1; display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 0; min-height: 0;
    }
    .magazine-image { overflow: hidden; }
    .magazine-image img { width: 100%; height: 100%; object-fit: cover; border-radius: 0; }
    .magazine-sidebar {
      display: flex; flex-direction: column; gap: 0.5rem;
      overflow: hidden;
      padding: 0.5rem var(--bleed) var(--bleed) 0.75rem;
    }

    /* --- Screen preview --- */
    @media screen {
      body { max-width: 11in; margin: 0 auto; padding: 1rem; }
      .page {
        background: white;
        margin-bottom: 1rem; border-radius: 0.5rem;
        box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        aspect-ratio: 11 / 8.5;
        height: auto;
        overflow: hidden;
      }
      .cover {
        border-radius: 0.5rem; margin-bottom: 1rem;
        aspect-ratio: 11 / 8.5;
      }
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${timeline.name}</h1>
    <p class="subtitle">${posts.length} posts · ${imageCount} photos</p>
  </div>
  ${pages.map((slot, i) => renderPage(slot, i)).join("\n")}
</body>
</html>`;

const outPath = join(
  import.meta.dir,
  "..",
  `${timeline.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-scrapbook.html`,
);
await Bun.write(outPath, html);
console.log(`Scrapbook written to ${outPath}`);
console.log(`${posts.length} posts, ${imageCount} photos → ${pages.length} pages`);

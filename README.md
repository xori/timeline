# bun-react-tailwind-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

## Scrapbook

Generate a printable landscape-oriented HTML scrapbook from a timeline's posts and photos:

```bash
bun src/scrapbook.ts <view-token>
```

This outputs a self-contained HTML file (e.g. `japan-2026-scrapbook.html`) with all images embedded as base64. Open it in a browser and use Print (Ctrl/Cmd+P) to save as PDF or print. The layout adapts automatically based on content — photo-heavy posts get mosaic grids, text-only posts get journal columns, and posts with many photos span multiple pages.

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.


Timeline: Japan
  View: https://japan.verworn.ca/t/019d13b0-b3fc-7000-9324-6b61b01cc8c6
  Evan post URL: https://japan.verworn.ca/p/019d13b0-b40b-7000-8735-4cf114a6b112
  Gilian post URL: https://japan.verworn.ca/p/019d13b0-b40e-7000-9aa2-0db40c320d3d
  Vivian post URL: https://japan.verworn.ca/p/019d13b0-b40f-7000-abae-7cf3f388ab75
  Ron post URL: https://japan.verworn.ca/p/019d13b0-b414-7000-a8a3-c052732574b5
  Jocelyne post URL: https://japan.verworn.ca/p/019d13b0-b416-7000-8e26-6e66dac5a282
  Christi post URL: https://japan.verworn.ca/p/019d13b0-b418-7000-832d-755985bb5766

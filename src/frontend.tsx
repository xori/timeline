import { createRoot } from "react-dom/client";
import { Timeline } from "./components/Timeline";
import { NotFound } from "./components/NotFound";
import "./index.css";

function App() {
  const path = window.location.pathname;

  // /t/:viewToken or /t/:viewToken/post/:postId
  const viewMatch = path.match(/^\/t\/([^/]+?)(?:\/post\/(\d+))?$/);
  if (viewMatch) {
    const viewToken = viewMatch[1];
    const focusPostId = viewMatch[2] ? Number(viewMatch[2]) : undefined;
    return <Timeline viewToken={viewToken} focusPostId={focusPostId} />;
  }

  // /p/:postToken or /p/:postToken/post/:postId
  const postMatch = path.match(/^\/p\/([^/]+?)(?:\/post\/(\d+))?$/);
  if (postMatch) {
    const postToken = postMatch[1];
    const focusPostId = postMatch[2] ? Number(postMatch[2]) : undefined;
    return <Timeline postToken={postToken} focusPostId={focusPostId} />;
  }

  return <NotFound />;
}

function start() {
  const root = createRoot(document.getElementById("root")!);
  root.render(<App />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}

import { createRoot } from "react-dom/client";
import { Timeline } from "./components/Timeline";
import { NotFound } from "./components/NotFound";
import "./index.css";

function App() {
  const path = window.location.pathname;

  if (path.startsWith("/t/")) {
    const viewToken = path.slice(3);
    return <Timeline viewToken={viewToken} />;
  }

  if (path.startsWith("/p/")) {
    const postToken = path.slice(3);
    return <Timeline postToken={postToken} />;
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

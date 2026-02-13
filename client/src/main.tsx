import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initializeErrorTracking } from "./lib/errorTracking";
import { AppErrorBoundary } from "./components/ErrorBoundary";

// Initialize error tracking FIRST (before rendering)
initializeErrorTracking();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary name="App">
    <App />
  </AppErrorBoundary>
);

const STORAGE_KEY = "sidebarCollapsed";
const TOGGLE_EVENT = "stairdoc:sidebar-toggle";

export function isSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function setSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(collapsed));
  window.dispatchEvent(
    new CustomEvent(TOGGLE_EVENT, { detail: { collapsed } }),
  );
}

export function toggleSidebarCollapsed(): boolean {
  const next = !isSidebarCollapsed();
  setSidebarCollapsed(next);
  return next;
}

export function subscribeSidebarToggle(
  handler: (collapsed: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    const collapsed = (event as CustomEvent<{ collapsed: boolean }>).detail
      .collapsed;
    handler(collapsed);
  };

  window.addEventListener(TOGGLE_EVENT, listener);
  return () => window.removeEventListener(TOGGLE_EVENT, listener);
}

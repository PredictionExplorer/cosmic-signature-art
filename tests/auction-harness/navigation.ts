// The browser harness mounts the viewer outside Next's app router. The viewer's keys move
// between works through the router; here they move the fixture page the plain way.
export function useRouter() {
  return {
    push: (href: string) => window.location.assign(href),
    replace: (href: string) => window.location.replace(href),
    prefetch: () => {},
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
  };
}
export function usePathname() {
  return window.location.pathname;
}
export function useSearchParams() {
  return new URLSearchParams(window.location.search);
}
export function useParams() {
  return {};
}

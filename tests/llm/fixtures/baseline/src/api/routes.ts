import type { User } from "./auth";

export type RouteHandler = (user: User | null) => string;

export const routes: Record<string, RouteHandler> = {
  "/health": () => "ok",
  "/profile": (user) => (user ? `profile:${user.id}` : "unauthorized"),
};

export function resolveRoute(path: string, user: User | null): string {
  const handler = routes[path];
  if (!handler) return "not_found";
  return handler(user);
}

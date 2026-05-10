import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** bits-ui / shadcn-svelte prop helpers */
export type WithoutChild<T> = T extends { child?: unknown } ? Omit<T, "child"> : T;
export type WithoutChildren<T> = T extends { children?: unknown } ? Omit<T, "children"> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;

/** Props baseline for shadcn-svelte primitives (ref + class passthrough). */
export type WithElementRef<T = Record<string, unknown>> = T & {
  ref?: HTMLElement | null;
  class?: string | null | undefined;
};

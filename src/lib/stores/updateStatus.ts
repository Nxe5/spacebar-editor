import { writable } from "svelte/store";
import type { Update } from "@tauri-apps/plugin-updater";
import type { StatusDot } from "./backendStatus";

export interface UpdateStatus {
  dot: StatusDot;
  currentVersion: string;
  latestVersion: string | null;
  pendingUpdate: Update | null;
  detail: string;
  checkedAt: number | null;
}

const initial: UpdateStatus = {
  dot: "idle",
  currentVersion: "",
  latestVersion: null,
  pendingUpdate: null,
  detail: "",
  checkedAt: null,
};

export const updateStatus = writable<UpdateStatus>(initial);

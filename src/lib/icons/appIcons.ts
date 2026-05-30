import arrowUpCircle from "../../../icons/arrow-up-circle.svg?raw";
import attachment from "../../../icons/attachment.svg?raw";
import chatLines from "../../../icons/chat-lines.svg?raw";
import circleSpark from "../../../icons/circle-spark.svg?raw";
import floppyDisk from "../../../icons/floppy-disk.svg?raw";
import longArrowLeftDown from "../../../icons/long-arrow-left-down.svg?raw";
import git from "../../../icons/git.svg?raw";
import mailOpen from "../../../icons/mail-open.svg?raw";
import microphone from "../../../icons/microphone.svg?raw";
import openNewWindow from "../../../icons/open-new-window.svg?raw";
import pageSearch from "../../../icons/page-search.svg?raw";
import search from "../../../icons/search.svg?raw";
import pasteClipboard from "../../../icons/paste-clipboard.svg?raw";
import pause from "../../../icons/pause.svg?raw";
import settings from "../../../icons/settings.svg?raw";
import wrapText from "../../../icons/wrap-text.svg?raw";

export type AppIconName =
  | "page-search"
  | "search"
  | "git"
  | "paste-clipboard"
  | "open-new-window"
  | "mail-open"
  | "settings"
  | "wrap-text"
  | "microphone"
  | "long-arrow-left-down"
  | "arrow-up-circle"
  | "pause"
  | "attachment"
  | "circle-spark"
  | "chat-lines"
  | "floppy-disk";

const ICONS: Record<AppIconName, string> = {
  "page-search": pageSearch,
  search,
  git,
  "paste-clipboard": pasteClipboard,
  "open-new-window": openNewWindow,
  "mail-open": mailOpen,
  settings,
  "wrap-text": wrapText,
  microphone,
  "long-arrow-left-down": longArrowLeftDown,
  "arrow-up-circle": arrowUpCircle,
  pause,
  attachment,
  "circle-spark": circleSpark,
  "chat-lines": chatLines,
  "floppy-disk": floppyDisk,
};

/** Inline SVG markup with currentColor strokes for toolbar buttons. */
export function appIconMarkup(name: AppIconName, size = 16): string {
  return ICONS[name]
    .replace(/<\?xml[^?]*\?>\s*/i, "")
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(/\sdata-darkreader-[^=]*="[^"]*"/g, "")
    .replace(/stroke="#000000"/g, 'stroke="currentColor"')
    .replace(/color="#000000"/g, 'color="currentColor"')
    .replace(/width="24px"/, `width="${size}"`)
    .replace(/height="24px"/, `height="${size}"`);
}

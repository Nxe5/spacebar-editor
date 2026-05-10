import "./styles/globals.css";
import "./styles/workbench-themes.css";
import "@vscode/codicons/dist/codicon.css";
import SettingsWindowRoot from "./modules/settings/SettingsWindowRoot.svelte";
import { mount } from "svelte";

mount(SettingsWindowRoot, {
  target: document.getElementById("app")!,
});

export default undefined;

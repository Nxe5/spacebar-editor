import "./styles/globals.css";
import "./styles/workbench-themes.css";
import "@vscode/codicons/dist/codicon.css";
import App from "./App.svelte";
import { mount } from "svelte";

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;

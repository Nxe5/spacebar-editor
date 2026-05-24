import type { Extension } from "@codemirror/state";
import { EditorState } from "@codemirror/state";
import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
  EditorView,
  scrollPastEnd,
} from "@codemirror/view";
import { foldGutter, indentOnInput, bracketMatching } from "@codemirror/language";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import {
  closeBrackets,
  autocompletion,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { lintKeymap } from "@codemirror/lint";
import { foldKeymap } from "@codemirror/language";
import type { OpenFile } from "$lib/stores/files";
import { editorSyntaxHighlighting } from "./syntaxTheme";
import { middleClickScroll } from "./middleClickScroll";
import { gitDiffHighlightExtension } from "./diffDecorations";

/** Same as codemirror's `basicSetup` but without `defaultHighlightStyle` (we use custom syntax). */
export const editorBaseSetup: Extension[] = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  foldGutter(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  middleClickScroll(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...foldKeymap,
    ...completionKeymap,
    ...lintKeymap,
  ]),
];

export type CodeMirrorKit = {
  EditorState: typeof EditorState;
  EditorView: typeof EditorView;
  scrollPastEnd: typeof scrollPastEnd;
  editorBaseSetup: Extension[];
  syntaxHighlighting: Extension;
  languageExtensions: Record<string, Extension>;
};

let loadPromise: Promise<CodeMirrorKit> | null = null;

/** Load CodeMirror once per app session (avoids re-import on every editor remount). */
export function loadCodeMirror(): Promise<CodeMirrorKit> {
  if (!loadPromise) {
    loadPromise = Promise.all([
      import("@codemirror/lang-javascript"),
      import("@codemirror/lang-html"),
      import("@codemirror/lang-css"),
      import("@codemirror/lang-json"),
      import("@codemirror/lang-markdown"),
      import("@codemirror/lang-rust"),
      import("@codemirror/lang-python"),
      import("@codemirror/lang-yaml"),
      import("@codemirror/lang-go"),
      import("@codemirror/lang-cpp"),
      import("@codemirror/lang-java"),
      import("@codemirror/lang-sql"),
      import("@codemirror/lang-xml"),
      import("codemirror-lang-svelte"),
    ]).then(
      ([
        jsModule,
        htmlModule,
        cssModule,
        jsonModule,
        mdModule,
        rustModule,
        pythonModule,
        yamlModule,
        goModule,
        cppModule,
        javaModule,
        sqlModule,
        xmlModule,
        svelteModule,
      ]) => ({
      EditorState,
      EditorView,
      scrollPastEnd,
      editorBaseSetup,
      syntaxHighlighting: editorSyntaxHighlighting,
      languageExtensions: {
        javascript: jsModule.javascript(),
        typescript: jsModule.javascript({ typescript: true }),
        html: htmlModule.html(),
        css: cssModule.css(),
        json: jsonModule.json(),
        markdown: mdModule.markdown(),
        rust: rustModule.rust(),
        python: pythonModule.python(),
        yaml: yamlModule.yaml(),
        go: goModule.go(),
        cpp: cppModule.cpp(),
        c: cppModule.cpp(),
        java: javaModule.java(),
        sql: sqlModule.sql(),
        xml: xmlModule.xml(),
        svelte: svelteModule.svelte(),
        vue: htmlModule.html(),
      },
    })
    );
  }
  return loadPromise;
}

export function createEditorState(
  kit: CodeMirrorKit,
  file: OpenFile,
  onDocChange: (path: string, text: string) => void
) {
  const langExt = kit.languageExtensions[file.language];
  const lang = langExt != null ? [langExt] : [];
  const diffMode = file.diffBase !== undefined;
  const diffExt = diffMode
    ? [
        gitDiffHighlightExtension(() => file.diffBase),
        EditorState.readOnly.of(true),
      ]
    : [];
  return kit.EditorState.create({
    doc: file.content,
    extensions: [
      ...kit.editorBaseSetup,
      ...lang,
      ...diffExt,
      kit.syntaxHighlighting,
      kit.scrollPastEnd(),
      kit.EditorView.updateListener.of((update) => {
        if (update.docChanged && !diffMode) {
          onDocChange(file.path, update.state.doc.toString());
        }
      }),
    ],
  });
}

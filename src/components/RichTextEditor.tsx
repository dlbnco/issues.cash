"use client";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND } from "lexical";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { useEffect, useState } from "react";
import type { EditorState } from "lexical";

interface RichTextEditorProps {
  onChange: (value: object) => void;
}

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const [isList, setIsList] = useState(false);

  useEffect(() => editor.registerUpdateListener(({ editorState }) => {
    editorState.read(() => {
      const selection = $getSelection();
      setIsList($isRangeSelection(selection) ? selection.getNodes().some((node) => node.getType() === "listitem") : false);
    });
  }), [editor]);

  return (
    <div className="flex flex-wrap gap-1 border-b border-base-300 p-2">
      <button type="button" className="btn btn-ghost btn-xs font-bold" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}>B</button>
      <button type="button" className="btn btn-ghost btn-xs italic" onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}>I</button>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}>List</button>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)}>1. List</button>
      {isList && <button type="button" className="btn btn-ghost btn-xs" onClick={() => editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)}>Plain text</button>}
    </div>
  );
}

export function RichTextEditor({ onChange }: RichTextEditorProps) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "bounty-editor",
        nodes: [ListNode, ListItemNode],
        onError: (error) => {
          throw error;
        },
      }}
    >
      <div className="rounded-lg border border-base-300 bg-base-100">
        <Toolbar />
        <RichTextPlugin
          contentEditable={<ContentEditable className="min-h-52 p-3 outline-none" aria-placeholder="Describe the work, acceptance criteria, and delivery expectations." placeholder={<span className="pointer-events-none absolute p-3 text-base-content/40">Describe the work, acceptance criteria, and delivery expectations.</span>} />}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <OnChangePlugin onChange={(state: EditorState) => onChange(state.toJSON())} />
      </div>
    </LexicalComposer>
  );
}

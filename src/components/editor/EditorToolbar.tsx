"use client";

import { type Editor, useEditorState } from "@tiptap/react";
import clsx from "clsx";
import {
  Bold,
  Code,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

/** ⌘ on Apple platforms, Ctrl elsewhere — used only for tooltip copy. */
function modKey(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}

type BlockValue = "paragraph" | "h1" | "h2" | "h3";

function ToolButton({
  label,
  icon: Icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex size-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "bg-brand-50 text-brand-600"
          : "text-ink-500 hover:bg-canvas hover:text-ink-900",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-line" aria-hidden />;
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      if (!instance) return null;
      return {
        bold: instance.isActive("bold"),
        italic: instance.isActive("italic"),
        underline: instance.isActive("underline"),
        strike: instance.isActive("strike"),
        code: instance.isActive("code"),
        bulletList: instance.isActive("bulletList"),
        orderedList: instance.isActive("orderedList"),
        blockquote: instance.isActive("blockquote"),
        block: (instance.isActive("heading", { level: 1 })
          ? "h1"
          : instance.isActive("heading", { level: 2 })
            ? "h2"
            : instance.isActive("heading", { level: 3 })
              ? "h3"
              : "paragraph") as BlockValue,
        canUndo: instance.can().undo(),
        canRedo: instance.can().redo(),
      };
    },
  });

  if (!editor || !state) {
    return <div className="h-11 border-b border-line bg-paper" aria-hidden />;
  }

  const mod = modKey();
  const chain = () => editor.chain().focus();

  const setBlock = (value: BlockValue) => {
    if (value === "paragraph") chain().setParagraph().run();
    else chain().setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      className="flex flex-wrap items-center gap-0.5 border-b border-line bg-paper px-3 py-1.5 sm:px-6"
    >
      <Group>
        <ToolButton
          label={`Undo (${mod}Z)`}
          icon={Undo2}
          disabled={!state.canUndo}
          onClick={() => chain().undo().run()}
        />
        <ToolButton
          label={`Redo (${mod}⇧Z)`}
          icon={Redo2}
          disabled={!state.canRedo}
          onClick={() => chain().redo().run()}
        />
      </Group>

      <Divider />

      <label className="sr-only" htmlFor="vellum-block-style">
        Paragraph style
      </label>
      <select
        id="vellum-block-style"
        value={state.block}
        onChange={(event) => setBlock(event.target.value as BlockValue)}
        className="h-8 rounded-md border border-line bg-paper px-2 text-[13px] text-ink-700 hover:bg-canvas focus:border-brand-500 focus:outline-none"
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <Divider />

      <Group>
        <ToolButton
          label={`Bold (${mod}B)`}
          icon={Bold}
          active={state.bold}
          onClick={() => chain().toggleBold().run()}
        />
        <ToolButton
          label={`Italic (${mod}I)`}
          icon={Italic}
          active={state.italic}
          onClick={() => chain().toggleItalic().run()}
        />
        <ToolButton
          label={`Underline (${mod}U)`}
          icon={Underline}
          active={state.underline}
          onClick={() => chain().toggleUnderline().run()}
        />
        <ToolButton
          label={`Strikethrough (${mod}⇧S)`}
          icon={Strikethrough}
          active={state.strike}
          onClick={() => chain().toggleStrike().run()}
        />
        <ToolButton
          label={`Inline code (${mod}E)`}
          icon={Code}
          active={state.code}
          onClick={() => chain().toggleCode().run()}
        />
      </Group>

      <Divider />

      <Group>
        <ToolButton
          label={`Bullet list (${mod}⇧8)`}
          icon={List}
          active={state.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        />
        <ToolButton
          label={`Numbered list (${mod}⇧7)`}
          icon={ListOrdered}
          active={state.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        />
        <ToolButton
          label={`Quote (${mod}⇧B)`}
          icon={Quote}
          active={state.blockquote}
          onClick={() => chain().toggleBlockquote().run()}
        />
        <ToolButton
          label="Divider"
          icon={Minus}
          onClick={() => chain().setHorizontalRule().run()}
        />
      </Group>

      <Divider />

      <ToolButton
        label="Clear formatting"
        icon={RemoveFormatting}
        onClick={() => chain().unsetAllMarks().clearNodes().run()}
      />
    </div>
  );
}

import React from "react";
import { translate, type Locale } from "../../src/i18n";

export function MenuItems({
  locale,
  onRename,
  onDelete,
  deleteLabel = "Delete local copy",
}: {
  locale: Locale;
  onRename: () => void;
  onDelete: () => void;
  deleteLabel?: string;
}) {
  const t = (value: string) => translate(value, locale);
  return (
    <>
      <button role="menuitem" onClick={onRename}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="m15 4 5 5M4 20l5-1 11-11a3.5 3.5 0 0 0-5-5L4 14Z" />
        </svg>
        <span>{t("Rename")}</span>
      </button>
      <div className="menu-divider" role="separator" />
      <button role="menuitem" onClick={onDelete}>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
        </svg>
        <span>{t(deleteLabel)}</span>
      </button>
    </>
  );
}

export function menuKeys(event: React.KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]',
    ),
  ];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  items[
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) %
          items.length
  ]?.focus();
}

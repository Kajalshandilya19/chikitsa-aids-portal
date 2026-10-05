"use client";

/**
 * Context Menu Components
 * Column, row, and cell context menus
 */

import { useTranslations } from "next-intl";
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconClipboard,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconScissors,
  IconTrash,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ColumnContextMenuProps {
  columnIndex: number;
  position: ContextMenuPosition | null;
  isHidden: boolean;
  /** When false, insert and delete are not offered (fixed column layouts). */
  allowInsertDelete?: boolean;
  onClose: () => void;
  onInsertLeft: () => void;
  onInsertRight: () => void;
  onDelete: () => void;
  onHide: () => void;
  onShow: () => void;
}

interface RowContextMenuProps {
  rowIndex: number;
  position: ContextMenuPosition | null;
  isHidden: boolean;
  /** When false, "Insert Row Above" is not offered (e.g. on a locked header row). */
  allowInsertAbove?: boolean;
  /** When false, "Delete Row" and "Hide Row" are not offered. */
  allowDelete?: boolean;
  onClose: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDelete: () => void;
  onHide: () => void;
  onShow: () => void;
}

interface CellContextMenuProps {
  position: ContextMenuPosition | null;
  readOnly?: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onClear: () => void;
}

const isMacPlatform = (): boolean =>
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

function MenuAnchor({ position }: { position: ContextMenuPosition }) {
  return (
    <DropdownMenuTrigger asChild>
      <div className="fixed h-0 w-0" style={{ left: position.x, top: position.y }} />
    </DropdownMenuTrigger>
  );
}

export function ColumnContextMenu({
  position,
  isHidden,
  allowInsertDelete = true,
  onClose,
  onInsertLeft,
  onInsertRight,
  onDelete,
  onHide,
  onShow,
}: ColumnContextMenuProps) {
  const t = useTranslations("spreadsheet.menu");
  if (!position) return null;

  return (
    <DropdownMenu open={!!position} onOpenChange={(open) => !open && onClose()}>
      <MenuAnchor position={position} />
      <DropdownMenuContent align="start" className="w-52">
        {allowInsertDelete && (
          <>
            <DropdownMenuItem onClick={onInsertLeft}>
              <IconArrowLeft />
              {t("insertColumnLeft")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onInsertRight}>
              <IconArrowRight />
              {t("insertColumnRight")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              <IconTrash />
              {t("deleteColumn")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isHidden ? (
          <DropdownMenuItem onClick={onShow}>
            <IconEye />
            {t("showColumn")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onHide}>
            <IconEyeOff />
            {t("hideColumn")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RowContextMenu({
  position,
  isHidden,
  allowInsertAbove = true,
  allowDelete = true,
  onClose,
  onInsertAbove,
  onInsertBelow,
  onDelete,
  onHide,
  onShow,
}: RowContextMenuProps) {
  const t = useTranslations("spreadsheet.menu");
  if (!position) return null;

  return (
    <DropdownMenu open={!!position} onOpenChange={(open) => !open && onClose()}>
      <MenuAnchor position={position} />
      <DropdownMenuContent align="start" className="w-52">
        {allowInsertAbove && (
          <DropdownMenuItem onClick={onInsertAbove}>
            <IconArrowUp />
            {t("insertRowAbove")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onInsertBelow}>
          <IconArrowDown />
          {t("insertRowBelow")}
        </DropdownMenuItem>
        {allowDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} variant="destructive">
              <IconTrash />
              {t("deleteRow")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isHidden ? (
              <DropdownMenuItem onClick={onShow}>
                <IconEye />
                {t("showRow")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onHide}>
                <IconEyeOff />
                {t("hideRow")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CellContextMenu({
  position,
  readOnly = false,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onClear,
}: CellContextMenuProps) {
  const t = useTranslations("spreadsheet.menu");
  if (!position) return null;
  const mod = isMacPlatform() ? "⌘" : "Ctrl+";

  return (
    <DropdownMenu open={!!position} onOpenChange={(open) => !open && onClose()}>
      <MenuAnchor position={position} />
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onClick={onCopy}>
          <IconCopy />
          {t("copy")}
          <DropdownMenuShortcut>{mod}C</DropdownMenuShortcut>
        </DropdownMenuItem>
        {!readOnly && (
          <>
            <DropdownMenuItem onClick={onCut}>
              <IconScissors />
              {t("cut")}
              <DropdownMenuShortcut>{mod}X</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPaste}>
              <IconClipboard />
              {t("paste")}
              <DropdownMenuShortcut>{mod}V</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear} variant="destructive">
              <IconTrash />
              {t("clearContents")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

/**
 * CellEditor Component
 * Inline editor for cell content: text/number input, (searchable) dropdown,
 * multi-select, native date input and Yes/No select.
 */

import { useRef, useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { IconSearch } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { CellType, CellValidation } from "../types";
import { useSpreadsheetStore } from "../store";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type NavDirection = "up" | "down" | "left" | "right";

interface EditorBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const boxStyle = (style: EditorBox | undefined): React.CSSProperties => ({
  position: "absolute",
  left: style?.left ?? 0,
  top: style?.top ?? 0,
  width: style?.width ?? 100,
  height: style?.height ?? 28,
  display: "flex",
  alignItems: "center",
});

interface SearchableDropdownProps {
  options: string[];
  value: string;
  showSearch: boolean;
  disabled?: boolean;
  style?: EditorBox;
  selectOpen: boolean;
  setSelectOpen: (open: boolean) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onNavigate?: (direction: NavDirection) => void;
}

function SearchableDropdown({
  options,
  value,
  showSearch,
  disabled,
  style,
  selectOpen,
  setSelectOpen,
  onCommit,
  onCancel,
  onNavigate,
}: SearchableDropdownProps) {
  const t = useTranslations("spreadsheet");
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered =
    showSearch && search
      ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
      : options;

  useEffect(() => {
    if (selectOpen && showSearch) {
      const timer = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [selectOpen, showSearch]);

  if (!showSearch) {
    return (
      <div
        style={boxStyle(style)}
        className="bg-background z-50"
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            onCommit(value);
            onNavigate?.(e.shiftKey ? "left" : "right");
            e.preventDefault();
          } else if (e.key === "Escape") {
            onCancel();
            e.preventDefault();
          }
        }}
      >
        <Select
          value={value}
          open={selectOpen}
          onOpenChange={setSelectOpen}
          onValueChange={(val) => onCommit(val)}
          disabled={disabled}
        >
          <SelectTrigger className="border-primary h-full! w-full rounded-none border-2 focus:ring-0">
            <SelectValue placeholder={t("select")} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option} disabled={disabled}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Searchable dropdown for long option lists
  return (
    <div
      style={{
        position: "absolute",
        left: style?.left ?? 0,
        top: style?.top ?? 0,
        width: Math.max(style?.width ?? 100, 200),
        zIndex: 50,
      }}
      className="bg-background border-primary rounded-sm border-2 shadow-md"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onCancel();
          e.preventDefault();
        } else if (e.key === "Tab") {
          onCommit(value);
          onNavigate?.(e.shiftKey ? "left" : "right");
          e.preventDefault();
        } else if (e.key === "Enter" && filtered.length === 1) {
          onCommit(filtered[0]);
          setSearch("");
          e.preventDefault();
        }
      }}
    >
      <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
        <IconSearch className="text-muted-foreground size-3.5 shrink-0" />
        <input
          ref={searchRef}
          type="text"
          placeholder={t("search")}
          aria-label={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
        />
      </div>
      <div className="max-h-[180px] overflow-y-auto p-1">
        {filtered.length === 0 ? (
          <div className="text-muted-foreground px-2 py-1.5 text-sm">{t("noResults")}</div>
        ) : (
          filtered.map((option) => (
            <button
              key={option}
              type="button"
              className={cn(
                "hover:bg-accent/50 w-full cursor-pointer rounded px-2 py-1 text-left text-sm",
                option === value && "bg-accent font-medium",
              )}
              onClick={() => {
                onCommit(option);
                setSearch("");
              }}
              disabled={disabled}
            >
              {option}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

interface CellEditorProps {
  value: string;
  cellType: CellType;
  validation?: CellValidation;
  dropdownOptions?: readonly string[];
  disabled?: boolean;
  style?: EditorBox;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onNavigate?: (direction: NavDirection) => void;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function CellEditor({
  value,
  cellType,
  validation,
  dropdownOptions,
  disabled,
  style,
  onCommit: onCommitProp,
  onCancel: onCancelProp,
  onNavigate,
}: CellEditorProps) {
  const t = useTranslations("spreadsheet");
  const inputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(value);
  const [selectOpen, setSelectOpen] = useState(false);

  // Commit or cancel at most once: a late blur (after Enter/Tab already
  // committed, or after unmount) must not write into whichever cell is being
  // edited next.
  const doneRef = useRef(false);
  useEffect(() => {
    doneRef.current = false;
    return () => {
      doneRef.current = true;
    };
  }, []);
  const onCommit = useCallback(
    (next: string) => {
      if (doneRef.current) return;
      doneRef.current = true;
      onCommitProp(next);
    },
    [onCommitProp],
  );
  const onCancel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancelProp();
  }, [onCancelProp]);

  // Sync local editValue to the store's pendingEditValue so that a click on
  // another cell can commit the typed-but-uncommitted value.
  useEffect(() => {
    useSpreadsheetStore.setState({ pendingEditValue: editValue });
  }, [editValue]);

  const isDropdownLike =
    cellType === "dropdown" ||
    cellType === "multi-dropdown" ||
    validation?.type === "dropdown" ||
    validation?.type === "multi-dropdown" ||
    cellType === "boolean";

  // Auto-focus and select content; auto-open dropdowns
  useEffect(() => {
    if (disabled) return;
    if (inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.type === "text") inputRef.current.select();
    }
    if (isDropdownLike) {
      // Small delay so the trigger is mounted before opening
      const timer = setTimeout(() => setSelectOpen(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isDropdownLike, disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Enter":
          onCommit(editValue);
          onNavigate?.(e.shiftKey ? "up" : "down");
          e.preventDefault();
          break;
        case "Tab":
          onCommit(editValue);
          onNavigate?.(e.shiftKey ? "left" : "right");
          e.preventDefault();
          break;
        case "Escape":
          onCancel();
          e.preventDefault();
          break;
        case "ArrowUp":
          if (e.ctrlKey || e.metaKey) {
            onCommit(editValue);
            onNavigate?.("up");
            e.preventDefault();
          }
          break;
        case "ArrowDown":
          if (e.ctrlKey || e.metaKey) {
            onCommit(editValue);
            onNavigate?.("down");
            e.preventDefault();
          }
          break;
      }
    },
    [editValue, onCommit, onCancel, onNavigate],
  );

  const handleSelectKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "Tab":
          onCommit(editValue);
          onNavigate?.(e.shiftKey ? "left" : "right");
          e.preventDefault();
          break;
        case "Escape":
          onCancel();
          e.preventDefault();
          break;
      }
    },
    [editValue, onCommit, onCancel, onNavigate],
  );

  const handleBlur = useCallback(() => {
    // Small delay to allow click events elsewhere in the editor
    setTimeout(() => {
      if (!selectOpen) onCommit(editValue);
    }, 150);
  }, [editValue, onCommit, selectOpen]);

  // Dropdown editor
  if (cellType === "dropdown" || validation?.type === "dropdown") {
    const rawOptions = dropdownOptions ?? validation?.options ?? [];
    const options = Array.from(new Set(rawOptions.map(String)));

    return (
      <SearchableDropdown
        options={options}
        value={editValue}
        showSearch={options.length > 10}
        disabled={disabled}
        style={style}
        selectOpen={selectOpen}
        setSelectOpen={setSelectOpen}
        onCommit={onCommit}
        onCancel={onCancel}
        onNavigate={onNavigate}
      />
    );
  }

  // Multi-dropdown editor
  if (cellType === "multi-dropdown") {
    const rawOptions = dropdownOptions ?? validation?.options ?? [];
    const options = Array.from(new Set(rawOptions.map(String)));
    const selectedValues = editValue
      ? editValue
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];

    const toggleOption = (option: string) => {
      const newValues = selectedValues.includes(option)
        ? selectedValues.filter((v) => v !== option)
        : [...selectedValues, option];
      setEditValue(newValues.join(", "));
    };

    return (
      <div
        style={{
          position: "absolute",
          left: style?.left ?? 0,
          top: style?.top ?? 0,
          width: Math.max(style?.width ?? 100, 200),
          zIndex: 50,
        }}
        className="bg-background border-primary border-2 shadow-md"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onCancel();
            e.preventDefault();
          } else if (e.key === "Enter" && !e.shiftKey) {
            onCommit(editValue);
            onNavigate?.("down");
            e.preventDefault();
          } else if (e.key === "Tab") {
            onCommit(editValue);
            onNavigate?.(e.shiftKey ? "left" : "right");
            e.preventDefault();
          }
        }}
      >
        <div className="max-h-[180px] overflow-y-auto p-1.5">
          {options.map((option) => (
            <label
              key={option}
              className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
            >
              <Checkbox
                checked={selectedValues.includes(option)}
                onCheckedChange={() => toggleOption(option)}
                disabled={disabled}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end border-t px-2 py-1.5">
          <button
            type="button"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2 py-1 text-xs"
            onClick={() => onCommit(editValue)}
          >
            {t("done")}
          </button>
        </div>
      </div>
    );
  }

  // Date editor: native date input (typed or picked), value kept as YYYY-MM-DD
  if (cellType === "date") {
    return (
      <div style={boxStyle(style)} className="bg-background z-50">
        <input
          ref={inputRef}
          type="date"
          aria-label={t("pickDate")}
          value={ISO_DATE.test(editValue) ? editValue : ""}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn(
            "border-primary bg-background h-full w-full border-2 px-2 text-sm",
            "focus:ring-0 focus:outline-none",
            disabled && "bg-muted cursor-not-allowed opacity-50",
          )}
        />
      </div>
    );
  }

  // Boolean editor (Yes/No dropdown)
  if (cellType === "boolean") {
    const lower = editValue.toLowerCase();
    const current =
      lower === "true" || lower === "1" || lower === "yes"
        ? "true"
        : lower === "false" || lower === "0" || lower === "no"
          ? "false"
          : "";

    return (
      <div style={boxStyle(style)} className="bg-background z-50" onKeyDown={handleSelectKeyDown}>
        <Select
          value={current}
          open={selectOpen}
          onOpenChange={setSelectOpen}
          onValueChange={(val) => {
            setEditValue(val);
            onCommit(val);
          }}
          disabled={disabled}
        >
          <SelectTrigger className="border-primary h-full! w-full rounded-none border-2 focus:ring-0">
            <SelectValue placeholder={t("select")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true" disabled={disabled}>
              {t("yes")}
            </SelectItem>
            <SelectItem value="false" disabled={disabled}>
              {t("no")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Default text/number editor
  return (
    <div style={boxStyle(style)} className="bg-background z-50">
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={disabled}
        className={cn(
          "border-primary bg-background h-full w-full border-2 px-2",
          "focus:ring-0 focus:outline-none",
          "text-sm",
          disabled && "bg-muted cursor-not-allowed opacity-50",
        )}
        inputMode={
          cellType === "number" || cellType === "currency" || cellType === "percentage"
            ? "decimal"
            : "text"
        }
      />
    </div>
  );
}

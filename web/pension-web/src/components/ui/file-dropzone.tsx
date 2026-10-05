"use client";

import { useRef, useState, type DragEvent } from "react";
import { IconFileTextFilled as FileText, IconUpload as Upload, IconX as X } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A drop target that is also a file picker: drag onto it, click it, see what is attached, take it
 * off again. Type and size are checked by the caller (and again by the service).
 */
export function FileDropzone({
  value,
  onChange,
  accept,
  disabled,
  label,
  hint,
  clearLabel,
  className,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  disabled?: boolean;
  /** "Drop a file here, or click to choose": the call to action inside the box. */
  label: string;
  /** Accepted formats / size guidance, under the label. */
  hint?: string;
  clearLabel: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onChange(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    take(e.dataTransfer.files);
  };

  if (value) {
    return (
      /* `min-w-0` on the root as well as the text block: DialogContent is a grid, and a grid item
         defaults to min-width:auto, so a long filename widens the track past the dialog and the
         truncate below never gets the chance to bite. */
      <div
        className={cn(
          "flex min-w-0 items-center gap-3 rounded-lg border p-3",
          className,
        )}
      >
        <span className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-md">
          <FileText className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={value.name}>
            {value.name}
          </p>
          <p className="text-muted-foreground text-xs">
            {(value.size / 1024).toFixed(0)} KB
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label={clearLabel}
          disabled={disabled}
          onClick={() => {
            onChange(null);
            // Clearing the native input too, so re-picking the SAME file still fires onChange.
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-7 text-center transition-colors",
        "hover:border-primary/50 hover:bg-accent/40",
        over && "border-primary bg-primary/5",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <Upload className="text-muted-foreground size-5" />
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => take(e.target.files)}
      />
    </div>
  );
}

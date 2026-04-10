"use client";

import { useState, useRef } from "react";
import { Paperclip, X, Upload, FileText, Image as ImageIcon } from "lucide-react";

interface FileUploadProps {
  onFileUploaded: (url: string, fileName: string) => void;
  label?: string;
  accept?: string;
  maxSizeMB?: number;
  currentUrl?: string;
  onClear?: () => void;
}

export function FileUpload({
  onFileUploaded,
  label = "Attach Receipt / Document",
  accept = ".pdf,.jpg,.jpeg,.png,.webp",
  maxSizeMB = 10,
  currentUrl,
  onClear,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");

    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File too large. Max ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }

      const data = await res.json();
      onFileUploaded(data.url, file.name);
    } catch (err: any) {
      setError(err.message || "Upload failed");
      setFileName("");
    }

    setUploading(false);
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleClear() {
    setFileName("");
    setError("");
    onClear?.();
  }

  const hasFile = currentUrl || fileName;

  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1">
        {hasFile ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <Paperclip className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-sm truncate flex-1">
              {fileName || currentUrl?.split("/").pop() || "Attached file"}
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-red-500 hover:text-red-700 p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {uploading ? "Uploading..." : "Click to attach PDF or image"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}

// Inline attachment badge — shows in tables/lists
interface AttachmentBadgeProps {
  url: string;
  small?: boolean;
}

export function AttachmentBadge({ url, small }: AttachmentBadgeProps) {
  if (!url) return null;

  const isPdf = url.toLowerCase().endsWith(".pdf");
  const Icon = isPdf ? FileText : ImageIcon;
  const label = isPdf ? "PDF" : "Image";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        window.open(url, "_blank");
      }}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium hover:bg-blue-50 hover:border-blue-300 transition-colors ${
        small ? "text-[10px]" : ""
      }`}
      title={`View ${label}`}
    >
      <Icon className={`${small ? "h-2.5 w-2.5" : "h-3 w-3"} text-blue-500`} />
      <span className="text-blue-600">{label}</span>
    </button>
  );
}

// Full attachment viewer modal
interface AttachmentViewerProps {
  url: string;
  onClose: () => void;
}

export function AttachmentViewer({ url, onClose }: AttachmentViewerProps) {
  if (!url) return null;

  const isPdf = url.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="relative max-h-[90vh] max-w-[90vw] bg-white rounded-lg shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-gray-100 px-4 py-2 border-b">
          <div className="flex items-center gap-2 text-sm font-medium">
            {isPdf ? <FileText className="h-4 w-4 text-red-500" /> : <ImageIcon className="h-4 w-4 text-blue-500" />}
            <span>{url.split("/").pop()}</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
            >
              Open Full
            </a>
            <button onClick={onClose} className="rounded p-1 hover:bg-gray-200">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-auto" style={{ maxHeight: "calc(90vh - 48px)", maxWidth: "90vw" }}>
          {isPdf ? (
            <iframe src={url} className="w-full" style={{ height: "80vh", minWidth: "600px" }} />
          ) : (
            <img src={url} alt="Attachment" className="max-w-full h-auto" style={{ maxHeight: "80vh" }} />
          )}
        </div>
      </div>
    </div>
  );
}

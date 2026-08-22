"use client";

import { useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";

interface ImageUploadProps {
  currentImage?: string | null;
  onImageChange: (imageUrl: string | null) => void;
}

export default function ImageUpload({ currentImage, onImageChange }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image size must be less than 5MB.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      onImageChange(data.url);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-zinc-700">Product image</span>
      <div className="flex items-start gap-4">
        <div className="relative">
          {currentImage ? (
            <div className="group relative">
              <img src={currentImage} alt="Product preview" className="h-24 w-24 rounded-lg border border-zinc-300 object-cover" />
              <button
                type="button"
                onClick={() => onImageChange(null)}
                className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50">
              <ImageIcon className="h-6 w-6 text-zinc-400" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:border-zinc-300 disabled:opacity-50 btn-press"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{" "}
            {isUploading ? "Uploading..." : currentImage ? "Change image" : "Upload image"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-xs text-zinc-400">JPG, PNG, or GIF. Max 5MB.</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { api, clearApiCache } from "@/lib/api";
import type { UserBrief } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { useToast } from "../ui/feedback";
import { MenuList, Popover } from "../ui/menu";

const OUTPUT_SIZE = 320; // px, square. Shown at most at 80px (size="xl"), so this is sharp on 4x screens.
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Centre-crop to a square and shrink, so uploads are ~20-40 KB whatever the camera produced. */
async function toSquareDataUrl(file: File): Promise<string> {
  let source: ImageBitmap | HTMLImageElement;
  let w: number;
  let h: number;
  try {
    // Applies the photo's EXIF orientation, so phone pictures are not sideways.
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bmp;
    w = bmp.width;
    h = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      w = img.naturalWidth;
      h = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const side = Math.min(w, h);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the image");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  if ("close" in source) source.close();
  const webp = canvas.toDataURL("image/webp", 0.85);
  // Browsers without WebP encoding silently return PNG; JPEG is much smaller than that.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.88);
}

/**
 * Large profile avatar. When `canEdit`, a camera button lets the person (or HR) upload, change or
 * remove the photo. `onChanged` runs after a successful change so the page can reload.
 */
export function ProfilePhoto({
  user,
  canEdit,
  onChanged,
  className,
}: {
  user: UserBrief;
  canEdit: boolean;
  onChanged: () => void;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const hasPhoto = !!user.photoUrl;

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      clearApiCache(); // every cached list that shows this person's avatar is now stale
      toast.success(done);
      onChanged();
    } catch (e) {
      toast.error("Could not update the photo", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again should still trigger a change
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file", "JPEG, PNG, WebP or HEIC photos work.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      toast.error("That image is too large", "Choose one under 15 MB.");
      return;
    }
    void run(
      async () => api(`/people/${user.id}/photo`, { method: "PUT", json: { dataUrl: await toSquareDataUrl(file) } }),
      hasPhoto ? "Photo updated" : "Photo added",
    );
  };

  return (
    <div className={cn("relative shrink-0 self-start", className)}>
      <Avatar name={user.name} initials={user.initials} src={user.photoUrl} size="xl" className="ring-4 ring-surface" />
      {busy && (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white" role="status">
          <Loader2 size={22} className="animate-spin" />
          <span className="sr-only">Saving photo</span>
        </span>
      )}
      {canEdit && (
        <>
          <input ref={input} type="file" accept="image/*" className="hidden" onChange={onFile} aria-hidden tabIndex={-1} />
          <div className="absolute -bottom-1 -right-1">
            <Popover
              align="left"
              trigger={(_, toggle) => (
                <button
                  type="button"
                  onClick={toggle}
                  disabled={busy}
                  aria-label={hasPhoto ? "Change or remove photo" : "Add photo"}
                  title={hasPhoto ? "Change photo" : "Add photo"}
                  className="grid size-8 place-items-center rounded-full border-2 border-surface bg-primary text-white shadow-card transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  <Camera size={15} />
                </button>
              )}
            >
              {(close) => (
                <MenuList
                  close={close}
                  items={[
                    { label: hasPhoto ? "Change photo" : "Upload photo", icon: ImagePlus, onClick: () => input.current?.click() },
                    ...(hasPhoto
                      ? [{ label: "Remove photo", icon: Trash2, danger: true, onClick: () => void run(() => api(`/people/${user.id}/photo`, { method: "DELETE" }), "Photo removed") }]
                      : []),
                  ]}
                />
              )}
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}

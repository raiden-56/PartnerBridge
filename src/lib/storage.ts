import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError } from "@/lib/actions";
import type { FileRef } from "@/types/db";
import { publicEnv } from "@/lib/env";

/** In local demo mode, storage URLs point at this app (relative), not the in-process placeholder host. */
const browserUrl = (u: string) => (publicEnv.localDemo ? publicEnv.basePath + u.replace(/^https?:\/\/[^/]+/, "") : u);

export const FILE_RULES = {
  image: { maxBytes: 5 * 1024 * 1024, types: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] },
  document: {
    maxBytes: 25 * 1024 * 1024,
    types: [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/plain",
      "text/csv",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
    ],
  },
  verification: { maxBytes: 10 * 1024 * 1024, types: ["application/pdf", "image/png", "image/jpeg", "image/webp"] },
} as const;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

export function validateFile(file: File, rule: keyof typeof FILE_RULES) {
  const r = FILE_RULES[rule];
  if (!file || file.size === 0) throw new UserFacingError("Please choose a file.");
  if (file.size > r.maxBytes) throw new UserFacingError(`File is too large (max ${Math.round(r.maxBytes / 1024 / 1024)} MB).`);
  if (!(r.types as readonly string[]).includes(file.type)) throw new UserFacingError(`Unsupported file type: ${file.type || "unknown"}.`);
  // SVGs can carry scripts; we only allow them in the public image bucket and serve them as images.
}

function safeName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
}

/** Upload using the user's session client so storage RLS policies are enforced. */
export async function uploadFile(
  supabase: SupabaseClient,
  bucket: "public-assets" | "partnership-files" | "verification-docs" | "application-files",
  folder: string,
  file: File,
): Promise<FileRef> {
  const ext = EXT[file.type] ?? safeName(file.name).split(".").pop() ?? "bin";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[storage] upload failed", error);
    throw new UserFacingError("Upload failed. Please check the file and your permissions.");
  }
  return { path, name: safeName(file.name), size: file.size, type: file.type };
}

export function publicUrl(path: string) {
  return browserUrl(createAdminClient().storage.from("public-assets").getPublicUrl(path).data.publicUrl);
}

/** Short-lived signed URL for private files. Callers MUST authorize first. */
export async function signedUrl(bucket: string, path: string, seconds = 120, downloadName?: string) {
  const { data, error } = await createAdminClient()
    .storage.from(bucket)
    .createSignedUrl(path, seconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new UserFacingError("File is unavailable.");
  return browserUrl(data.signedUrl);
}

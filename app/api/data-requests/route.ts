import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, isSameOrigin, requestFingerprint, rateLimitHeaders } from "@/lib/security/request-security";

export const runtime = "nodejs";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const imageTypes = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
function validSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  return type === "image/webp" && Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString() === "WEBP";
}
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) return Response.json({ error: "Use the request form to submit this information." }, { status: 415 });
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 10_600_000) return Response.json({ error: "Each image must be 5 MB or smaller." }, { status: 413 });
  const rate = await checkRateLimit("guest.data_request", requestFingerprint(request), 3, 3600);
  if (!rate.allowed) return Response.json({ error: "Request limit reached. Try again later." }, { status: 429, headers: rateLimitHeaders(rate, 3) });
  const form = await request.formData();
  const requestType = String(form.get("request_type") ?? "");
  const name = String(form.get("requester_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const institution = String(form.get("institution_office") ?? "").trim();
  const purpose = String(form.get("research_title_purpose") ?? "").trim();
  if (!(["data_request", "interview_request"].includes(requestType)) || name.length < 2 || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || institution.length > 240 || purpose.length < 2 || purpose.length > 1000) return Response.json({ error: "Check the request type, contact details, and purpose." }, { status: 400 });
  const files = [ ["identification", form.get("identification")], ["request_letter", form.get("request_letter")] ] as const;
  const validated: Array<{ kind: "identification" | "request_letter"; file: File; bytes: Uint8Array; extension: string }> = [];
  for (const [kind, value] of files) {
    if (!(value instanceof File) || value.size < 1 || value.size > MAX_IMAGE_BYTES || !(value.type in imageTypes)) return Response.json({ error: "Attach a valid ID image and request image (JPG, PNG, or WebP, up to 5 MB each)." }, { status: 400 });
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (!validSignature(value.type, bytes)) return Response.json({ error: "An uploaded image does not match its file type." }, { status: 400 });
    validated.push({ kind, file: value, bytes, extension: imageTypes[value.type as keyof typeof imageTypes] });
  }
  const id = randomUUID();
  const directory = join(process.cwd(), ".private-uploads", "data-requests", id);
  const admin = createAdminClient();
  let created = false;
  try {
    const { data: department } = await admin.schema("core").from("departments").select("id").eq("code", "MPDO").eq("is_active", true).maybeSingle();
    if (!department) return Response.json({ error: "The request service is not configured." }, { status: 503 });
    const { data: row, error } = await admin.schema("research").from("requests").insert({ id, department_id: department.id, submitted_at: new Date().toISOString(), request_type: requestType, requester_name: name, requester_email: email, institution_office: institution || null, research_title_purpose: purpose, status: "received" }).select("id,control_number").single();
    if (error || !row) throw error ?? new Error("Request could not be saved.");
    created = true;
    await mkdir(directory, { recursive: true });
    for (const item of validated) {
      const storagePath = `data-requests/${id}/${item.kind}.${item.extension}`;
      await writeFile(join(process.cwd(), ".private-uploads", storagePath), item.bytes, { flag: "wx", mode: 0o600 });
      const { error: attachmentError } = await admin.schema("research").from("request_attachments").insert({ request_id: row.id, attachment_type: item.kind, storage_path: storagePath, content_type: item.file.type, byte_size: item.file.size });
      if (attachmentError) throw attachmentError;
    }
    await admin.schema("core").from("audit_events").insert({ dataset_id: (await admin.schema("core").from("datasets").select("id").eq("slug","research_requests").single()).data?.id, action: "request.guest_submitted", target_type: "research_request", target_id: row.id, summary: "A guest submitted a data request", metadata: { request_type: requestType, control_number: row.control_number } });
    return Response.json({ control_number: row.control_number }, { headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rate.remaining) } });
  } catch {
    if (created) await admin.schema("research").from("requests").delete().eq("id", id);
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    return Response.json({ error: "The request could not be saved. Please try again." }, { status: 500 });
  }
}
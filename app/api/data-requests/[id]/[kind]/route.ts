import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSupabaseEnv } from "@/lib/supabase/env";
import { isSameOrigin } from "@/lib/security/request-security";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; kind: string }> }) {
 if (!isSameOrigin(request)) return Response.json({error:"Forbidden"},{status:403});
 const {id,kind}=await context.params;
 if(!/^[0-9a-f-]{36}$/i.test(id)||!(kind==="identification"||kind==="request_letter"))return Response.json({error:"Not found"},{status:404});
 const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");if(!token)return Response.json({error:"Sign in required"},{status:401});
 const admin=createAdminClient();const {data:auth}=await admin.auth.getUser(token);if(!auth.user)return Response.json({error:"Sign in required"},{status:401});
 const {url,publishableKey}=getPublicSupabaseEnv();const requester=createClient(url,publishableKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile}=await requester.schema("core").from("profiles").select("role,status").eq("id",auth.user.id).maybeSingle();if(profile?.role!=="dpo"||profile.status!=="active")return Response.json({error:"DPO access required"},{status:403});
 const {data:item,error}=await admin.schema("research").from("request_attachments").select("storage_path,content_type").eq("request_id",id).eq("attachment_type",kind).maybeSingle();if(error||!item)return Response.json({error:"Attachment not found"},{status:404});
 try{const resolved=join(process.cwd(),".private-uploads",item.storage_path);if(!resolved.startsWith(join(process.cwd(),".private-uploads","data-requests")))throw new Error("Invalid path");const bytes=await readFile(resolved);return new Response(bytes,{headers:{"Content-Type":item.content_type,"Content-Length":String(bytes.byteLength),"Content-Disposition":"inline","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"}});}catch{return Response.json({error:"Attachment storage is unavailable on this server."},{status:503});}
}
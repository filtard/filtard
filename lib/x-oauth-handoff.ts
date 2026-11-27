import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/safe-next";
import { getSiteUrl } from "@/lib/site";
import { isXAuthorizeUrl } from "@/lib/x-authorize-url";

const STORAGE_KEY = "filtard-x-oauth";
const HANDOFF_COOKIE = "filtard_x_handoff";
const DONE_COOKIE = "filtard_x_done";
const SESSION_COUNT_COOKIE = "filtard_xs_n";
const SESSION_PART_PREFIX = "filtard_xs_";
const HANDOFF_TTL_SECONDS = 10 * 60;
const SESSION_TTL_SECONDS = 2 * 60;
const COOKIE_CHUNK = 3200;
const MAX_CHUNKS = 8;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HandedSession = {
  access_token: string;
  refresh_token: string;
  next: string;
};

type HandoffRow = {
  code_verifier: string | null;
  flow_id: string | null;
  next_path: string;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function cookieSecure(request: NextRequest): boolean {
  return request.nextUrl.protocol === "https:";
}

function cookieOptions(request: NextRequest, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(request),
    path: "/",
    maxAge,
  };
}

export function callbackOrigin(request: NextRequest): string {
  const origin = request.nextUrl.origin;
  if (
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:")
  ) {
    return origin;
  }
  return getSiteUrl();
}

function adminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase service role is not configured");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    store,
    storage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
}

function authClient(storage: ReturnType<typeof memoryStorage>["storage"]) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase URL or anon key is not set");
  }
  return createClient(supabaseUrl, anonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      skipAutoInitialize: true,
      storageKey: STORAGE_KEY,
      storage,
    },
  });
}

function readVerifier(store: Map<string, string>): string | null {
  const raw = store.get(`${STORAGE_KEY}-code-verifier`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "string" || parsed.length === 0) return null;
    const slash = parsed.indexOf("/");
    return slash === -1 ? parsed : parsed.slice(0, slash);
  } catch {
    return null;
  }
}

function seedVerifier(
  store: Map<string, string>,
  verifier: string,
  flowId: string
) {
  const encoded = JSON.stringify(verifier);
  store.set(`${STORAGE_KEY}-code-verifier`, encoded);
  store.set(`${STORAGE_KEY}-flow-${flowId}-code-verifier`, encoded);
  store.set(`${STORAGE_KEY}-flows-code-verifier`, JSON.stringify([flowId]));
}

export async function createXAuthorizeUrl(redirectTo: string): Promise<{
  url: string;
  flowId: string;
  codeVerifier: string;
}> {
  const { store, storage } = memoryStorage();
  const supabase = authClient(storage);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "x",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    throw new Error(error?.message || "Could not start X login");
  }
  if (!isXAuthorizeUrl(data.url)) {
    throw new Error("X authorize URL was not recognized");
  }

  const flowId = data.flowId ?? "";
  const codeVerifier = readVerifier(store);
  if (!flowId || !codeVerifier) {
    throw new Error("PKCE code verifier was not captured");
  }

  const rebuilt = new Map<string, string>();
  seedVerifier(rebuilt, codeVerifier, flowId);
  if (rebuilt.size !== store.size) {
    throw new Error("PKCE verifier storage did not round-trip");
  }
  for (const [key, value] of store) {
    if (rebuilt.get(key) !== value) {
      throw new Error("PKCE verifier storage did not round-trip");
    }
  }

  return { url: data.url, flowId, codeVerifier };
}

export async function startXHandoff(
  request: NextRequest,
  redirect: string | null | undefined
): Promise<{ url: string; id: string }> {
  const id = crypto.randomUUID();
  const nextPath = safeNextPath(redirect);
  const redirectTo = new URL("/auth/callback", callbackOrigin(request));
  redirectTo.searchParams.set("handoff", id);

  const started = await createXAuthorizeUrl(redirectTo.toString());
  const admin = adminClient();
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_SECONDS * 1000).toISOString();

  const { error } = await admin.from("auth_oauth_handoffs").insert({
    id,
    code_verifier: started.codeVerifier,
    flow_id: started.flowId,
    next_path: nextPath,
    status: "pending",
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { url: started.url, id };
}

async function claimForExchange(id: string): Promise<HandoffRow | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("auth_oauth_handoffs")
    .update({ status: "exchanging" })
    .eq("id", id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("code_verifier, flow_id, next_path")
    .maybeSingle();

  if (error || !data?.code_verifier || !data.flow_id) return null;
  return data as HandoffRow;
}

async function deleteIfExpired(id: string): Promise<void> {
  const admin = adminClient();
  await admin
    .from("auth_oauth_handoffs")
    .delete()
    .eq("id", id)
    .lte("expires_at", new Date().toISOString());
}

async function exchangeCode(
  code: string,
  row: HandoffRow
): Promise<HandedSession | null> {
  if (!row.code_verifier || !row.flow_id) return null;
  const { store, storage } = memoryStorage();
  seedVerifier(store, row.code_verifier, row.flow_id);

  const supabase = authClient(storage);
  const { data, error } = await supabase.auth.exchangeCodeForSession(code, {
    flowId: row.flow_id,
  });

  if (error || !data.session?.access_token || !data.session.refresh_token) {
    if (error) console.error("X code exchange failed:", error.message);
    return null;
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    next: safeNextPath(row.next_path),
  };
}

async function markComplete(id: string, session: HandedSession): Promise<boolean> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("auth_oauth_handoffs")
    .update({
      status: "complete",
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      next_path: session.next,
      code_verifier: null,
      flow_id: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "exchanging")
    .select("id")
    .maybeSingle();

  return !error && !!data;
}

export async function deleteHandoff(id: string): Promise<void> {
  if (!isUuid(id)) return;
  const admin = adminClient();
  await admin.from("auth_oauth_handoffs").delete().eq("id", id);
}

async function claimComplete(id: string): Promise<HandedSession | null> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("auth_oauth_handoffs")
    .delete()
    .eq("id", id)
    .eq("status", "complete")
    .gt("expires_at", new Date().toISOString())
    .select("access_token, refresh_token, next_path")
    .maybeSingle();

  if (error || !data?.access_token || !data.refresh_token) return null;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    next: safeNextPath(data.next_path),
  };
}

function idsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function handoffCookieId(request: NextRequest): string | null {
  const value = request.cookies.get(HANDOFF_COOKIE)?.value ?? "";
  return isUuid(value) ? value : null;
}

export function setHandoffCookie(
  response: NextResponse,
  request: NextRequest,
  id: string
) {
  response.cookies.set(
    HANDOFF_COOKIE,
    id,
    cookieOptions(request, HANDOFF_TTL_SECONDS)
  );
}

export function clearHandoffCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(HANDOFF_COOKIE, "", cookieOptions(request, 0));
}

function doneCookieId(request: NextRequest): string | null {
  const value = request.cookies.get(DONE_COOKIE)?.value ?? "";
  return isUuid(value) ? value : null;
}

function setDoneCookie(
  response: NextResponse,
  request: NextRequest,
  id: string
) {
  response.cookies.set(
    DONE_COOKIE,
    id,
    cookieOptions(request, HANDOFF_TTL_SECONDS)
  );
}

function writeSessionCookies(
  response: NextResponse,
  request: NextRequest,
  session: HandedSession
) {
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url"
  );
  const parts: string[] = [];
  for (let i = 0; i < encoded.length; i += COOKIE_CHUNK) {
    parts.push(encoded.slice(i, i + COOKIE_CHUNK));
  }
  if (parts.length === 0 || parts.length > MAX_CHUNKS) return false;

  const opts = cookieOptions(request, SESSION_TTL_SECONDS);
  response.cookies.set(SESSION_COUNT_COOKIE, String(parts.length), opts);
  parts.forEach((part, index) => {
    response.cookies.set(`${SESSION_PART_PREFIX}${index}`, part, opts);
  });
  return true;
}

export function readSessionCookies(request: NextRequest): HandedSession | null {
  const count = Number(request.cookies.get(SESSION_COUNT_COOKIE)?.value ?? "");
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;

  let encoded = "";
  for (let i = 0; i < count; i++) {
    const part = request.cookies.get(`${SESSION_PART_PREFIX}${i}`)?.value;
    if (!part) return null;
    encoded += part;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as Partial<HandedSession>;
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      next: safeNextPath(parsed.next),
    };
  } catch {
    return null;
  }
}

export function clearSessionCookies(response: NextResponse, request: NextRequest) {
  const opts = cookieOptions(request, 0);
  const count = Number(request.cookies.get(SESSION_COUNT_COOKIE)?.value ?? "");
  const n =
    Number.isInteger(count) && count > 0 && count <= MAX_CHUNKS
      ? count
      : MAX_CHUNKS;
  response.cookies.set(SESSION_COUNT_COOKIE, "", opts);
  for (let i = 0; i < n; i++) {
    response.cookies.set(`${SESSION_PART_PREFIX}${i}`, "", opts);
  }
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function returnRedirect(request: NextRequest, failed: boolean) {
  const dest = new URL("/auth/inapp/return", request.url);
  if (failed) dest.searchParams.set("error", "1");
  else dest.searchParams.set("ok", "1");
  return noStore(NextResponse.redirect(dest));
}

export async function handleXHandoffCallback(request: NextRequest) {
  const handoffId = request.nextUrl.searchParams.get("handoff") ?? "";
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");

  if (!isUuid(handoffId)) {
    return returnRedirect(request, true);
  }

  if (oauthError || !code) {
    await deleteHandoff(handoffId);
    return returnRedirect(request, true);
  }

  const row = await claimForExchange(handoffId);
  if (!row) {
    await deleteIfExpired(handoffId);
    if (idsMatch(doneCookieId(request) ?? "", handoffId)) {
      return returnRedirect(request, false);
    }
    return returnRedirect(request, true);
  }

  const session = await exchangeCode(code, row);
  if (!session) {
    await deleteHandoff(handoffId);
    return returnRedirect(request, true);
  }

  const saved = await markComplete(handoffId, session);
  if (!saved) {
    await deleteHandoff(handoffId);
    return returnRedirect(request, true);
  }

  const startedHere = idsMatch(handoffCookieId(request) ?? "", handoffId);
  if (!startedHere) {
    const response = returnRedirect(request, false);
    setDoneCookie(response, request, handoffId);
    return response;
  }

  const done = new URL("/auth/inapp/done", request.url);
  const response = noStore(NextResponse.redirect(done));
  writeSessionCookies(response, request, session);
  return response;
}

export async function pollXHandoff(request: NextRequest) {
  const id = handoffCookieId(request);
  if (!id) {
    return noStore(NextResponse.json({ status: "idle" }));
  }

  const admin = adminClient();
  const { data, error } = await admin
    .from("auth_oauth_handoffs")
    .select("status, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return noStore(NextResponse.json({ status: "none" }));
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await deleteHandoff(id);
    const response = noStore(NextResponse.json({ status: "none" }));
    clearHandoffCookie(response, request);
    return response;
  }

  if (data.status === "pending" || data.status === "exchanging") {
    return noStore(NextResponse.json({ status: "pending" }));
  }

  if (data.status !== "complete") {
    return noStore(NextResponse.json({ status: "none" }));
  }

  const session = await claimComplete(id);
  if (!session) {
    const { data: stillThere } = await admin
      .from("auth_oauth_handoffs")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (stillThere) {
      return noStore(NextResponse.json({ status: "pending" }));
    }
    const response = noStore(NextResponse.json({ status: "none" }));
    clearHandoffCookie(response, request);
    return response;
  }

  const response = noStore(
    NextResponse.json({
      status: "complete",
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      next: session.next,
    })
  );
  clearHandoffCookie(response, request);
  clearSessionCookies(response, request);
  return response;
}

export async function claimSessionCookies(request: NextRequest) {
  const fromCookies = readSessionCookies(request);
  const id = handoffCookieId(request);

  if (fromCookies) {
    if (id) await deleteHandoff(id);
    const response = noStore(
      NextResponse.json({
        access_token: fromCookies.access_token,
        refresh_token: fromCookies.refresh_token,
        next: fromCookies.next,
      })
    );
    clearSessionCookies(response, request);
    clearHandoffCookie(response, request);
    return response;
  }

  if (!id) {
    return noStore(
      NextResponse.json({ error: "No session" }, { status: 401 })
    );
  }

  const session = await claimComplete(id);
  if (!session) {
    return noStore(
      NextResponse.json({ error: "No session" }, { status: 401 })
    );
  }

  const response = noStore(NextResponse.json(session));
  clearHandoffCookie(response, request);
  clearSessionCookies(response, request);
  return response;
}

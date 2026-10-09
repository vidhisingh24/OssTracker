import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@contrib/core/env";

export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  if (!getEnv().authEnabled)
    return NextResponse.json({ error: "GitHub OAuth is not configured" }, { status: 404 });
  const { handlers } = await import("@/server/auth");
  return req.method === "POST" ? handlers.POST(req) : handlers.GET(req);
}

export { handler as GET, handler as POST };

import { NextResponse } from "next/server";
import { getPublicAppSettings } from "@/lib/settings";

/** Public, non-sensitive settings for auth / guest UI. */
export async function GET() {
  return NextResponse.json({ settings: getPublicAppSettings() });
}

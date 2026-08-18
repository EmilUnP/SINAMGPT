import { NextResponse } from "next/server";
import { getGuestUsage } from "@/lib/guest";
import { clientIp } from "@/lib/rate-limit";
import {
  getEnabledModels,
  getGuestEnabledSetting,
  getGuestMaxCharsSetting,
} from "@/lib/settings";

export async function GET(request: Request) {
  try {
    const guestEnabled = getGuestEnabledSetting();
    if (!guestEnabled) {
      return NextResponse.json({
        models: [],
        defaultModel: "",
        usage: null,
        unlimited: false,
        guestEnabled: false,
        guestMaxMessageChars: getGuestMaxCharsSetting(),
      });
    }

    const [{ models, defaultModel }, usage] = await Promise.all([
      getEnabledModels(),
      getGuestUsage(clientIp(request)),
    ]);
    return NextResponse.json({
      models,
      defaultModel,
      usage,
      unlimited: false,
      guestEnabled: true,
      guestMaxMessageChars: getGuestMaxCharsSetting(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load models";
    return NextResponse.json({ error: message, models: [], usage: null }, {
      status: 503,
    });
  }
}

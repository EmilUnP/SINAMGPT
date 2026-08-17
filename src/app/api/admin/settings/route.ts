import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  getAppSettings,
  setDefaultModelSetting,
  setFastModelSetting,
  setGuestDailyLimitSetting,
  setGuestEnabledSetting,
  setGuestHistoryLimitSetting,
  setGuestMaxCharsSetting,
  setNumPredictSetting,
  setRegistrationEnabledSetting,
  setSmartModelSetting,
  setTemperatureSetting,
  setTopPSetting,
  setUserHistoryLimitSetting,
  setUserMaxCharsSetting,
  setAppFeatureFlags,
} from "@/lib/settings";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ settings: getAppSettings() });
}

const patchSchema = z.object({
  guestEnabled: z.boolean().optional(),
  guestDailyLimit: z.number().int().min(0).max(1000).optional(),
  guestMaxMessageChars: z.number().int().min(100).max(20000).optional(),
  guestHistoryLimit: z.number().int().min(0).max(40).optional(),
  registrationEnabled: z.boolean().optional(),
  defaultModel: z.string().trim().max(120).optional(),
  fastModel: z.string().trim().max(120).optional(),
  smartModel: z.string().trim().max(120).optional(),
  userMaxMessageChars: z.number().int().min(500).max(32000).optional(),
  userHistoryLimit: z.number().int().min(0).max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  numPredict: z.number().int().min(-1).max(8192).optional(),
  topP: z.number().min(0.05).max(1).optional(),
  developerApiEnabled: z.boolean().optional(),
  devLabEnabled: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const d = parsed.data;
  if (d.guestEnabled !== undefined) setGuestEnabledSetting(d.guestEnabled);
  if (d.guestDailyLimit !== undefined) {
    setGuestDailyLimitSetting(d.guestDailyLimit);
  }
  if (d.guestMaxMessageChars !== undefined) {
    setGuestMaxCharsSetting(d.guestMaxMessageChars);
  }
  if (d.guestHistoryLimit !== undefined) {
    setGuestHistoryLimitSetting(d.guestHistoryLimit);
  }
  if (d.registrationEnabled !== undefined) {
    setRegistrationEnabledSetting(d.registrationEnabled);
  }
  if (d.defaultModel !== undefined) setDefaultModelSetting(d.defaultModel);
  if (d.fastModel !== undefined) setFastModelSetting(d.fastModel);
  if (d.smartModel !== undefined) setSmartModelSetting(d.smartModel);
  if (d.userMaxMessageChars !== undefined) {
    setUserMaxCharsSetting(d.userMaxMessageChars);
  }
  if (d.userHistoryLimit !== undefined) {
    setUserHistoryLimitSetting(d.userHistoryLimit);
  }
  if (d.temperature !== undefined) setTemperatureSetting(d.temperature);
  if (d.numPredict !== undefined) setNumPredictSetting(d.numPredict);
  if (d.topP !== undefined) setTopPSetting(d.topP);
  if (
    d.developerApiEnabled !== undefined ||
    d.devLabEnabled !== undefined
  ) {
    setAppFeatureFlags({
      ...(d.developerApiEnabled !== undefined
        ? { developerApi: d.developerApiEnabled }
        : {}),
      ...(d.devLabEnabled !== undefined ? { devLab: d.devLabEnabled } : {}),
    });
  }

  return NextResponse.json({ settings: getAppSettings() });
}

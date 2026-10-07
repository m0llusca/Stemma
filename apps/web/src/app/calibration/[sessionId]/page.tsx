import { redirect } from "next/navigation";
import { requirePagePermission } from "@/lib/page-permission";

const INVALID_SESSION_TOKENS = new Set(["undefined", "null"]);

export default async function CalibrationSessionAliasPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  await requirePagePermission("calibration:manage");
  const { sessionId } = await params;
  const token = sessionId.trim();

  if (!token || INVALID_SESSION_TOKENS.has(token)) {
    redirect("/calibration");
  }

  redirect(`/calibration?session=${encodeURIComponent(token)}`);
}

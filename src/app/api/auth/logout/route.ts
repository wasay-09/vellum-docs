import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/errors";
import { endSession } from "@/lib/session";

export const POST = withErrorHandling(async () => {
  await endSession();
  return new NextResponse(null, { status: 204 });
});

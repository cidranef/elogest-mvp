import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { readCommercialMaterial } from "@/lib/commercial-materials";

type Context = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const url = new URL(request.url);
  const versionId = url.searchParams.get("versionId");

  const version = await db.commercialMaterialVersion.findFirst({
    where: {
      commercialMaterialId: id,
      ...(versionId ? { id: versionId } : {}),
    },
    orderBy: { versionNumber: "desc" },
  });

  if (!version?.fileKey || !version.fileName) {
    return NextResponse.json(
      { error: "Esta versão não possui arquivo." },
      { status: 404 },
    );
  }

  const object = await readCommercialMaterial(version.fileKey);
  const bytes = object.Body
    ? await object.Body.transformToByteArray()
    : new Uint8Array();

  const forwarded =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  await db.commercialMaterialDownloadLog.create({
    data: {
      commercialMaterialId: id,
      commercialMaterialVersionId: version.id,
      downloadedByUserId: auth.authUser.id,
      ipAddress: forwarded,
      userAgent: request.headers.get("user-agent"),
    },
  });

  const responseBody = Uint8Array.from(bytes).buffer;

  return new NextResponse(responseBody, {
    headers: {
      "Content-Type": version.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
        version.fileName,
      )}`,
      "Cache-Control": "private, no-store",
    },
  });
}

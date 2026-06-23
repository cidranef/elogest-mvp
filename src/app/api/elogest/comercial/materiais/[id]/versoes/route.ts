import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import { detectFileType, sha256, uploadCommercialMaterial } from "@/lib/commercial-materials";

type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: Context) {
  const auth = await requireEloGestSuperAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await context.params;
  const material = await db.commercialMaterial.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: "Material não encontrado." }, { status: 404 });
  const form = await request.formData();
  const content = String(form.get("content") || "").trim() || null;
  const versionLabel = String(form.get("versionLabel") || "").trim();
  const changeNotes = String(form.get("changeNotes") || "").trim() || null;
  const file = form.get("file");
  if (!content && !(file instanceof File && file.size > 0)) {
    return NextResponse.json({ error: "Informe um conteúdo on-line ou selecione um arquivo." }, { status: 400 });
  }
  const versionNumber = material.currentVersionNumber + 1;
  let fileData: {
    fileType: ReturnType<typeof detectFileType>;
    fileKey: string;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    checksumSha256: string;
  } | undefined;
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const key = `comercial/materiais/${material.id}/v${versionNumber}/${Date.now()}-${safeName}`;
    await uploadCommercialMaterial({ key, body: buffer, contentType: file.type || "application/octet-stream", fileName: file.name });
    fileData = {
      fileType: detectFileType(file.name), fileKey: key, fileName: file.name,
      mimeType: file.type || "application/octet-stream", fileSizeBytes: file.size,
      checksumSha256: sha256(buffer),
    };
  }
  const created = await db.$transaction(async (tx) => {
    const version = await tx.commercialMaterialVersion.create({ data: {
      commercialMaterialId: material.id,
      versionNumber,
      versionLabel: versionLabel || `v${versionNumber}.0`,
      content,
      changeNotes,
      createdByUserId: auth.authUser.id,
      ...fileData,
    }});
    await tx.commercialMaterial.update({ where: { id: material.id }, data: {
      currentVersionNumber: versionNumber,
      updatedByUserId: auth.authUser.id,
    }});
    return version;
  });
  return NextResponse.json({ ok: true, item: created }, { status: 201 });
}

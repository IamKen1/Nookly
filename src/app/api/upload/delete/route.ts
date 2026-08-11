import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getSessionFromRequest } from "@/lib/session";

export async function DELETE(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const publicId = searchParams.get("publicId");
  if (!publicId) return NextResponse.json({ error: "publicId is required." }, { status: 400 });

  if (!publicId.startsWith(`nookly/${session.tenantId}/`)) {
    return NextResponse.json({ error: "You don't have permission to delete this image." }, { status: 403 });
  }

  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result === "ok" || result.result === "not found") {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Failed to delete image." }, { status: 400 });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Failed to delete image." }, { status: 500 });
  }
}

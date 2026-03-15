import { NextRequest, NextResponse } from "next/server";
import {
  loadConversationMessages,
  updateConversationTitle,
} from "@/lib/chat-persistence";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const messages = await loadConversationMessages(id);
  return NextResponse.json({ data: messages });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const title = typeof body.title === "string" ? body.title.slice(0, 500) : null;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  await updateConversationTitle(id, title);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { listConversations } from "@/lib/chat-persistence";

export async function GET() {
  const conversations = await listConversations();
  return NextResponse.json({ data: conversations });
}

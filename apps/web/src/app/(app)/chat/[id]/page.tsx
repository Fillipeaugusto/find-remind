import type { Metadata } from "next";
import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = { title: "Chat" };

export default async function ConversationPage({ params }: PageProps<"/chat/[id]">) {
  const { id } = await params;
  return <ChatView id={id} />;
}

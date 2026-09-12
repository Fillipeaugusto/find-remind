import type { Metadata } from "next";
import { NewChat } from "@/components/chat/new-chat";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage() {
  return <NewChat />;
}

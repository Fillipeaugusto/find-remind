import type { Metadata } from "next";
import { AiSettingsView } from "@/components/ai/ai-settings-view";

export const metadata: Metadata = { title: "Inteligência artificial" };

export default function AiSettingsPage() {
  return <AiSettingsView />;
}

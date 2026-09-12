import type { Metadata } from "next";
import { ReminderDetail } from "@/components/reminders/reminder-detail";

export const metadata: Metadata = { title: "Lembrete" };

export default async function ReminderPage({ params }: PageProps<"/reminders/[id]">) {
  const { id } = await params;
  return <ReminderDetail id={id} />;
}

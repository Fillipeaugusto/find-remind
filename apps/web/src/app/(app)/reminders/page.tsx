import type { Metadata } from "next";
import { Suspense } from "react";
import { RemindersView } from "@/components/reminders/reminders-view";

export const metadata: Metadata = { title: "Lembretes" };

export default function RemindersPage() {
  return (
    <Suspense>
      <RemindersView />
    </Suspense>
  );
}

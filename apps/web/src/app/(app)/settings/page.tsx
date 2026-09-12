import type { Metadata } from "next";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = { title: "Perfil" };

export default function SettingsPage() {
  return <ProfileForm />;
}

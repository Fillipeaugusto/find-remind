import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <PageContainer>
      <PageHeader title="Configurações" description="Sua conta e os modelos de IA que o app pode usar." />
      <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:gap-10">
        <aside className="lg:w-56 lg:shrink-0">
          <SettingsNav />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PageContainer>
  );
}

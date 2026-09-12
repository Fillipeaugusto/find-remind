export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-1 flex-col lg:h-dvh">{children}</div>;
}

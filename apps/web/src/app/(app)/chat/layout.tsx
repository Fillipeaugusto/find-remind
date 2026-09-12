// A página inteira rola (o composer fica sticky no rodapé); a altura mínima
// só garante que a tela de nova conversa fique centralizada.
export default function ChatLayout({ children }: LayoutProps<"/chat">) {
  return <div className="flex min-h-[calc(100dvh-3.5rem)] flex-1 flex-col lg:min-h-dvh">{children}</div>;
}

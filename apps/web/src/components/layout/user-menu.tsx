"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "cn";
import { ChevronsUpDownIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useMe } from "@/hooks/use-me";
import { signOut } from "@/lib/auth-client";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { data: me } = useMe();
  const router = useRouter();
  const { theme = "system", setTheme } = useTheme();

  if (!me) {
    return (
      <div className="flex h-11 items-center gap-2.5 overflow-hidden px-1.5">
        <Skeleton className="size-7 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </div>
    );
  }

  const logout = async () => {
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  const trigger = (
    <DropdownMenuTrigger
      aria-label={collapsed ? me.name : undefined}
      className="flex h-11 w-full items-center gap-2.5 overflow-hidden rounded-lg px-1.5 text-left transition-colors hover:bg-muted/70 data-popup-open:bg-muted"
    >
      <Avatar className="size-7 shrink-0">
        {me.image ? <AvatarImage src={me.image} alt="" /> : null}
        <AvatarFallback className="text-[11px]">{initials(me.name)}</AvatarFallback>
      </Avatar>
      <span className={cn("min-w-0 flex-1 transition-opacity duration-200", collapsed && "opacity-0")}>
        <span className="block truncate text-sm font-medium">{me.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{me.email}</span>
      </span>
      <ChevronsUpDownIcon
        className={cn("size-4 shrink-0 text-muted-foreground transition-opacity duration-200", collapsed && "opacity-0")}
      />
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent side="right" sideOffset={10}>
            {me.name}
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value)}>
          <DropdownMenuLabel>Tema</DropdownMenuLabel>
          <DropdownMenuRadioItem value="light">
            <SunIcon /> Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon /> Escuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon /> Sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <UserIcon /> Perfil
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={logout}>
          <LogOutIcon /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

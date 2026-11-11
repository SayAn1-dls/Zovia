"use client";

import { Building2, LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useSession } from "@/components/session/session-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { accountNav, routes } from "@/lib/navigation";

/** Avatar button + account menu for a signed-in user. Renders nothing when signed out. */
export function UserMenu() {
  const session = useSession();
  const router = useRouter();
  if (session.status !== "signed_in") return null;
  const { user, signOut } = session;
  const name = user.display_name?.trim() || "Your account";

  async function handleSignOut() {
    if (!signOut) return;
    try {
      await signOut();
      router.push(routes.home);
      router.refresh();
    } catch {
      toast.error("Could not sign you out. Please try again.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex size-11 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar size="lg">
          {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
          <AvatarFallback className="bg-gradient-brand text-sm font-semibold text-white">
            {initials(user.display_name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate text-sm font-semibold text-foreground">
            {name}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {accountNav.map((item) => (
          <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
            <item.icon className="size-4 text-muted-foreground" aria-hidden />
            {item.label}
          </DropdownMenuItem>
        ))}
        {session.hasRole("owner") ? (
          <DropdownMenuItem render={<Link href={routes.owner} />}>
            <Building2 className="size-4 text-muted-foreground" aria-hidden />
            Owner portal
          </DropdownMenuItem>
        ) : null}
        {session.hasRole("admin") || session.hasRole("moderator") ? (
          <DropdownMenuItem render={<Link href={routes.admin} />}>
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
            Admin
          </DropdownMenuItem>
        ) : null}
        {signOut ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="size-4 text-muted-foreground" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

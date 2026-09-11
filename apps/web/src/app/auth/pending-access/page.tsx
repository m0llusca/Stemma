import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { DemoAccountMenu } from "@/components/auth/demo-role-switch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { getDemoRoleSwitcher } from "@/lib/auth/demo-switcher";
import { roleHomePath } from "@/lib/auth/role-home";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";
import { roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PendingAccessPage() {
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  if (!user) {
    redirect("/auth/login?returnTo=/auth/pending-access");
  }

  if (user.role !== "VIEWER") {
    redirect(roleHomePath(user.role, { name: user.name }));
  }

  const demoSwitcher = await getDemoRoleSwitcher(user);

  return (
    <section
      className={cn(
        "auth-shell flex min-h-dvh items-center justify-center bg-background p-6 sm:p-10"
      )}
    >
      <Card className="w-full max-w-[408px]">
        <CardHeader className="gap-2">
          <div className="mb-1 flex items-center gap-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ShieldAlert className="size-4" aria-hidden />
            </span>
            <span className="text-sm font-medium tracking-tight">Stemma</span>
          </div>
          <CardTitle role="heading" aria-level={1}>Доступ ещё не выдан</CardTitle>
          <CardDescription>
            Ваша учётная запись есть в системе, но права на продукт пока не назначены.
            Обратитесь к администратору рабочего пространства, чтобы получить роль.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="text-foreground">Email:</span> {user.email}
          </p>
          <p>
            <span className="text-foreground">Роль:</span> {roleLabels[user.role]}
          </p>
        </CardContent>
        <CardFooter className="flex-col gap-2">
          {demoSwitcher ? (
            <DemoAccountMenu
              switcher={demoSwitcher}
              logout={
                <form action="/auth/logout" method="post" className="px-1.5 pb-1">
                  <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                    Выйти
                  </Button>
                </form>
              }
            />
          ) : (
            <Button render={<Link href="/auth/logout" />} nativeButton={false} variant="outline" className="w-full">
              Выйти
            </Button>
          )}
        </CardFooter>
      </Card>
    </section>
  );
}

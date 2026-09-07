import { LogIn } from "lucide-react";
import Link from "next/link";
import { sessionRequiredMessage } from "@/lib/api/user-facing-errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";

export function UnauthorizedScreen({ loginHref = "/auth/login" }: { loginHref?: string }) {
  return (
    <section className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Alert className="border-0 bg-transparent">
            <LogIn />
            <AlertTitle>Нужно войти</AlertTitle>
            <AlertDescription>{sessionRequiredMessage}</AlertDescription>
          </Alert>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button render={<Link href={loginHref} />} nativeButton={false}>
            Войти
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

import { ShieldOff } from "lucide-react";
import Link from "next/link";
import { permissionDeniedMessage } from "@/lib/api/user-facing-errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";

export function ForbiddenScreen({ homeHref = "/" }: { homeHref?: string }) {
  return (
    <section className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Alert className="border-0 bg-transparent">
            <ShieldOff />
            <AlertTitle>Недостаточно прав</AlertTitle>
            <AlertDescription>
              {permissionDeniedMessage} Этот раздел недоступен для вашей роли. Если доступ нужен для
              работы, обратитесь к администратору.
            </AlertDescription>
          </Alert>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button render={<Link href={homeHref} />} nativeButton={false}>
            Вернуться
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

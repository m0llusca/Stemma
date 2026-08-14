"use client";

import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Alert variant="destructive" className="border-0 bg-transparent">
            <AlertCircle />
            <AlertTitle>Что-то пошло не так</AlertTitle>
            <AlertDescription>
              Не удалось загрузить раздел. Попробуйте повторить действие. Если ошибка повторяется,
              обновите страницу или вернитесь позже.
            </AlertDescription>
          </Alert>
        </CardHeader>
        <CardContent className="flex justify-center">
          {error.digest ? (
            <p className="text-xs text-muted-foreground">Код ошибки: {error.digest}</p>
          ) : null}
        </CardContent>
        <CardFooter className="justify-center">
          <Button type="button" onClick={() => reset()}>
            Попробовать снова
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

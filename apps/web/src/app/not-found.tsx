import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <section className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Страница не найдена</EmptyTitle>
          <EmptyDescription>
            Запрошенная страница не существует или была перемещена. Вернитесь на дашборд и продолжите
            работу оттуда.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/" />} nativeButton={false}>
            На дашборд
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
}

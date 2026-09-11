import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from "@/components/ui/empty";

export function NotFoundScreen({ homeHref = "/" }: { homeHref?: string }) {
  return (
    <section className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyTitle role="heading" aria-level={1}>Страница не найдена</EmptyTitle>
          <EmptyDescription>
            Запрошенная страница не существует или была перемещена. Вернитесь на главную и продолжите
            работу оттуда.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href={homeHref} />} nativeButton={false}>
            На главную
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
}

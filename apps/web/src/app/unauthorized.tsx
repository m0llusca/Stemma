import { UnauthorizedScreen } from "@/components/auth/unauthorized-screen";
import { getRequestPathname } from "@/lib/auth/request-path";
import { sanitizeReturnTo } from "@/lib/auth/role-home";

export default async function Unauthorized() {
  const pathname = await getRequestPathname();
  const returnTo = pathname ? sanitizeReturnTo(pathname) : "/";
  const loginHref =
    returnTo && returnTo !== "/"
      ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}`
      : "/auth/login";

  return <UnauthorizedScreen loginHref={loginHref} />;
}

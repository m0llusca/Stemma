import { ForbiddenScreen } from "@/components/auth/forbidden-screen";
import { roleHomePath } from "@/lib/auth/role-home";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";

export default async function Forbidden() {
  let homeHref = "/";

  try {
    const user = await getCurrentUser();
    homeHref = roleHomePath(user.role, { name: user.name });
  } catch (error) {
    if (!(error instanceof AuthRequiredError)) {
      throw error;
    }
  }

  return <ForbiddenScreen homeHref={homeHref} />;
}

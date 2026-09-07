import { NotFoundScreen } from "@/components/auth/not-found-screen";
import { roleHomePath } from "@/lib/auth/role-home";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";

export default async function NotFound() {
  let homeHref = "/";

  try {
    const user = await getCurrentUser();
    homeHref = roleHomePath(user.role, { name: user.name });
  } catch (error) {
    if (!(error instanceof AuthRequiredError)) {
      throw error;
    }
  }

  return <NotFoundScreen homeHref={homeHref} />;
}

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentUserCookieName } from "@/lib/current-user";
import { prisma } from "@/lib/db";

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function switchCurrentUser(formData: FormData) {
  const userId = stringField(formData, "userId");
  const returnTo = stringField(formData, "returnTo") || "/reviews";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  });

  if (!user) {
    throw new Error("Пользователь не найден.");
  }

  const cookieStore = await cookies();
  cookieStore.set(currentUserCookieName, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  revalidatePath("/");
  redirect(returnTo);
}

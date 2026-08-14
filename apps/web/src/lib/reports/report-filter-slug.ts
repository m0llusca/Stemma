import { createHash } from "node:crypto";

const transliteration: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya"
};

function humanSlugPrefix(value: string) {
  const transliterated = [...value.normalize("NFKC").toLocaleLowerCase("ru-RU")]
    .map((character) => transliteration[character] ?? character)
    .join("");
  return (
    transliterated
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "filter"
  );
}

export function buildReportCatalogSlug(value: string) {
  const normalized = value.trim().normalize("NFKC");
  const suffix = createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 12);
  return `${humanSlugPrefix(normalized)}-${suffix}`;
}

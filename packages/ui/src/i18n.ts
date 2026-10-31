// SPDX-License-Identifier: Apache-2.0

import en from "./locales/en.json";

/** A key in the locale file. */
export type StringKey = keyof typeof en;

/** Values for `{name}` placeholders. */
export type StringParams = Readonly<Record<string, string | number>>;

const plurals = new Intl.PluralRules("en");

function fill(template: string, params: StringParams | undefined): string {
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Looks up a string and fills in its `{name}` placeholders. All text shown to users comes from
 * here (AGENTS.md §4).
 *
 * @param key - Key in `locales/en.json`.
 * @param params - Values for placeholders; a placeholder without a value is left as written.
 * @returns The text.
 */
export function t(key: StringKey, params?: StringParams): string {
  return fill(en[key], params);
}

/**
 * Looks up a string that depends on a count. The locale file holds one entry per plural form,
 * named `<base>.one` and `<base>.other` (more forms for other languages later), and `{count}`
 * is filled in automatically.
 *
 * @param base - The key without its plural suffix.
 * @param count - The number the text is about.
 * @param params - Further placeholder values.
 * @returns The text in the right form.
 */
export function tp(base: PluralBase, count: number, params?: StringParams): string {
  const form = plurals.select(count);
  const key = (form === "one" ? `${base}.one` : `${base}.other`) as StringKey;
  return fill(en[key], { count, ...params });
}

type StripPlural<K> = K extends `${infer B}.one` ? B : K extends `${infer B}.other` ? B : never;

/** Base names of the keys that have plural forms. */
export type PluralBase = StripPlural<StringKey>;

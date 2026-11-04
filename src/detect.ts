// Pure detectors run on each request while crawling, so raw values never need to be stored.

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** Finds an email address in a URL, including percent-encoded ones ("%40"). */
export function containsEmail(text: string): boolean {
  if (EMAIL.test(text)) return true;
  try {
    return EMAIL.test(decodeURIComponent(text));
  } catch {
    return EMAIL.test(text.replace(/%40/gi, "@"));
  }
}

// Query parameter names that carry an identifier for the visitor, browser or ad click.
const ID_PARAM =
  /^(?:_ga|_gid|_gl|gclid|gbraid|wbraid|dclid|fbclid|fbp|fbc|msclkid|ttclid|twclid|li_fat_id|epik|sccid|rdt_cid|cid|uid|user_?id|client_?id|sid|session_?id|vid|visitor_?id|anonymous_?id|anon_?id|device_?id|external_?id|distinct_?id|hjuid)$/i;

// Parameter names that usually carry contact details, sometimes hashed (e.g. Meta's "ud[em]").
const CONTACT_PARAM = /^(?:em|email|e-mail|mail|user_?email|ud\[em\]|ud\[ph\]|ph|phone|tel|fn|ln|first_?name|last_?name)$/i;

export function idParams(keys: string[]): string[] {
  return unique(keys.filter((k) => ID_PARAM.test(k)));
}

export function contactParams(keys: string[]): string[] {
  return unique(keys.filter((k) => CONTACT_PARAM.test(k)));
}

export function queryKeys(url: string): string[] {
  try {
    return unique([...new URL(url).searchParams.keys()]);
  } catch {
    return [];
  }
}

/** Input types and names that suggest a form collects personal information. */
export function personalInputs(inputs: { name: string; type: string }[]): string[] {
  const out = inputs.filter(
    (i) =>
      ["email", "tel", "password"].includes(i.type) ||
      /(?:e-?mail|phone|tel|name|nom|prenom|prénom|address|adresse|postal|zip|birth|naissance|dob)/i.test(i.name),
  );
  return unique(out.map((i) => i.name || i.type));
}

export function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

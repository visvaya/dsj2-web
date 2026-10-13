// What may be shown of the deployment tool's output. The workflow logs of a public repository are public, and
// the tool prints the account's identifier in some messages, so its output is never passed through as it is:
// on success only the identifier of the published version is reported, on failure the output goes out with
// everything that identifies the account removed.

const VERSION_ID_PATTERN = /Version ID:\s*([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i;
// Account and zone identifiers are 32 hexadecimal characters.
const ACCOUNT_LIKE_PATTERN = /\b[0-9a-f]{32}\b/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const MIN_SECRET_LENGTH_CHARS = 8;

// The identifier of the version the tool has just published, or null when its output names none.
export function versionIdOf(output) {
  return VERSION_ID_PATTERN.exec(output)?.[1] ?? null;
}

// The output with the given secret values, anything shaped like an account identifier and e-mail addresses
// replaced. Version identifiers (with dashes) stay: a rollback names them, and they open nothing by themselves.
export function redactOutput(output, secrets) {
  const withoutSecrets = secrets
    .filter((secret) => typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH_CHARS)
    .reduce((text, secret) => text.split(secret).join("[redacted]"), output);
  return withoutSecrets
    .replaceAll(ACCOUNT_LIKE_PATTERN, "[redacted id]")
    .replaceAll(EMAIL_PATTERN, "[redacted e-mail]");
}

import { isAuthorizedPilotBackupKey, PILOT_BACKUP_STORAGE_KEYS } from "./pilot-backup-keys";

export const PILOT_BACKUP_FORMAT = "obrafacil-backup";
export const PILOT_BACKUP_VERSION = 1;

export interface PilotBackupFile {
  format: typeof PILOT_BACKUP_FORMAT;
  version: typeof PILOT_BACKUP_VERSION;
  exportedAt: string;
  app: "ObraFácil";
  /** Only keys that were actually present in `localStorage` at export
   * time — an absent key and `data[key] === undefined` mean the same
   * thing to every store, so nothing is invented here (§7). */
  data: Record<string, unknown>;
}

export type BuildBackupResult =
  | { ok: true; file: PilotBackupFile }
  | { ok: false; error: string };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local time, not UTC — a filename the user can read at a glance. */
export function defaultPilotBackupFilename(date: Date, suffix?: string): string {
  const stamp = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}-${pad2(date.getHours())}${pad2(date.getMinutes())}`;
  return `obrafacil-backup${suffix ? `-${suffix}` : ""}-${stamp}.json`;
}

/**
 * Reads every authorized key straight from `localStorage` and parses
 * it — never touches a store's own read function, so this is exactly
 * what's on disk, with no seed merged in and no domain logic applied.
 * Fails loudly (no partial/silent backup) if any authorized key holds
 * unparseable JSON — see §9 of the gate.
 */
export function buildPilotBackup(): BuildBackupResult {
  if (typeof window === "undefined") {
    return { ok: false, error: "Backup só pode ser gerado no navegador." };
  }

  const data: Record<string, unknown> = {};
  for (const key of Object.keys(PILOT_BACKUP_STORAGE_KEYS)) {
    const raw = window.localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        error: `Não foi possível preparar o backup: os dados de "${key.replace("obrafacil:", "")}" estão corrompidos neste navegador. Nenhum arquivo foi gerado.`,
      };
    }
  }

  return {
    ok: true,
    file: {
      format: PILOT_BACKUP_FORMAT,
      version: PILOT_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      app: "ObraFácil",
      data,
    },
  };
}

/** Pure side effect: serializes `file` and starts a browser download.
 * No network call. */
export function downloadPilotBackup(file: PilotBackupFile, filename: string): void {
  const json = JSON.stringify(file, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export type ValidatePilotBackupResult =
  | { ok: true; file: PilotBackupFile }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * V1–V10 of the PILOT-02 gate, in order — the first failure wins and
 * produces one plain-language message, never a stack trace. Accepts
 * the raw file text (not a parsed object) so JSON syntax errors (V1)
 * are handled in the exact same place as every other validation step.
 */
export function validatePilotBackup(text: string): ValidatePilotBackupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Este arquivo não é um JSON válido. Selecione um arquivo de backup gerado pelo ObraFácil." };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: "Este arquivo não tem o formato de um backup do ObraFácil." };
  }

  if (parsed.format !== PILOT_BACKUP_FORMAT) {
    return { ok: false, error: "Este arquivo não é um backup do ObraFácil." };
  }

  if (typeof parsed.version !== "number") {
    return { ok: false, error: "Este arquivo de backup está incompleto (sem versão)." };
  }
  if (parsed.version > PILOT_BACKUP_VERSION) {
    return {
      ok: false,
      error: "Este backup foi criado por uma versão mais nova do ObraFácil e não pode ser restaurado aqui.",
    };
  }
  if (parsed.version !== PILOT_BACKUP_VERSION) {
    return { ok: false, error: "Este backup usa uma versão de formato que não é mais suportada." };
  }

  if (!isPlainObject(parsed.data)) {
    return { ok: false, error: "Este arquivo de backup está incompleto (sem dados)." };
  }

  for (const key of Object.keys(parsed.data)) {
    if (!isAuthorizedPilotBackupKey(key)) {
      return {
        ok: false,
        error: key.includes("session") || key.includes("auth")
          ? "Este arquivo tenta incluir dados de sessão/login, o que não é permitido em um backup. Restauração cancelada."
          : `Este arquivo contém um dado não reconhecido ("${key}") e não pode ser restaurado.`,
      };
    }
  }

  for (const [key, shape] of Object.entries(PILOT_BACKUP_STORAGE_KEYS)) {
    if (!(key in parsed.data)) continue;
    const value = parsed.data[key];
    const matchesShape = shape === "array" ? Array.isArray(value) : isPlainObject(value);
    if (!matchesShape) {
      return {
        ok: false,
        error: `Os dados de "${key.replace("obrafacil:", "")}" neste backup estão em um formato inesperado. Restauração cancelada.`,
      };
    }
  }

  if (typeof parsed.exportedAt !== "string") {
    return { ok: false, error: "Este arquivo de backup está incompleto (sem data de exportação)." };
  }

  return {
    ok: true,
    file: {
      format: PILOT_BACKUP_FORMAT,
      version: PILOT_BACKUP_VERSION,
      exportedAt: parsed.exportedAt,
      app: "ObraFácil",
      data: parsed.data,
    },
  };
}

export type RestorePilotBackupResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Writes a validated backup straight into `localStorage` — no domain
 * function is called (§15): no `createCustomer`/`createStockAdjustment`
 * etc., so no current business rule re-runs against historical data,
 * no new id is minted, nothing is duplicated. This is a state
 * reconstruction, not a replay.
 *
 * Snapshots every authorized key's raw current value first and
 * attempts a best-effort rollback if any write fails partway —
 * `localStorage` has no real transaction, so this is the closest
 * approximation the browser allows, not a guarantee (documented in
 * the PILOT-02 report, §19).
 */
export function restorePilotBackup(file: PilotBackupFile): RestorePilotBackupResult {
  if (typeof window === "undefined") {
    return { ok: false, error: "Restauração só pode ocorrer no navegador." };
  }

  const authorizedKeys = Object.keys(PILOT_BACKUP_STORAGE_KEYS);
  const snapshot: Record<string, string | null> = {};
  for (const key of authorizedKeys) {
    snapshot[key] = window.localStorage.getItem(key);
  }

  try {
    for (const key of authorizedKeys) {
      if (key in file.data) {
        window.localStorage.setItem(key, JSON.stringify(file.data[key]));
      } else if (snapshot[key] !== null) {
        // Present now, absent from the backup snapshot -> the backup's
        // semantics say "nothing here", so the restore must remove it
        // too, or the result would be a merge, not a restore.
        window.localStorage.removeItem(key);
      }
    }
    return { ok: true };
  } catch {
    for (const key of authorizedKeys) {
      try {
        const previous = snapshot[key];
        if (previous === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, previous);
      } catch {
        // Rollback itself failed for this one key (e.g. storage still
        // full) — nothing more can be done client-side; the pre-restore
        // download already taken is the user's recovery path.
      }
    }
    return {
      ok: false,
      error: "Não foi possível concluir a restauração neste navegador (armazenamento indisponível ou cheio). Os dados anteriores foram restaurados quando possível.",
    };
  }
}

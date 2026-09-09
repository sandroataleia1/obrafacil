"use client";

import { useState, type ChangeEvent } from "react";
import { Download, Eraser } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  buildPilotBackup,
  defaultPilotBackupFilename,
  downloadPilotBackup,
  restorePilotBackup,
  validatePilotBackup,
  type PilotBackupFile,
} from "./pilot-backup";
import { resetPilotTestData } from "./pilot-reset";

function formatExportedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Rede de segurança mínima do piloto (Pilot-Ready "PILOT-02 —
 * Backup/Restore") — exportar/restaurar os dados deste navegador.
 * Nunca chama uma função de domínio (`createCustomer`,
 * `createStockAdjustment`, ...): restaurar é reconstruir o estado
 * persistido, não reexecutar regras atuais sobre dados históricos.
 */
export function BackupPage() {
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedJustNow, setExportedJustNow] = useState(false);

  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validatedFile, setValidatedFile] = useState<PilotBackupFile | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  function handleExport() {
    setExportError(null);
    setExportedJustNow(false);
    const result = buildPilotBackup();
    if (!result.ok) {
      setExportError(result.error);
      return;
    }
    downloadPilotBackup(result.file, defaultPilotBackupFilename(new Date()));
    setExportedJustNow(true);
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset the input so selecting the exact same file again still fires onChange.
    event.target.value = "";

    setValidationError(null);
    setValidatedFile(null);
    setRestoreError(null);
    if (!file) return;

    setSelectedFileName(file.name);
    const text = await file.text();
    const result = validatePilotBackup(text);
    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    setValidatedFile(result.file);
    setConfirmOpen(true);
  }

  function handleCancelRestore() {
    setConfirmOpen(false);
    setValidatedFile(null);
    setSelectedFileName(null);
  }

  function handleConfirmRestore() {
    if (!validatedFile) return;
    setRestoring(true);
    setRestoreError(null);

    // Safety backup of the CURRENT state, started before anything is
    // overwritten — the user's recovery path if the wrong file was chosen.
    const preRestore = buildPilotBackup();
    if (preRestore.ok) {
      downloadPilotBackup(preRestore.file, defaultPilotBackupFilename(new Date(), "before-restore"));
    }

    const result = restorePilotBackup(validatedFile);
    if (!result.ok) {
      setRestoring(false);
      setRestoreError(result.error);
      return;
    }

    // Every store reads from localStorage on mount — a full reload is the
    // simple, reliable way to make all of them reflect the restored data.
    window.location.reload();
  }

  function handleConfirmReset() {
    setResetting(true);

    // Safety backup of the CURRENT state, started before anything is
    // erased — the recovery path if this was triggered by mistake.
    const preReset = buildPilotBackup();
    if (preReset.ok) {
      downloadPilotBackup(preReset.file, defaultPilotBackupFilename(new Date(), "before-reset"));
    }

    resetPilotTestData();
    window.location.reload();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dados e backup</h1>
        <p className="text-sm text-muted-foreground">
          Faça uma cópia dos dados deste navegador para evitar perdas acidentais.
        </p>
      </div>

      <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>Os dados deste piloto ficam armazenados neste navegador.</p>
        <p>Limpar os dados do site/navegador pode apagar essas informações.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Exportar backup</CardTitle>
          <CardDescription>Baixa um arquivo com os dados cadastrados até agora.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button type="button" onClick={handleExport}>
            <Download className="size-4" aria-hidden="true" />
            Exportar backup
          </Button>
          {exportedJustNow ? (
            <p className="text-sm text-primary">Backup gerado. Verifique a pasta de downloads do navegador.</p>
          ) : null}
          {exportError ? <p className="text-sm text-destructive">{exportError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restaurar backup</CardTitle>
          <CardDescription>
            Substitui os dados atuais deste navegador pelos dados de um arquivo de backup.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="backup-file-input" className="text-sm font-medium text-foreground">
              Arquivo de backup (.json)
            </label>
            <input
              id="backup-file-input"
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelected}
              className="block w-full text-sm text-foreground outline-none file:mr-3 file:rounded-lg file:border file:border-border file:bg-card file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground focus-visible:ring-2 focus-visible:ring-ring hover:file:bg-muted"
            />
          </div>
          {selectedFileName && !validationError ? (
            <p className="text-sm text-muted-foreground">Arquivo selecionado: {selectedFileName}</p>
          ) : null}
          {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}
          {restoreError ? <p className="text-sm text-destructive">{restoreError}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Zerar dados de teste</CardTitle>
          <CardDescription>
            Apaga obras, orçamentos, cálculos, compras, estoque e clientes — incluindo os
            exemplos que já vêm no aplicativo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Fornecedores, equipe, catálogo de materiais e financeiro não são afetados.
          </p>
          <Button type="button" variant="outline" onClick={() => setResetConfirmOpen(true)}>
            <Eraser className="size-4" aria-hidden="true" />
            Zerar dados de teste
          </Button>
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) handleCancelRestore();
        }}
        title="Restaurar backup?"
        description="Os dados atuais deste navegador serão substituídos pelos dados do backup selecionado."
        confirmLabel={restoring ? "Restaurando..." : "Restaurar dados"}
        cancelLabel="Cancelar"
        destructive
        disabled={restoring}
        onConfirm={handleConfirmRestore}
      >
        {validatedFile ? (
          <p className="text-xs text-muted-foreground">Backup de {formatExportedAt(validatedFile.exportedAt)}.</p>
        ) : null}
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={resetConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !resetting) setResetConfirmOpen(false);
        }}
        title="Zerar dados de teste?"
        description="Obras, orçamentos, cálculos, compras, estoque e clientes serão apagados, incluindo os exemplos do aplicativo — as telas ficarão vazias. Um backup de segurança será baixado automaticamente antes e pode ser usado para restaurar tudo."
        confirmLabel={resetting ? "Zerando..." : "Zerar dados"}
        cancelLabel="Cancelar"
        destructive
        disabled={resetting}
        onConfirm={handleConfirmReset}
      />
    </div>
  );
}

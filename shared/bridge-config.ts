export function shouldStartCodexBridge(
  isCodex: boolean,
  force: boolean,
  autostart: string | undefined
): boolean {
  return autostart !== "0" && (isCodex || force || autostart === "1");
}

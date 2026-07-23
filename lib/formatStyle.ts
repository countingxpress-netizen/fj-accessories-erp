export function formatStyle(style: string | null | undefined): string {
  if (!style) return "-";
  return style.startsWith("ST-") ? style : `ST-${style}`;
}
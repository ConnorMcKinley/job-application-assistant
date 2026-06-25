export function detectAtsType(host: string): string {
  const h = host.toLowerCase();
  if (h.includes("greenhouse")) return "greenhouse";
  if (h.includes("lever.co")) return "lever";
  if (h.includes("ashbyhq")) return "ashby";
  if (h.includes("workday") || h.includes("myworkdayjobs")) return "workday";
  return "generic";
}

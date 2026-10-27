/**
 * O pedido vem de uma página deste mesmo site? Compara o `Origin` com o `Host` (ou o `X-Forwarded-Host` do túnel). Sem `Origin` (um
 * navegador antigo, uma chamada directa) deixa-se passar: os limites de pedidos é que protegem.
 */
export function veioDoMesmoSite(req: Request): boolean {
  const origem = req.headers.get("origin");
  if (!origem) return true;
  try {
    const hostDaOrigem = new URL(origem).host.toLowerCase();
    const hosts = [req.headers.get("host"), req.headers.get("x-forwarded-host")]
      .filter((h): h is string => !!h)
      .map((h) => h.split(",")[0]!.trim().toLowerCase());
    return hosts.includes(hostDaOrigem);
  } catch {
    return false;
  }
}

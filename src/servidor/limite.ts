// O limite de pedidos: cada resposta da IA custa dinheiro, por isso conta-se por endereço, por dia e para o projecto todo. O módulo não sabe
// onde se guardam as contagens (Postgres, Redis, memória…): recebe uma função `LimitadorDeTaxa` do projecto. Para testes e
// demonstrações há um limitador em memória (por processo).

export type RegraDeTaxa = { limite: number; janelaSegundos: number };
export type ResultadoDeTaxa = { permitido: boolean; repetirEmSegundos: number };

/** Gasta um pedido da `chave` e diz se ainda cabe na regra. Pode lançar erro (o servidor trata como «indisponível»). */
export type LimitadorDeTaxa = (chave: string, regra: RegraDeTaxa) => Promise<ResultadoDeTaxa>;

/** Um limitador por processo (janela deslizante). Não serve a vários servidores, mas serve a um site pequeno e aos testes. */
export function limitadorEmMemoria(agora: () => number = Date.now): LimitadorDeTaxa {
  const pedidos = new Map<string, number[]>();
  return async (chave, regra) => {
    const t = agora();
    const desde = t - regra.janelaSegundos * 1000;
    const recentes = (pedidos.get(chave) ?? []).filter((x) => x > desde);
    if (recentes.length >= regra.limite) {
      pedidos.set(chave, recentes);
      const maisAntigo = recentes[0] ?? t;
      return {
        permitido: false,
        repetirEmSegundos: Math.max(1, Math.ceil((maisAntigo + regra.janelaSegundos * 1000 - t) / 1000)),
      };
    }
    recentes.push(t);
    pedidos.set(chave, recentes);
    return { permitido: true, repetirEmSegundos: 0 };
  };
}

/** O endereço de quem pede (atrás de um túnel ou proxy): `CF-Connecting-IP`, depois `X-Forwarded-For`; sem nada, «desconhecido». */
export function enderecoDoPedido(cabecalhos: Headers): string {
  const cf = cabecalhos.get("cf-connecting-ip")?.trim();
  if (cf) return cf.slice(0, 64);
  const xff = cabecalhos.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (xff) return xff.slice(0, 64);
  return cabecalhos.get("x-real-ip")?.trim().slice(0, 64) || "desconhecido";
}

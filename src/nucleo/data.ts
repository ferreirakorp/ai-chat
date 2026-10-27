// A data e a hora a que uma mensagem foi enviada, como se mostram ao puxar a conversa. Módulo PURO (usa a hora do aparelho).
const MESES = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."] as const;

const dois = (n: number): string => String(n).padStart(2, "0");

/**
 * «23 de out. 17:58» no ano em curso; passado o ano (uma mensagem de outro ano) vem a data toda: «23/10/2025 · 17:58» (o ponto só
 * faz sentido na data numérica).
 * `agora` só serve para saber qual é o ano em curso.
 */
export function dataDeEnvio(em: number, agora: number = Date.now()): string {
  const d = new Date(em);
  const hora = `${dois(d.getHours())}:${dois(d.getMinutes())}`;
  if (d.getFullYear() === new Date(agora).getFullYear()) return `${d.getDate()} de ${MESES[d.getMonth()]} ${hora}`;
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} · ${hora}`;
}

import { describe, expect, it } from "vitest";
import { dataDeEnvio } from "./data";

// as datas fazem-se com os números do calendário local: o teste não depende do fuso horário de quem o corre
const quando = (ano: number, mes: number, dia: number, h: number, m: number) =>
  new Date(ano, mes - 1, dia, h, m).getTime();

describe("a data de envio", () => {
  const agora = quando(2026, 10, 24, 9, 0);

  it("no ano em curso: dia, mês abreviado e hora, sem ponto no meio", () => {
    expect(dataDeEnvio(quando(2026, 10, 23, 17, 58), agora)).toBe("23 de out. 17:58");
    expect(dataDeEnvio(quando(2026, 1, 5, 9, 5), agora)).toBe("5 de jan. 09:05");
    expect(dataDeEnvio(quando(2026, 12, 31, 23, 59), agora)).toBe("31 de dez. 23:59");
  });

  it("passado o ano: a data toda, 23/10/2025 · 17:58", () => {
    expect(dataDeEnvio(quando(2025, 10, 23, 17, 58), agora)).toBe("23/10/2025 · 17:58");
    expect(dataDeEnvio(quando(2025, 3, 2, 8, 7), agora)).toBe("02/03/2025 · 08:07");
  });

  it("vira o ano: o que era do ano em curso passa a ter o ano", () => {
    const naVirada = quando(2027, 1, 1, 0, 30);
    expect(dataDeEnvio(quando(2026, 10, 23, 17, 58), naVirada)).toBe("23/10/2026 · 17:58");
  });
});

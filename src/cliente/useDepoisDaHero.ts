"use client";

import { useEffect, useState } from "react";

/** O botão do chat aparece logo a seguir a passar a hero (um projecto pode pôr outro atraso). */
export const ATRASO_PADRAO_MS = 300;

/**
 * Só depois de a pessoa descer para lá da hero: a primeira vista do site é só a hero. Verdadeiro quando a hero (o elemento que o
 * `seletor` encontra) já saiu toda do ecrã por cima; sem seletor, ou numa página sem hero, quando já se desceu 40 % da altura do
 * ecrã. Uma vez verdadeiro fica verdadeiro (subir outra vez não esconde o chat, nem noutra página do site).
 */
export function useDepoisDaHero(seletor?: string | false): boolean {
  const [passou, setPassou] = useState(false);

  useEffect(() => {
    if (seletor === false) {
      setPassou(true);
      return;
    }
    let feito = false;
    const medir = () => {
      if (feito) return;
      const hero = seletor ? document.querySelector<HTMLElement>(seletor) : null;
      // uma hero que ainda não tem altura é a que chega por streaming dentro de um bloco escondido: ainda não está no ecrã
      if (hero && hero.offsetHeight === 0) return;
      const passouAHero = hero ? hero.getBoundingClientRect().bottom <= 0 : window.scrollY > window.innerHeight * 0.4;
      if (passouAHero) {
        feito = true;
        setPassou(true);
      }
    };
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, [seletor]);

  return passou;
}

/**
 * Fora da hero: verdadeiro só enquanto a hero NÃO está à vista (já saiu toda do ecrã por cima) e falso
 * assim que ela volta a aparecer — o botão do chat sai a animar ao voltar à hero e só regressa quando a pessoa já não está nela. Numa
 * página sem hero fica como `useDepoisDaHero`: verdadeiro depois de descer 40 % do ecrã (e fica). Com `false` o projecto desliga a regra:
 * o botão está sempre à vista.
 */
export function useForaDaHero(seletor?: string | false): boolean {
  const [fora, setFora] = useState(false);

  useEffect(() => {
    if (seletor === false) {
      setFora(true);
      return;
    }
    let passouSemHero = false;
    const medir = () => {
      const hero = seletor ? document.querySelector<HTMLElement>(seletor) : null;
      // uma hero que ainda não tem altura é a que chega por streaming dentro de um bloco escondido: fica o que estava
      if (hero && hero.offsetHeight === 0) return;
      if (hero) return setFora(hero.getBoundingClientRect().bottom <= 0);
      if (window.scrollY > window.innerHeight * 0.4) passouSemHero = true;
      setFora(passouSemHero);
    };
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir);
      window.removeEventListener("resize", medir);
    };
  }, [seletor]);

  return fora;
}

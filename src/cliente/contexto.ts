"use client";

import { createContext, type ComponentType } from "react";

/** O loading do projecto, no lugar dos nove quadrados do módulo (o chat inteiro usa-o: o botão, a fila, as avaliações…). */
export const ContextoDoCarregar = createContext<ComponentType<{ rotulo: string }> | null>(null);

"use client";

import { useState } from "react";
import type { CurrencyCode } from "@/lib/money";
import { CardTile } from "@/components/card-tile";
import { Money } from "@/components/money";

export type StackCard = {
  id: string;
  name: string;
  lastFour: string | null;
  color: string;
  caption: string;
  amountCents: number;
  usedPct: number | null;
  footerLeft: string;
  freeCents: number | null;
};

// Cartões empilhados no Dashboard: o da frente aparece inteiro, os outros
// espiam por trás, levemente girados. Tocar num de trás traz ele pra
// frente — a pilha gira, ninguém some.

const BACK_LAYERS = [
  "translate-x-[14px] -translate-y-[22px] rotate-[3deg] scale-[0.97]",
  "translate-x-[26px] -translate-y-[40px] rotate-[6deg] scale-[0.94]",
];

export function CardStack({
  cards,
  title,
  currency,
  className = "",
}: {
  cards: StackCard[];
  title: string;
  currency: CurrencyCode;
  className?: string;
}) {
  const [front, setFront] = useState(0);
  // Ordem na pilha: o escolhido na frente, os outros na sequência.
  const order = cards.map((_, i) => (front + i) % cards.length);
  const visible = order.slice(0, 1 + BACK_LAYERS.length);

  return (
    <div
      className={`relative ${cards.length > 2 ? "pt-10 pr-7" : cards.length > 1 ? "pt-6 pr-4" : ""} ${className}`}
    >
      <div className="relative grid">
        {[...visible].reverse().map((index) => {
          const card = cards[index];
          const depth = visible.indexOf(index);
          const isFront = depth === 0;
          return (
            <div
              key={card.id}
              className={`relative col-start-1 row-start-1 transition-all duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${
                isFront ? "z-30" : depth === 1 ? "z-20" : "z-10"
              } ${isFront ? "" : `${BACK_LAYERS[depth - 1]} opacity-90`}`}
            >
              <CardTile
                className="h-full"
                title={title}
                href={`/cartoes?cartao=${card.id}`}
                linkLabel="Faturas"
                name={card.name}
                lastFour={card.lastFour}
                color={card.color}
                caption={card.caption}
                amount={<Money cents={card.amountCents} currency={currency} />}
                usedPct={card.usedPct}
                footerLeft={card.footerLeft}
                footerRight={
                  card.freeCents !== null ? (
                    <>
                      {card.freeCents < 0 ? "−" : ""}
                      <Money
                        cents={Math.abs(card.freeCents)}
                        currency={currency}
                      />{" "}
                      livres
                    </>
                  ) : undefined
                }
              />
              {isFront ? null : (
                <button
                  type="button"
                  onClick={() => setFront(index)}
                  aria-label={`Mostrar ${card.name}`}
                  className="absolute inset-0 cursor-pointer rounded-[24px]"
                />
              )}
            </div>
          );
        })}
      </div>
      {cards.length > 1 ? (
        <div
          className="mt-3 flex justify-center gap-1.5"
          role="tablist"
          aria-label="Cartões"
        >
          {cards.map((card, i) => (
            <button
              key={card.id}
              type="button"
              role="tab"
              aria-selected={i === front}
              aria-label={card.name}
              onClick={() => setFront(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === front
                  ? "w-5 bg-(--text-primary)"
                  : "w-1.5 bg-(--border-strong) hover:bg-(--text-light)"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

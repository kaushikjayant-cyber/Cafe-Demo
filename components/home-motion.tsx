"use client";

import { Check, Plus, Search, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs `onFrame` at most once per animation frame while scrolling, and only while `target`
 * is near the screen, so off-screen sections cost nothing. Nothing at all for reduced motion.
 */
function useScrollFrame(target: RefObject<HTMLElement | null>, onFrame: () => void) {
  const callback = useRef(onFrame);
  useEffect(() => {
    callback.current = onFrame;
  });
  useEffect(() => {
    const element = target.current;
    if (!element || reducedMotion()) return;
    let queued = false;
    let frame = 0;
    const schedule = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(() => {
        queued = false;
        callback.current();
      });
    };
    let listening = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting === listening) return;
        listening = entry.isIntersecting;
        if (listening) {
          window.addEventListener("scroll", schedule, { passive: true });
          schedule();
        } else {
          window.removeEventListener("scroll", schedule);
        }
      },
      { rootMargin: "20% 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
    };
  }, [target]);
}

/** Tickets drop onto the rail one after another the first time the rail comes into view. */
export function TicketDrop({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = ref.current;
    if (!list || reducedMotion() || list.getBoundingClientRect().top < window.innerHeight * 0.8) return;
    list.dataset.state = "waiting"; // only hidden once we know the observer will reveal them
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        list.dataset.state = "dropped";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(list);
    return () => observer.disconnect();
  }, []);
  return (
    <ul ref={ref} className={className}>
      {children}
    </ul>
  );
}

const LINES = ["Nobody should have to wave for the menu.", "The menu opens. No app.", "Tap what you want.", "Order placed.", "Watch it come. Pay from your seat.", "Tell the cafe how it was."];
const MENU = [
  { name: "Cappuccino", price: "₹180", picked: true },
  { name: "Chocolate Brownie", price: "₹140", picked: true },
  { name: "Masala Chai", price: "₹80", picked: false },
];
const START_TILT = 6;
const TRACK = ["Order sent", "Confirmed", "Being prepared", "Ready"];

/** One order on a phone, followed by scrolling. React only re-renders when the step changes. */
export function OrderStory({ qr, brand, guestHref, cafeHref }: { qr: { size: number; path: string }; brand: string; guestHref: string; cafeHref: string }) {
  const ref = useRef<HTMLElement>(null);
  const lift = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  useScrollFrame(ref, () => {
    if (!ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const progress = -box.top / Math.max(1, box.height - window.innerHeight);
    setStep(Math.min(LINES.length - 1, Math.max(0, Math.floor(progress * LINES.length))));

    // The phone starts leaning and is level by the end of the first step. Written straight to
    // the element, so scrolling never re-renders React.
    const left = Math.max(0, 1 - progress * LINES.length);
    if (lift.current) lift.current.style.transform = `rotate(${left * START_TILT}deg)`;
  });
  const screen = (i: number) =>
    `absolute inset-0 flex flex-col transition-[opacity,transform] duration-300 ease-out ${i === step ? "opacity-100" : i < step ? "-translate-x-4 opacity-0" : "translate-x-4 opacity-0"}`;

  return (
    <section ref={ref} aria-label="How one order goes" className="relative h-[500vh] bg-[#1c1917] text-[#fbf9f5] motion-reduce:h-auto">
      <div className="sticky top-0 flex min-h-svh flex-col overflow-hidden motion-reduce:static">
        {/* This table's own QR code, enlarged into the tabletop. Painted once; it never moves. */}
        <svg aria-hidden viewBox={`0 0 ${qr.size} ${qr.size}`} className="pointer-events-none absolute top-1/2 -right-40 h-[150%] -translate-y-1/2 opacity-[0.04] md:-right-20 md:opacity-[0.08]">
          <path d={qr.path} fill="#fbf9f5" />
        </svg>
        <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-5">
          <span className="font-heading text-xl">{brand}</span>
          <a href="#request-demo" className="home-link rounded text-sm font-semibold underline-offset-4 hover:underline">
            Request a demo
          </a>
        </header>
        <div className="relative mx-auto my-auto grid w-full max-w-6xl grid-cols-1 items-center gap-5 px-5 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-10">
          <div>
            <ol className="grid">
              {LINES.map((line, i) => (
                <li
                  key={line}
                  className={`col-start-1 row-start-1 font-heading text-[2rem] leading-[1.08] tracking-tight transition-[opacity,transform] duration-300 md:text-6xl motion-reduce:row-start-auto motion-reduce:mb-3 motion-reduce:transform-none motion-reduce:opacity-100 ${
                    i === step ? "opacity-100" : i < step ? "-translate-y-4 opacity-0" : "translate-y-4 opacity-0"
                  }${i === step ? "" : " pointer-events-none"}`}
                >
                  {i === 0 ? <h1>{line}</h1> : line}
                  {i === 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 font-sans text-sm tracking-normal md:mt-8 md:gap-3 md:text-base">
                      <Link href={guestHref} tabIndex={step === 0 ? undefined : -1} className="home-link flex h-11 items-center rounded bg-[#fbf9f5] px-4 font-semibold text-[#1c1917] md:h-12 md:px-6">
                        Try it as a guest
                      </Link>
                      <Link href={cafeHref} tabIndex={step === 0 ? undefined : -1} className="home-link flex h-11 items-center rounded border border-[#fbf9f5]/30 px-4 font-semibold hover:bg-[#fbf9f5]/10 md:h-12 md:px-6">
                        Visit the demo cafe
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div aria-hidden className="mt-4 flex max-w-48 gap-1.5 md:mt-8">
              {LINES.map((line, i) => (
                <span key={line} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-[#fbf9f5]" : "bg-[#fbf9f5]/30"}`} />
              ))}
            </div>
          </div>

          {/* The phone: plain HTML, so there are no images to load. Height follows the screen. */}
          <div ref={lift} aria-hidden className="mx-auto w-fit will-change-transform" style={{ transform: `rotate(${START_TILT}deg)` }}>
          <div data-settle="go" className="aspect-[9/18] h-[min(46svh,560px)] rounded-[2.2rem] bg-[#0f0d0c] p-2 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.8)] ring-1 ring-white/20 md:h-[min(78svh,560px)]">
            <div className="relative h-full overflow-hidden rounded-[1.7rem] bg-[#fbf9f5] text-[#1c1917]">
              <div className={`${screen(0)} items-center justify-center bg-[#2b2622]`}>
                <div className="relative w-3/4 rounded bg-white p-2">
                  <svg viewBox={`0 0 ${qr.size} ${qr.size}`} className="block w-full">
                    <path d={qr.path} fill="#1c1917" />
                  </svg>
                  {step === 0 && <span className="scan-line absolute inset-0 border-t-2 border-[#c25e3e]" />}
                </div>
                <p className="mt-4 text-xs text-white/80">Table T1 found</p>
              </div>

              <div className={`${screen(1)} ${step === 2 ? "!translate-x-0 !opacity-100" : ""} p-3`}>
                <p className="font-heading text-lg leading-tight">Brew &amp; Bloom</p>
                <p className="text-[11px] text-[#78716c]">Table T1</p>
                <div className="mt-2 flex h-7 items-center gap-1.5 rounded border border-[#e5dfd7] bg-white px-2 text-[11px] text-[#78716c]">
                  <Search className="size-3" /> Search
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {MENU.map(({ name, price, picked }) => (
                    <li key={name} className={`rounded border border-[#e5dfd7] bg-[#f3efea] p-2 ${picked ? "" : "hidden md:block"}`}>
                      <p className="font-heading text-sm leading-tight">{name}</p>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="font-semibold">{price}</span>
                        <span className={`flex h-6 items-center gap-0.5 rounded px-2 text-[11px] font-semibold transition-colors duration-200 ${step === 2 && picked ? "bg-[#4a6b5d] text-white" : "bg-[#1c1917] text-white"}`}>
                          {step === 2 && picked ? <Check className="size-3" /> : <Plus className="size-3" />}
                          {step === 2 && picked ? "1" : "Add"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className={`mt-auto flex h-9 items-center justify-between rounded bg-[#1c1917] px-3 text-[11px] font-semibold text-white transition-[opacity,transform] duration-300 ${step === 2 ? "opacity-100" : "translate-y-3 opacity-0"}`}>
                  <span>2 items, ₹320</span>
                  <span>Place order</span>
                </div>
              </div>

              <div className={`${screen(3)} items-center justify-center p-4 text-center`}>
                <span className={`grid size-14 place-items-center rounded-full bg-[#4a6b5d] text-white transition-transform duration-300 ${step === 3 ? "scale-100" : "scale-50"}`}>
                  <Check className="size-7" strokeWidth={3} />
                </span>
                <p className="mt-3 font-heading text-xl">Order #12 sent</p>
                <p className="mt-1 text-xs text-[#78716c]">The counter has it now.</p>
              </div>

              <div className={`${screen(4)} p-3`}>
                <p className="text-[11px] text-[#78716c]">Order #12</p>
                <p className="font-heading text-lg leading-tight">Your order is being prepared</p>
                <ol className="mt-3 flex flex-col gap-2 text-xs">
                  {TRACK.map((label, i) => (
                    <li key={label} className="flex items-center gap-2">
                      <span className={`grid size-4 place-items-center rounded-full ${i < 3 ? "bg-[#1c1917] text-white" : "border border-[#d0c4be]"}`}>{i < 3 && <Check className="size-2.5" strokeWidth={3} />}</span>
                      <span className={i === 2 ? "font-semibold" : i > 2 ? "text-[#78716c]" : ""}>{label}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-auto rounded border border-[#4a6b5d] p-2 text-center text-xs font-semibold text-[#3d5a4e]">Paid by UPI, ₹320</div>
              </div>

              <div className={`${screen(5)} p-3`}>
                <p className="text-[11px] text-[#78716c]">Order #12</p>
                <p className="font-heading text-lg leading-tight">How was everything?</p>
                <div className="mt-3 flex justify-between">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <Star
                      key={n}
                      className={`size-6 transition-colors duration-300 md:size-7 ${step === 5 ? "fill-[#c25e3e] text-[#c25e3e]" : "text-[#d0c4be]"}`}
                      style={{ transitionDelay: `${n * 90}ms` }}
                      strokeWidth={1.5}
                    />
                  ))}
                </div>
                <p className="mt-3 rounded border border-[#e5dfd7] bg-white p-2 font-heading text-sm leading-snug italic">“Lovely coffee, will come back.”</p>
                <div className="mt-auto flex flex-col gap-1.5 text-center text-[11px] font-semibold">
                  <span className="rounded bg-[#1c1917] py-2 text-white">Send feedback</span>
                  <span className="rounded border border-[#e5dfd7] py-2">Review us on Google</span>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}

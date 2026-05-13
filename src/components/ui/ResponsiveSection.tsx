"use client";

import { ReactNode, useEffect, useState } from "react";



/* =========================================================
   RESPONSIVE SECTION - ELOGEST

   ETAPA 39.4.5 — SEÇÕES RESPONSIVAS / MOBILE ACCORDION

   Objetivo:
   - No desktop, manter seções abertas como blocos normais.
   - No mobile, transformar seções longas em menus suspensos.
   - Reduzir rolagem excessiva em dashboards e páginas densas.
   - Criar um padrão reutilizável para AdminShell e PortalShell.

   Comportamento:
   - Desktop/tablet largo: seção aberta automaticamente.
   - Mobile: respeita defaultOpenMobile.
   - O usuário pode abrir/fechar no mobile.
   ========================================================= */



interface ResponsiveSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpenMobile?: boolean;
  className?: string;
  contentClassName?: string;
}



export default function ResponsiveSection({
  title,
  description,
  children,
  defaultOpenMobile = false,
  className = "",
  contentClassName = "",
}: ResponsiveSectionProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [open, setOpen] = useState(defaultOpenMobile);



  /* =========================================================
     DETECTAR DESKTOP

     Em desktop, mantemos aberto por padrão.
     Em mobile, usamos defaultOpenMobile.
     ========================================================= */

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    function syncMode() {
      const desktop = mediaQuery.matches;

      setIsDesktop(desktop);

      if (desktop) {
        setOpen(true);
      } else {
        setOpen(defaultOpenMobile);
      }
    }

    syncMode();

    mediaQuery.addEventListener("change", syncMode);

    return () => {
      mediaQuery.removeEventListener("change", syncMode);
    };
  }, [defaultOpenMobile]);



  return (
    <section className={className}>
      <details
        open={open}
        onToggle={(event) => {
          setOpen(event.currentTarget.open);
        }}
        className="group rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm md:border-0 md:bg-transparent md:p-0 md:shadow-none"
      >
        <summary
          className={[
            "flex cursor-pointer list-none items-start justify-between gap-4",
            "md:cursor-default",
          ].join(" ")}
          onClick={(event) => {
            if (isDesktop) {
              event.preventDefault();
            }
          }}
        >
          <div>
            <h2 className="text-xl font-semibold text-[#17211B]">
              {title}
            </h2>

            {description && (
              <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                {description}
              </p>
            )}
          </div>

          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C] transition group-open:rotate-180 md:hidden">
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </summary>

        <div className={["mt-5 md:mt-4", contentClassName].join(" ")}>
          {children}
        </div>
      </details>
    </section>
  );
}
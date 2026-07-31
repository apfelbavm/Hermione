import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { Sidebar } from "./Sidebar";

export function PageHeader() {
  return (
    <header className="page-top-header">
      <div className="page-top-header-inner">
        <span className="page-top-header-title">Hermione</span>
        <ThemeToggle />
      </div>
    </header>
  );
}

function PageFooter() {
  return <footer className="page-bottom-footer" />;
}

export function PageShell({ children, contentClassName }: { children: ReactNode; contentClassName?: string }) {
  return (
    <div className="page-frame">
      <PageHeader />
      <div className="page-body">
        <Sidebar />
        <main className={contentClassName ? `page-content ${contentClassName}` : "page-content"}>{children}</main>
      </div>
      <PageFooter />
    </div>
  );
}

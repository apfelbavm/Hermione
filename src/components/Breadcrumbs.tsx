import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  /** Omitted for the current page (the last item) — rendered as plain text instead of a link. */
  href?: string;
}

/** Sits directly below PageHeader on every plain page (see that component) — each page builds its
 * own trail back to Home. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i}>
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span className="breadcrumb-current">{item.label}</span>}
          {i < items.length - 1 && <span className="breadcrumb-sep"> / </span>}
        </span>
      ))}
    </nav>
  );
}

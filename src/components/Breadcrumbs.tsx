import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      / {items.map((item, i) => (
        <span key={i}>
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span className="breadcrumb-current">{item.label}</span>}
          {i < items.length - 1 && <span className="breadcrumb-sep"> / </span>}
        </span>
      ))}
    </nav>
  );
}

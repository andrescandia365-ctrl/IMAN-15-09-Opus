import { cn } from "@/lib/utils";

export function BrandMark({
  src,
  className,
  markClassName,
}: {
  src?: string | null;
  className?: string;
  markClassName?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={cn("size-8 shrink-0 rounded-md object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md bg-paper text-ink",
        className,
      )}
    >
      <TicketMark className={markClassName} />
    </span>
  );
}

export function TicketMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4", className)} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" opacity="0.14" />
      <path
        d="M7 8h10M7 12h7M7 16h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

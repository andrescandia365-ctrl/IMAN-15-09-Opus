import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordField({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-sm text-muted hover:text-fg"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Ocultar" : "Mostrar"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

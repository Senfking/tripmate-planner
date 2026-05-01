import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex w-full rounded-md border border-input bg-background ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        // Default: 16px on mobile to prevent iOS Safari auto-zoom on focus,
        // 14px on md+ where that zoom behaviour doesn't apply.
        default: "h-10 px-3 py-2 text-base file:text-sm md:text-sm",
        // Compact: 13px throughout. Use inside dense modals / inline forms
        // where 16px inputs visually dominate the surrounding 11–13px UI.
        // Trade-off: iOS Safari will auto-zoom on focus — acceptable in
        // contextual forms, NOT in primary auth/signup flows.
        sm: "h-9 px-2.5 py-1.5 text-[13px] file:text-xs",
      },
    },
    defaultVariants: { inputSize: "default" },
  },
);

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, inputSize, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ inputSize }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };

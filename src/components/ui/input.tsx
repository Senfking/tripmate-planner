import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex w-full rounded-md border border-input bg-background ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        // Default: 14px throughout. iOS Safari will auto-zoom on focus
        // (zoom kicks in below 16px) — accepted trade-off to keep inputs
        // visually consistent with the app's 11–13px utility type scale.
        default: "h-10 px-3 py-2 text-[14px] file:text-sm",
        // Compact: 13px. Use inside very dense inline forms.
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

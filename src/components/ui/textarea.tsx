import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "flex w-full rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground placeholder:text-[12px] placeholder:leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        // Default: 14px throughout. iOS Safari will auto-zoom on focus
        // (zoom kicks in below 16px) — accepted trade-off to keep textareas
        // visually consistent with the app's 11–13px utility type scale.
        default: "min-h-[80px] px-3 py-2 text-[14px] leading-snug",
        // Compact: 12px. Use inside dense modals where even 14px dominates.
        sm: "min-h-[60px] px-2.5 py-2 text-[12px] leading-snug placeholder:text-[12px]",
      },
    },
    defaultVariants: { inputSize: "default" },
  },
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof textareaVariants> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, inputSize, ...props }, ref) => {
    return (
      <textarea
        className={cn(textareaVariants({ inputSize }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea, textareaVariants };

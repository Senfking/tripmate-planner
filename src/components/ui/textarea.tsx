import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const textareaVariants = cva(
  "flex w-full rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      inputSize: {
        // Default: 16px on mobile to prevent iOS Safari auto-zoom on focus.
        default: "min-h-[80px] px-3 py-2 text-base md:text-sm",
        // Compact: 13px throughout. Use inside dense modals where the
        // textarea sits next to 11–13px labels and would otherwise dominate.
        sm: "min-h-[64px] px-2.5 py-2 text-[13px] leading-snug",
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

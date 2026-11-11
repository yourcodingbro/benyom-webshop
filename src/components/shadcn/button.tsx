import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Storefront button system (benyom.hu pill style). Every variant and size is rounded-full;
 * icon sizes are circles. Focus uses the shared ring; disabled and loading states share opacity.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,opacity] duration-150 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-neutral-200 active:bg-neutral-300",
        outline: "border border-input bg-background text-ink hover:border-ink hover:bg-accent active:bg-muted",
        ghost: "text-ink hover:bg-accent active:bg-muted",
        destructive: "bg-destructive text-white hover:bg-destructive/90 active:bg-destructive/80 focus-visible:ring-destructive/30",
        /** Ghost on dark surfaces (header, mobile menu). */
        ghostInverse: "text-white hover:bg-white/10 active:bg-white/20 focus-visible:ring-white/60",
        link: "rounded-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 text-sm has-[>svg]:px-4",
        xs: "h-7 gap-1 px-3 text-xs has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-4 text-sm has-[>svg]:px-3",
        lg: "h-11 px-6 text-base has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Shows a spinner, sets aria-busy and blocks interaction (not available with asChild). */
    loading?: boolean
  }) {
  if (asChild) {
    return (
      <Slot.Root data-slot="button" data-variant={variant} data-size={size} className={cn(buttonVariants({ variant, size, className }))} {...props}>
        {children}
      </Slot.Root>
    )
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2Icon className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export { Button, buttonVariants }

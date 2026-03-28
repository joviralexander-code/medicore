import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default:     'border-transparent bg-primary text-primary-foreground',
        secondary:   'border-transparent bg-secondary text-secondary-foreground',
        outline:     'border-border text-foreground bg-transparent',
        success:     'border-transparent bg-green-100  text-green-800  dark:bg-green-900/40 dark:text-green-300',
        warning:     'border-transparent bg-amber-100  text-amber-800  dark:bg-amber-900/40 dark:text-amber-300',
        error:       'border-transparent bg-red-100    text-red-800    dark:bg-red-900/40   dark:text-red-300',
        info:        'border-transparent bg-blue-100   text-blue-800   dark:bg-blue-900/40  dark:text-blue-300',
        teal:        'border-transparent bg-teal-100   text-teal-800   dark:bg-teal-900/40  dark:text-teal-300',
        pro:         'border-transparent bg-blue-100   text-blue-700   dark:bg-blue-900/40  dark:text-blue-300',
        clinica:     'border-transparent bg-teal-100   text-teal-700   dark:bg-teal-900/40  dark:text-teal-300',
        enterprise:  'border-transparent bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
        free:        'border-transparent bg-gray-100   text-gray-600   dark:bg-gray-800     dark:text-gray-400',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

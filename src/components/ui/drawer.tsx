import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '@/lib/utils';

const Modal = React.createContext(true);

type RootProps = React.ComponentProps<typeof DrawerPrimitive.Root>;

/** A non-modal drawer must be controlled: its own dialog (below) follows `open`. */
type DrawerProps = RootProps & ({ modal?: true } | { modal: false; open: boolean });

/**
 * A bottom sheet (vaul). vaul 1.1.2 leaves its Radix dialog modal even with `modal={false}` (focus kept
 * in the sheet, the rest of the page hidden from assistive technology), so a non-modal drawer gets a
 * non-modal dialog of its own, which follows `open`. (vaul and `radix-ui` share one
 * `@radix-ui/react-dialog`, so the content finds that dialog.) A close from inside it (Escape) goes to
 * `onOpenChange`, as a drag away does through vaul, unless it isn't `dismissible`.
 */
function Drawer({ modal = true, open, onOpenChange, dismissible = true, children, ...props }: DrawerProps) {
  return (
    <DrawerPrimitive.Root modal={modal} open={open} onOpenChange={onOpenChange} dismissible={dismissible} {...props}>
      <Modal.Provider value={modal}>
        {modal ? children : (
          <DialogPrimitive.Root modal={false} open={open} onOpenChange={o => { if (o || dismissible) onOpenChange?.(o); }}>{children}</DialogPrimitive.Root>
        )}
      </Modal.Provider>
    </DrawerPrimitive.Root>
  );
}

/**
 * The sheet itself, drawn where it is (no portal), so it is hidden with whatever holds it. It says
 * whether it is modal (`aria-modal`), so a sheet that stays open beside the page isn't taken for one.
 */
function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const modal = React.useContext(Modal);
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      aria-modal={modal}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl border-t border-line bg-surface text-fg shadow-[0_-8px_30px_rgba(22,27,45,0.16)] outline-none',
        className,
      )}
      {...props}
    >
      {modal ? children : (
        // Radix's dialog content loops Tab inside itself even when it isn't modal. A sheet that stays
        // open beside the page lets Tab go on to the rest of the page, both ways.
        <div className="contents" onKeyDown={e => { if (e.key === 'Tab') e.stopPropagation(); }}>{children}</div>
      )}
    </DrawerPrimitive.Content>
  );
}

/**
 * The grip at the top of the sheet: drag it, or press it (or Enter or Space on it) to step through the
 * sheet's heights. Name it with `aria-label`. (vaul's own handle styles aren't in a CSS layer, so they
 * win over utilities unless those are marked important.)
 */
function DrawerHandle({ className, onKeyDown, ...props }: React.ComponentProps<typeof DrawerPrimitive.Handle>) {
  return (
    <DrawerPrimitive.Handle
      data-slot="drawer-handle"
      role="button"
      tabIndex={0}
      aria-hidden={undefined}
      onKeyDown={e => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click(); }
      }}
      className={cn('my-2 h-1.5! w-10! flex-none rounded-full bg-line-strong! opacity-100! outline-none focus-visible:ring-2 focus-visible:ring-ring/50', className)}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn('text-base font-semibold', className)} {...props} />;
}

export { Drawer, DrawerContent, DrawerHandle, DrawerTitle };

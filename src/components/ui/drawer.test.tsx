// The drawer: a non-modal one must be controlled (`open`), leaves the rest of the page alone, and
// passes a close from inside it (Escape) on to `onOpenChange` unless it can't be dismissed.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Drawer, DrawerContent, DrawerTitle } from './drawer';

const Sheet = (p: { dismissible?: boolean; onOpenChange(open: boolean): void }) => (
  <>
    <button type="button">On the page</button>
    <Drawer open modal={false} dismissible={p.dismissible} onOpenChange={p.onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerTitle>Sheet</DrawerTitle>
        <button type="button">In the sheet</button>
      </DrawerContent>
    </Drawer>
  </>
);

test('a non-modal drawer leaves the page alone and says when Escape closes it', async () => {
  const onOpenChange = vi.fn();
  render(<Sheet onOpenChange={onOpenChange} />);
  expect(screen.getByRole('dialog', { name: 'Sheet' })).toHaveAttribute('aria-modal', 'false');
  expect(screen.getByRole('button', { name: 'On the page' })).toBeInTheDocument(); // not hidden from assistive technology
  screen.getByRole('button', { name: 'In the sheet' }).focus();
  await userEvent.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('one that can’t be dismissed stays open on Escape', async () => {
  const onOpenChange = vi.fn();
  render(<Sheet dismissible={false} onOpenChange={onOpenChange} />);
  screen.getByRole('button', { name: 'In the sheet' }).focus();
  await userEvent.keyboard('{Escape}');
  expect(onOpenChange).not.toHaveBeenCalled();
});

test('a non-modal drawer has to say whether it is open', () => {
  // @ts-expect-error `open` is required when `modal` is false
  const sheet = <Drawer modal={false}><DrawerContent aria-describedby={undefined} /></Drawer>;
  expect(sheet).toBeTruthy();
});

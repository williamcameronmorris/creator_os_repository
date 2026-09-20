import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmProvider, useConfirm } from './ConfirmDialog';

function AlertHarness({ onDone }: { onDone?: () => void }) {
  const confirm = useConfirm();
  return (
    <button onClick={() => { void confirm({ title: 'That file is too large', acknowledge: true }).then(() => onDone?.()); }}>
      raise
    </button>
  );
}

function ConfirmHarness() {
  const confirm = useConfirm();
  return <button onClick={() => { void confirm({ title: 'Delete this post?' }); }}>raise</button>;
}

const raise = () => fireEvent.click(screen.getByText('raise'));

describe('acknowledge dialog', () => {
  it('offers one button and no way to cancel past the message', async () => {
    render(<ConfirmProvider><AlertHarness /></ConfirmProvider>);
    raise();

    expect(await screen.findByText('That file is too large')).toBeTruthy();
    expect(screen.getByText('Got it')).toBeTruthy();
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('stays open when the backdrop is clicked, so the message cannot be skipped', async () => {
    const { container } = render(<ConfirmProvider><AlertHarness /></ConfirmProvider>);
    raise();
    await screen.findByText('That file is too large');

    fireEvent.click(container.querySelector('.fixed.inset-0') as HTMLElement);

    expect(screen.queryByText('That file is too large')).toBeTruthy();
  });

  it('resolves once acknowledged', async () => {
    let done = false;
    render(<ConfirmProvider><AlertHarness onDone={() => { done = true; }} /></ConfirmProvider>);
    raise();
    fireEvent.click(await screen.findByText('Got it'));

    await waitFor(() => expect(done).toBe(true));
    expect(screen.queryByText('That file is too large')).toBeNull();
  });
});

describe('confirm dialog', () => {
  it('still offers cancel, so acknowledge mode did not change it', async () => {
    render(<ConfirmProvider><ConfirmHarness /></ConfirmProvider>);
    raise();

    expect(await screen.findByText('Delete this post?')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });
});

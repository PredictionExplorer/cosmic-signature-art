import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { plain, rich } from './rich';

const cite = (key: string) => <sup data-source={key}>n</sup>;

describe('the essay’s marks', () => {
  it('become a term, an emphasis, a raised figure and a source’s mark, in place', () => {
    const { container } = render(
      <p>
        {rich(
          'They are **bound**: see the *Principia*.[^newton] More than 10^{80,000} terms.',
          cite,
        )}
      </p>,
    );
    const p = container.querySelector('p')!;
    expect(p.textContent).toBe('They are bound: see the Principia.n More than 1080,000 terms.');
    expect(p.querySelector('dfn')).toHaveTextContent('bound');
    expect(p.querySelector('em')).toHaveTextContent('Principia');
    expect(p.querySelector('sup[data-source="newton"]')).not.toBeNull();
    expect(p.querySelector('sup:not([data-source])')).toHaveTextContent('80,000');
    // The mark stands directly after the sentence it is of.
    expect(p.innerHTML).toContain('</em>.<sup data-source="newton">');
  });

  it('leave plain words as they are, with their numbers kept whole at a line’s end', () => {
    expect(rich('No marks here.', cite)).toEqual(['No marks here.']);
    expect(rich('Крок 1 535 000 і 60 fps.', cite)).toEqual([
      'Крок 1\u00a0535\u00a0000 і 60\u00a0fps.',
    ]);
    expect(rich('', cite)).toEqual([]);
  });

  it('show a mark that names no listed source as written, never dropping it', () => {
    const { container } = render(<p>{rich('A claim.[^nobody]', cite)}</p>);
    expect(container.textContent).toBe('A claim.[^nobody]');
  });

  it('can be taken out, for a name that is read aloud', () => {
    expect(plain('They are **bound**: the *Principia*.[^newton] 10^{80,000}')).toBe(
      'They are bound: the Principia. 1080,000',
    );
  });
});

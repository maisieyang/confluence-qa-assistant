'use client';

import type { ReferenceLink } from './ChatWindow/types';

interface QAReferenceListProps {
  references: ReferenceLink[];
}

export function QAReferenceList({ references }: QAReferenceListProps) {
  if (!references.length) {
    return null;
  }

  return (
    <div className="pt-2 pb-4">
      <h3 className="text-xs font-medium text-text-tertiary mb-1.5">References</h3>
      <ul className="space-y-0.5 text-sm text-text-secondary">
        {references.map((reference) => (
          <li key={reference.index} className="flex items-start gap-2">
            <span className="font-medium text-text-primary">[{reference.index}]</span>
            {reference.url ? (
              <a
                href={reference.url}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline break-words"
              >
                {reference.title}
              </a>
            ) : (
              <span className="break-words">{reference.title}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

import type { GeneralPanelProps } from '../types';
import { Connection } from './Connection';
import { LibraryRoots } from './LibraryRoots';
import { PlaybackClient } from './PlaybackClient';

export function GeneralPanel(props: GeneralPanelProps) {
  return (
    <>
      <Connection {...props} />
      <LibraryRoots {...props} />
      <PlaybackClient {...props} />
    </>
  );
}

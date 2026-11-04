// Odanın oyununa göre doğru masayı çizer (Uno hariç; Uno'nun kendi akışı var).
import type { Profile } from '../net';
import LudoTable from './Ludo';
import DrawTable from './Draw';
import SpyTable from './Spy';
import TavlaTable from './Tavla';
import OkeyTable from './Okey';

export default function GameTable({ game, view, people }: { game: string; view: any; people: Map<string, Profile> }) {
  switch (game) {
    case 'ludo': return <LudoTable view={view} people={people} />;
    case 'draw': return <DrawTable view={view} people={people} />;
    case 'spy': return <SpyTable view={view} people={people} />;
    case 'tavla': return <TavlaTable view={view} people={people} />;
    case 'okey': return <OkeyTable view={view} people={people} />;
    default: return null;
  }
}

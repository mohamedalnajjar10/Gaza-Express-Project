import { useState } from 'react';
import { Store } from 'lucide-react';
import { Link } from 'react-router-dom';

export function StoreTile({ id, name, logo, cover }: {
  id: number;
  name: string;
  logo?: string | null;
  cover?: string | null;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [logo, cover].find(url => url && !failed.includes(url));
  return (
    <Link to={`/stores/${id}`} className="store-tile">
      <span className="store-tile-art">
        {src ? <img src={src} alt="" loading="lazy" onError={() => setFailed(current => [...current, src])} /> : <Store size={33} aria-hidden="true" />}
      </span>
      <span className="store-tile-name">{name}</span>
    </Link>
  );
}

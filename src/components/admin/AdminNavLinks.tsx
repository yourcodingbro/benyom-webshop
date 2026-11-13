import Link from 'next/link'
import type React from 'react'

/** Extra admin navigation for custom views (rendered after Payload's collection links). */
export function AdminNavLinks(): React.JSX.Element {
  return (
    <nav aria-label="Üzemeltetés" style={{ marginTop: 16 }}>
      <Link href="/admin/termekimport" className="nav__link">
        Termékimport (CSV)
      </Link>
    </nav>
  )
}

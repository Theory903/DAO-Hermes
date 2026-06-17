import { useEffect, useState } from 'react'

import { Sheet, SheetContent } from '@/components/ui/sheet'

import { ObjectPrimitives } from './ObjectPrimitives'

type ObjectDetailSheetProps = {
  spaceId: string
  objectId: string | null
  onOpenChange: (open: boolean) => void
  title?: string
  showMerge?: boolean
}

export function ObjectDetailSheet({
  spaceId,
  objectId,
  onOpenChange,
  title,
  showMerge = true,
}: ObjectDetailSheetProps) {
  const [activeId, setActiveId] = useState<string | null>(objectId)

  useEffect(() => {
    setActiveId(objectId)
  }, [objectId])

  return (
    <Sheet open={objectId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="DAO-object-sheet" side="right">
        {activeId ? (
          <>
            {title ? (
              <header className="DAO-object-sheet__header">
                <h2>{title}</h2>
              </header>
            ) : null}
            <ObjectPrimitives
              objectId={activeId}
              onMerged={setActiveId}
              onSelectObject={setActiveId}
              showMerge={showMerge}
              spaceId={spaceId}
            />
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

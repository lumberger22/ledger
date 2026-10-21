import { useEffect, useRef, useState } from "react";
import { GripVertical, Plus, RotateCcw, X } from "lucide-react";

const storageKey = (pageId) => `budget-app:card-layout:${pageId}:v1`;

function readLayout(pageId, cards, defaultVisible) {
  const cardIds = cards.map((card) => card.id);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(pageId)) || "null");
    if (saved) {
      const savedOrder = Array.isArray(saved.order)
        ? [...new Set(saved.order.filter((id) => cardIds.includes(id)))]
        : [];
      const savedVisible = Array.isArray(saved.visible)
        ? saved.visible.filter((id) => cardIds.includes(id))
        : defaultVisible;
      return {
        order: [...savedOrder, ...cardIds.filter((id) => !savedOrder.includes(id))],
        visible: [...new Set(savedVisible)],
      };
    }
  } catch {
    // Ignore malformed or unavailable browser storage and use page defaults.
  }
  return { order: cardIds, visible: defaultVisible };
}

export default function CustomizableCards({
  pageId,
  cards,
  defaultVisible = cards.map((card) => card.id),
  columnsClass = "grid-cols-1 lg:grid-cols-2",
  emptyState = null,
  renderToolbar,
}) {
  const [layout, setLayout] = useState(() =>
    readLayout(pageId, cards, defaultVisible),
  );
  const [saveEnabled, setSaveEnabled] = useState(() => {
    try {
      return localStorage.getItem(storageKey(pageId)) !== null;
    } catch {
      return false;
    }
  });
  const [editing, setEditing] = useState(false);
  const [draggingId, setDraggingId] = useState(null);
  const dragIdRef = useRef(null);

  useEffect(() => {
    if (!saveEnabled) return;
    try {
      localStorage.setItem(storageKey(pageId), JSON.stringify(layout));
    } catch {
      // The layout remains usable for this session when storage is unavailable.
    }
  }, [layout, pageId, saveEnabled]);

  const cardById = new Map(cards.map((card) => [card.id, card]));
  const orderedCards = layout.order.map((id) => cardById.get(id)).filter(Boolean);
  const visibleCards = orderedCards.filter((card) => layout.visible.includes(card.id));
  const availableCards = orderedCards.filter((card) => !layout.visible.includes(card.id));

  const setVisible = (id, visible) => {
    setSaveEnabled(true);
    setLayout((current) => ({
      ...current,
      visible: visible
        ? [...current.visible, id]
        : current.visible.filter((visibleId) => visibleId !== id),
    }));
  };

  const moveCard = (id, targetId) => {
    if (!targetId || targetId === id) return;
    setSaveEnabled(true);
    setLayout((current) => {
      const order = [...current.order];
      const from = order.indexOf(id);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0 || from === to) return current;
      order.splice(from, 1);
      order.splice(to, 0, id);
      return { ...current, order };
    });
  };

  const resetLayout = () => {
    setSaveEnabled(true);
    setLayout({
      order: cards.map((card) => card.id),
      visible: [...defaultVisible],
    });
  };

  const handleDragMove = (event) => {
    const draggedId = dragIdRef.current;
    if (!draggedId) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-layout-card-id]");
    const targetId = target?.getAttribute("data-layout-card-id");
    if (targetId && targetId !== draggedId) moveCard(draggedId, targetId);
  };

  return (
    <>
      {renderToolbar?.({
        editing,
        onToggleEdit: () => setEditing((current) => !current),
      })}

      {editing && (
        <section
          aria-label="Customize cards"
          className="rounded-xl2 border border-accent/30 bg-surface p-4 shadow-card sm:p-5"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-ink-900">Arrange your cards</h2>
              <p className="mt-1 text-sm text-ink-500">
                Drag the grip to reorder, or use the arrow buttons. Changes save automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={resetLayout}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink-700 hover:bg-black/5"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>

          <ul className="space-y-2">
            {visibleCards.map((card, index) => (
              <li
                key={card.id}
                data-layout-card-id={card.id}
                className={`flex items-center gap-2 rounded-lg border bg-canvas/50 p-2 ${
                  draggingId === card.id ? "border-accent shadow-md" : "border-line"
                }`}
              >
                <button
                  type="button"
                  aria-label={`Drag ${card.title} to reorder`}
                  title="Drag to reorder"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    dragIdRef.current = card.id;
                    setDraggingId(card.id);
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={handleDragMove}
                  onPointerUp={() => {
                    dragIdRef.current = null;
                    setDraggingId(null);
                  }}
                  onPointerCancel={() => {
                    dragIdRef.current = null;
                    setDraggingId(null);
                  }}
                  className="flex h-11 w-11 shrink-0 touch-none items-center justify-center rounded-md text-ink-500 hover:bg-black/5"
                >
                  <GripVertical size={18} />
                </button>
                <span className="min-w-0 flex-1 text-sm font-medium text-ink-900">
                  {card.title}
                </span>
                <button
                  type="button"
                  aria-label={`Move ${card.title} up`}
                  disabled={index === 0}
                  onClick={() => moveCard(card.id, visibleCards[index - 1]?.id)}
                  className="h-11 min-w-11 rounded-md border border-line px-2 text-lg leading-none text-ink-700 disabled:opacity-35"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${card.title} down`}
                  disabled={index === visibleCards.length - 1}
                  onClick={() => moveCard(card.id, visibleCards[index + 1]?.id)}
                  className="h-11 min-w-11 rounded-md border border-line px-2 text-lg leading-none text-ink-700 disabled:opacity-35"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${card.title}`}
                  onClick={() => setVisible(card.id, false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-over hover:bg-over/10"
                >
                  <X size={17} />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2 text-sm font-semibold text-ink-900">Add a card</h3>
            {availableCards.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {availableCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setVisible(card.id, true)}
                    className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line px-3 text-left text-sm font-medium text-ink-700 hover:border-accent/50 hover:bg-accent-light"
                  >
                    {card.title}
                    <Plus size={16} className="shrink-0 text-accent" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">All available cards are on the page.</p>
            )}
          </div>
        </section>
      )}

      {visibleCards.length ? (
        <div className={`grid ${columnsClass} gap-4 sm:gap-5`}>
          {visibleCards.map((card) => (
            <div key={card.id} className="min-w-0">
              {card.content}
            </div>
          ))}
        </div>
      ) : (
        emptyState
      )}
    </>
  );
}

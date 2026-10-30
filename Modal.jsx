/** Reusable bottom-sheet modal. */
export default function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="scrim-enter absolute inset-0 bg-gray-950/30 backdrop-blur-[2px]"
      />
      <div
        className="glass-strong sheet-enter relative w-full max-w-md rounded-t-[1.75rem] border-b-0
                   p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-900/15 dark:bg-white/20" />
        {title && (
          <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-50">{title}</h3>
        )}
        {children}
      </div>
    </div>
  );
}

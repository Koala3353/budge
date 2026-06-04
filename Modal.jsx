/** Reusable bottom-sheet modal. */
export default function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-gray-950/40 backdrop-blur-sm"
      />
      <div
        className="relative w-full max-w-md rounded-t-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900
                   p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl
                   animate-[slideUp_200ms_ease-out] max-h-[85vh] overflow-y-auto"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />
        {title && (
          <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-50">{title}</h3>
        )}
        {children}
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

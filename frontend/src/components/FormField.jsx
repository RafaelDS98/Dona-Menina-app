export default function FormField({ label, error, children, required = false }) {
  return (
    <div className="mb-3">
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-primary ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-alert-danger text-xs mt-1">{error}</p>}
    </div>
  );
}

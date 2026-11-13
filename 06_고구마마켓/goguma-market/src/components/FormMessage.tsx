export default function FormMessage({ error, message }: { error?: string; message?: string }) {
  if (error)
    return (
      <p role="alert" className="rounded-xl border-2 border-ember bg-[#fbe4dc] px-4 py-3 text-sm text-ember">
        🔥 {error}
      </p>
    );
  if (message)
    return (
      <p role="status" className="rounded-xl border-2 border-leaf bg-[#e7efd8] px-4 py-3 text-sm text-leaf">
        🌱 {message}
      </p>
    );
  return null;
}

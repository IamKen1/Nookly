// Pure-CSS spinner: no icon library dependency, and unlike a text-only
// "Saving..." swap it stays visible even for users who don't read the label
// change — the thing that matters most during a slow/cold-start DB request.
export default function Spinner({ className = "h-4 w-4 border-2" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-current border-t-transparent ${className}`} />;
}

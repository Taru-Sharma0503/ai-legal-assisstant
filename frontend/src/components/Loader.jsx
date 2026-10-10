export default function Loader({ fullScreen = false, text = 'Loading...' }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-slate-500 ${fullScreen ? 'min-h-screen' : 'py-10'}`}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
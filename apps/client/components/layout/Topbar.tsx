export function Topbar({ title }: { title: string }) {
  return <header className="border-b border-white/10 bg-[#070b12]/80 px-6 py-4 backdrop-blur"><h1 className="text-xl font-black">{title}</h1></header>;
}

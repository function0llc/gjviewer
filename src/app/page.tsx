import { GeoJsonViewer } from "@/components/GeoJsonViewer";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a1714] px-5 py-8 text-white sm:px-8 lg:px-12">
      <div className="absolute left-[-12rem] top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-[#68b984]/25 blur-3xl" />
      <div className="absolute bottom-[-14rem] right-[-10rem] h-[34rem] w-[34rem] rounded-full bg-[#f2c66d]/20 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(246,239,217,0.13),transparent_34rem)]" />

      <div className="mx-auto max-w-7xl">
        <GeoJsonViewer />
      </div>
    </main>
  );
}

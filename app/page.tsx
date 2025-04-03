import Hero from "@/components/hero";
import "./globals.css";
export default async function Home() {
  return (
    <>
      <Hero/>
      <main className="side-title">
        <h2 className="font-medium text-xl">Simply log in and get storing!</h2>
      </main>
    </>
  );
}
